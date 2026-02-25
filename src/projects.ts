import { OctokitClient } from './service.js';
import {
  Arguments,
  Logger,
  ProcessedPageState,
  RepoProcessingResult,
  ProjectStatsResult,
  OrgContext,
  CommandConfig,
} from './types.js';
import { StateManager } from './state.js';
import { existsSync, readFileSync } from 'fs';

import { withRetry } from './retry.js';
import { generateProjectStatsFileName, formatElapsedTime } from './utils.js';
import {
  initializeCsvFile as initializeCsvFileGeneric,
  appendCsvRow,
  PROJECT_STATS_COLUMNS,
} from './csv.js';
import { initCommand, executeCommand } from './init.js';

// --- Command configuration ---

const projectStatsConfig: CommandConfig = {
  logPrefix: 'project-stats',
  summaryLabel: 'PROJECT-STATS PROCESSING',
  generateFileName: generateProjectStatsFileName,
  initializeCsvFile: initializeProjectStatsCsvFile,
  processOrg: processOrgProjectStats,
  statePrefix: 'projects',
};

// --- Public entry point ---

export async function runProjectStats(opts: Arguments): Promise<string[]> {
  const context = await initCommand(opts, projectStatsConfig);
  const result = await executeCommand(context, projectStatsConfig);
  return result.outputFiles;
}

// --- Per-org processing (called by shared executeForOrg via config.processOrg) ---

async function processOrgProjectStats(context: OrgContext): Promise<void> {
  const {
    opts,
    logger,
    client,
    fileName,
    processedState,
    retryConfig,
    stateManager,
  } = context;

  const startTime = new Date();
  logger.info(`Started processing at: ${startTime.toISOString()}`);

  const processingState = {
    successCount: 0,
    retryCount: 0,
  };

  await withRetry(
    async () => {
      const result = await processProjectStats({
        client,
        logger,
        opts,
        processedState,
        state: processingState,
        fileName,
        stateManager,
      });

      const endTime = new Date();
      const elapsedTime = formatElapsedTime(startTime, endTime);

      if (result.isComplete) {
        processedState.completedSuccessfully = true;
        logger.info('All repositories have been processed successfully.');
      }

      logger.info(
        `Completed processing ${result.processedCount} repositories. ` +
          `Start time: ${startTime.toISOString()}\n` +
          `End time: ${endTime.toISOString()}\n` +
          `Total elapsed time: ${elapsedTime}\n` +
          `Consecutive successful operations: ${processingState.successCount}\n` +
          `Total retry attempts: ${processingState.retryCount}\n` +
          `Output saved to: ${fileName}`,
      );

      stateManager.update(processedState, {});

      // Clean up state file if requested and processing completed successfully
      if (opts.cleanState && result.isComplete) {
        stateManager.cleanup();
      }

      return result;
    },
    retryConfig,
    (state) => {
      processingState.retryCount++;
      processingState.successCount = 0;
      logger.warn(
        `Retry attempt ${state.attempt}: Failed while processing. ` +
          `Last processed repo: ${processedState.lastProcessedRepo}, ` +
          `Processed repos count: ${processedState.processedRepos.length}, ` +
          `Error: ${state.error?.message}\n` +
          `Elapsed time so far: ${formatElapsedTime(startTime, new Date())}`,
      );
      stateManager.update(processedState, {});
    },
  );
}

// --- Repository processing ---

async function processProjectStats({
  client,
  logger,
  opts,
  processedState,
  state,
  fileName,
  stateManager,
}: {
  client: OctokitClient;
  logger: Logger;
  opts: Arguments;
  processedState: ProcessedPageState;
  state: { successCount: number; retryCount: number };
  fileName: string;
  stateManager: StateManager;
}): Promise<RepoProcessingResult> {
  logger.debug(`Starting/Resuming processing for ${opts.orgName}`);

  if (opts.repoList && opts.repoList.length > 0) {
    return processProjectStatsFromFile({
      client,
      logger,
      opts,
      processedState,
      state,
      fileName,
      stateManager,
    });
  }

  return processProjectStatsFromOrg({
    client,
    logger,
    opts,
    processedState,
    state,
    fileName,
    stateManager,
  });
}

