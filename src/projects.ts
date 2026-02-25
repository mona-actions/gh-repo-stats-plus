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
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'fs';

import { withRetry } from './retry.js';
import {
  generateProjectStatsFileName,
  formatElapsedTime,
  escapeCsvField,
} from './utils.js';
import { initCommand, executeCommand } from './init.js';

// --- CSV columns ---

const PROJECT_STATS_COLUMNS = [
  'Org_Name',
  'Repo_Name',
  'Issues_Linked_To_Projects',
  'Unique_Projects_Linked_By_Issues',
  'Projects_Linked_To_Repo',
];

// --- Command configuration ---

const projectStatsConfig: CommandConfig = {
  logPrefix: 'project-stats',
  summaryLabel: 'PROJECT-STATS PROCESSING',
  generateFileName: generateProjectStatsFileName,
  initializeCsvFile: initializeProjectStatsCsvFile,
  processOrg: processOrgProjectStats,
};

// --- Public entry point ---

export async function runProjectStats(opts: Arguments): Promise<void> {
  const context = await initCommand(opts, projectStatsConfig);
  await executeCommand(context, projectStatsConfig);
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
  logger.info(
    `[project-stats] Started processing at: ${startTime.toISOString()}`,
  );

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
        logger.info(
          '[project-stats] All repositories have been processed successfully.',
        );
      }

      logger.info(
        `[project-stats] Completed processing ${result.processedCount} repositories. ` +
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
        `[project-stats] Retry attempt ${state.attempt}: Failed while processing. ` +
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
  logger.debug(
    `[project-stats] Starting/Resuming processing for ${opts.orgName}`,
  );

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
  logger.info(
    `[project-stats] Processing repositories from list: ${opts.repoList}`,
  );

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
          `[project-stats] Skipping invalid repo entry on line ${
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
    `[project-stats] Filtered to ${repoList.length} repositories for organization: ${opts.orgName}`,
  );

  if (repoList.length === 0) {
    logger.info(
      `[project-stats] No repositories in the list belong to organization: ${opts.orgName}`,
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
        logger.debug(
          `[project-stats] Skipping already processed repository: ${repo}`,
        );
        continue;
      }

      const result = await client.getRepoProjectCounts(
        owner,
        repo,
        opts.pageSize != null ? Number(opts.pageSize) : 100,
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
      logger.error(`[project-stats] Failed processing repo ${repo}: ${error}`);
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
  logger.info(
    `[project-stats] Loading repository names from file: ${filePath}`,
  );

  const content = readFileSync(filePath, 'utf-8');
  const names = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));

  logger.info(
    `[project-stats] Loaded ${names.length} repository names from file`,
  );

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
        `[project-stats] Repo names file not found: ${opts.repoNamesFile}. Falling back to querying GitHub.`,
      );
    }
    logger.info(
      `[project-stats] Iterating repositories for organization: ${orgName}`,
    );
    reposIterator = client.listOrgRepoNames(orgName, pageSize);
  }

  let processedCount = 0;

  for await (const repo of reposIterator) {
    const repoName = repo.name;

    if (processedState.processedRepos.includes(repoName)) {
      logger.debug(
        `[project-stats] Skipping already processed repository: ${repoName}`,
      );
      continue;
    }

    try {
      const result = await client.getRepoProjectCounts(
        orgName,
        repoName,
        pageSize,
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
    } catch (error) {
      state.successCount = 0;
      logger.error(
        `[project-stats] Failed processing repo ${repoName}: ${error}`,
      );
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
      `[project-stats] Reset retry count after ${state.successCount} successful operations`,
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
      `[project-stats] Checking rate limits after processing ${processedCount} repositories`,
    );
    const rateLimits = await client.checkRateLimits();

    if (
      rateLimits.graphQLRemaining === 0 ||
      rateLimits.apiRemainingRequest === 0
    ) {
      const limitType =
        rateLimits.graphQLRemaining === 0 ? 'GraphQL' : 'REST API';
      logger.warn(
        `[project-stats] ${limitType} rate limit reached after processing ${processedCount} repositories`,
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
        `[project-stats] GraphQL remaining: ${rateLimits.graphQLRemaining}, REST API remaining: ${rateLimits.apiRemainingRequest}`,
      );
    }
  }

  logger.debug(
    `[project-stats] Processed ${processedCount} repositories so far`,
  );
}

export function initializeProjectStatsCsvFile(
  fileName: string,
  logger: Logger,
): void {
  if (!existsSync(fileName)) {
    logger.info(`[project-stats] Creating new CSV file: ${fileName}`);
    const headerRow = `${PROJECT_STATS_COLUMNS.join(',')}\n`;
    writeFileSync(fileName, headerRow);
  } else {
    logger.info(`[project-stats] Using existing CSV file: ${fileName}`);
  }
}

export function writeProjectStatsToCsv(
  result: ProjectStatsResult,
  fileName: string,
  logger: Logger,
): void {
  try {
    const values = [
      escapeCsvField(result.Org_Name),
      escapeCsvField(result.Repo_Name),
      result.Issues_Linked_To_Projects,
      result.Unique_Projects_Linked_By_Issues,
      result.Projects_Linked_To_Repo,
    ];

    const csvRow = `${values.join(',')}\n`;
    appendFileSync(fileName, csvRow);

    logger.debug(
      `[project-stats] Wrote result for ${result.Org_Name}/${result.Repo_Name}`,
    );
  } catch (error) {
    logger.error(
      `[project-stats] Error writing CSV for ${result.Org_Name}/${result.Repo_Name}: ${error}`,
    );
    throw error;
  }
}