async function processProjectStatsFromFile({
  client,
  logger,
  opts,
  processedState,
  state,
  fileName,
  stateManager,
}: {
  client: OctokitClient;
  logger: Logger;
  opts: Arguments;
  processedState: ProcessedPageState;
  state: { successCount: number; retryCount: number };
  fileName: string;
  stateManager: StateManager;
}): Promise<RepoProcessingResult> {
  logger.info(`Processing repositories from list: ${opts.repoList}`);

  if (!opts.repoList || opts.repoList.length === 0) {
    throw new Error('Repository list is required and cannot be empty');
  }

  const repoListRaw = Array.isArray(opts.repoList)
    ? opts.repoList
    : readFileSync(opts.repoList, 'utf-8').split('\n');

  const repoList = repoListRaw
    .filter((line) => line.trim() !== '' && !line.trim().startsWith('#'))
    .map((line, index) => {
      const trimmed = line.trim();
      const segments = trimmed.split('/');

      if (
        segments.length !== 2 ||
        !segments[0]?.trim() ||
        !segments[1]?.trim()
      ) {
        logger.warn(
          `Skipping invalid repo entry on line ${
            index + 1
          }: "${trimmed}". Expected format "owner/repo".`,
        );
        return null;
      }

      const owner = segments[0].trim();
      const repo = segments[1].trim();

      return { owner, repo };
    })
    .filter(
      (
        entry,
      ): entry is {
        owner: string;
        repo: string;
      } =>
        entry !== null &&
        entry.owner.toLowerCase() === opts.orgName!.toLowerCase(),
    );

  logger.info(
    `Filtered to ${repoList.length} repositories for organization: ${opts.orgName}`,
  );

  if (repoList.length === 0) {
    logger.info(
      `No repositories in the list belong to organization: ${opts.orgName}`,
    );
    return {
      cursor: null,
      processedRepos: processedState.processedRepos,
      processedCount: 0,
      isComplete: true,
      successCount: state.successCount,
      retryCount: state.retryCount,
    };
  }

  let processedCount = 0;

  for (const { owner, repo } of repoList) {
    try {
      if (processedState.processedRepos.includes(repo)) {
        logger.debug(`Skipping already processed repository: ${repo}`);
        continue;
      }

      const result = await client.getRepoProjectCounts(
        owner,
        repo,
        opts.pageSize != null ? Number(opts.pageSize) : 100,
        (pageNumber, issuesInPage) => {
          logger.info(
            `${owner}/${repo} - processed page ${pageNumber} (${issuesInPage} issues)`,
          );
        },
      );

      writeProjectStatsToCsv(result, fileName, logger);

      await handleProjectStatsSuccess({
        repoName: repo,
        processedState,
        state,
        opts,
        logger,
        processedCount: ++processedCount,
        stateManager,
        client,
      });
    } catch (error) {
      state.successCount = 0;
      logger.error(`Failed processing repo ${repo}: ${error}`);
      throw error;
    }
  }

  return {
    cursor: null,
    processedRepos: processedState.processedRepos,
    processedCount,
    isComplete: true,
    successCount: state.successCount,
    retryCount: state.retryCount,
  };
}

function loadRepoNamesFromFile(filePath: string, logger: Logger): string[] {
  logger.info(`Loading repository names from file: ${filePath}`);

  const content = readFileSync(filePath, 'utf-8');
  const names = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));

  logger.info(`Loaded ${names.length} repository names from file`);

  return names;
}

async function* repoNamesFromFileIterator(
  filePath: string,
  logger: Logger,
): AsyncGenerator<{ name: string }> {
  const names = loadRepoNamesFromFile(filePath, logger);
  for (const name of names) {
    yield { name };
  }
}

async function processProjectStatsFromOrg({
  client,
  logger,
  opts,
  processedState,
  state,
  fileName,
  stateManager,
}: {
  client: OctokitClient;
  logger: Logger;
  opts: Arguments;
  processedState: ProcessedPageState;
  state: { successCount: number; retryCount: number };
  fileName: string;
  stateManager: StateManager;
}): Promise<RepoProcessingResult> {
  const orgName = opts.orgName!;
  const pageSize = opts.pageSize != null ? Number(opts.pageSize) : 100;

  let reposIterator: AsyncGenerator<{ name: string }>;

  if (opts.repoNamesFile && existsSync(opts.repoNamesFile)) {
    reposIterator = repoNamesFromFileIterator(opts.repoNamesFile, logger);
  } else {
    if (opts.repoNamesFile) {
      logger.warn(
        `Repo names file not found: ${opts.repoNamesFile}. Falling back to querying GitHub.`,
      );
    }
    logger.info(`Iterating repositories for organization: ${orgName}`);
    reposIterator = client.listOrgRepoNames(orgName, pageSize);
  }

  let processedCount = 0;

  for await (const repo of reposIterator) {
    const repoName = repo.name;

    if (processedState.processedRepos.includes(repoName)) {
      logger.debug(`Skipping already processed repository: ${repoName}`);
      continue;
    }

    try {
      logger.info(
        `Fetching project counts for repository: ${orgName}/${repoName}`,
      );

      const result = await client.getRepoProjectCounts(
        orgName,
        repoName,
        pageSize,
        (pageNumber, issuesInPage) => {
          logger.info(
            `${orgName}/${repoName} - processed page ${pageNumber} (${issuesInPage} issues)`,
          );
        },
      );

      logger.info(
        `Writing results for ${orgName}/${repoName} ` +
          `(issues linked: ${result.Issues_Linked_To_Projects}, ` +
          `unique projects: ${result.Unique_Projects_Linked_By_Issues}, ` +
          `repo projects: ${result.Projects_Linked_To_Repo})`,
      );

      writeProjectStatsToCsv(result, fileName, logger);

      await handleProjectStatsSuccess({
        repoName,
        processedState,
        state,
        opts,
        logger,
        processedCount: ++processedCount,
        stateManager,
        client,
      });

      logger.info(
        `Successfully processed repository ${processedCount}: ${orgName}/${repoName}`,
      );
    } catch (error) {
      state.successCount = 0;
      logger.error(`Failed processing repo ${repoName}: ${error}`);
      throw error;
    }
  }

  logger.info(
    `Finished iterating all repositories for ${orgName}. ` +
      `Total processed: ${processedCount}, ` +
      `Total skipped (already processed): ${processedState.processedRepos.length - processedCount}`,
  );

  return {
    cursor: null,
    processedRepos: processedState.processedRepos,
    processedCount,
    isComplete: true,
    successCount: state.successCount,
    retryCount: state.retryCount,
  };
}

// --- Helpers ---

async function handleProjectStatsSuccess({
  repoName,
  processedState,
  state,
  opts,
  logger,
  processedCount,
  stateManager,
  client,
}: {
  repoName: string;
  processedState: ProcessedPageState;
  state: { successCount: number; retryCount: number };
  opts: Arguments;
  logger: Logger;
  processedCount: number;
  stateManager: StateManager;
  client: OctokitClient;
}): Promise<void> {
  const successThreshold = opts.retrySuccessThreshold || 5;

  state.successCount++;
  if (state.successCount >= successThreshold && state.retryCount > 0) {
    logger.info(
      `Reset retry count after ${state.successCount} successful operations`,
    );
    state.retryCount = 0;
    state.successCount = 0;
  }

  stateManager.update(processedState, {
    repoName,
    lastSuccessfulCursor: processedState.currentCursor,
  });

  // Check rate limits after configured interval
  if (processedCount % (opts.rateLimitCheckInterval || 10) === 0) {
    logger.debug(
      `Checking rate limits after processing ${processedCount} repositories`,
    );
    const rateLimits = await client.checkRateLimits();

    if (
      rateLimits.graphQLRemaining === 0 ||
      rateLimits.apiRemainingRequest === 0
    ) {
      const limitType =
        rateLimits.graphQLRemaining === 0 ? 'GraphQL' : 'REST API';
      logger.warn(
        `${limitType} rate limit reached after processing ${processedCount} repositories`,
      );

      if (rateLimits.messageType === 'error') {
        logger.error(rateLimits.message);
        throw new Error(
          `${limitType} rate limit exceeded and maximum retries reached`,
        );
      }

      logger.warn(rateLimits.message);
      throw new Error(
        'Rate limit reached. Processing will be paused until limits reset.',
      );
    } else {
      logger.info(
        `GraphQL remaining: ${rateLimits.graphQLRemaining}, REST API remaining: ${rateLimits.apiRemainingRequest}`,
      );
    }
  }

  logger.debug(`Processed ${processedCount} repositories so far`);
}

export function initializeProjectStatsCsvFile(
  fileName: string,
  logger: Logger,
): void {
  initializeCsvFileGeneric(fileName, PROJECT_STATS_COLUMNS, logger);
}

export function writeProjectStatsToCsv(
  result: ProjectStatsResult,
  fileName: string,
  logger: Logger,
): void {
  try {
    const values = [
      result.Org_Name,
      result.Repo_Name,
      result.Issues_Linked_To_Projects,
      result.Unique_Projects_Linked_By_Issues,
      result.Projects_Linked_To_Repo,
    ];

    appendCsvRow(fileName, values, logger);

    logger.debug(`Wrote result for ${result.Org_Name}/${result.Repo_Name}`);
  } catch (error) {
    logger.error(
      `Error writing CSV for ${result.Org_Name}/${result.Repo_Name}: ${error}`,
    );
    throw error;
  }
}
