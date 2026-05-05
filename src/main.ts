import { OctokitClient } from './service.js';
import {
  Arguments,
  Logger,
  RepositoryStats,
  RepoStatsResult,
  ProcessedPageState,
  RepoProcessingResult,
  OrgContext,
  CommandConfig,
} from './types.js';
import { StateManager } from './state.js';
import { existsSync, unlinkSync, writeFileSync } from 'fs';

import { withRetry, RetryConfig } from './retry.js';
import {
  generateRepoStatsFileName,
  formatElapsedTime,
  applyBatchStaggerDelay,
} from './utils.js';
import { initCommand, executeCommand } from './init.js';
import { parseRepoListInput, hasRepoListInput } from './repo-list.js';
import { isStandaloneRepoListSourceMode } from './repo-stats-source-mode.js';
import {
  processRepoListSource,
  validateRepoListSourceOptions,
} from './repo-list-service.js';
import { getRepoListForBatch } from './repo-stats-batch.js';
import { checkForMissingRepos } from './missing-repos-service.js';
import {
  analyzeRepositoryStats,
  buildProcessedRepoKeySet,
  handleRepoProcessingSuccess,
  initializeCsvFile,
  mapToRepoStatsResult,
  processRepositoryByName,
  writeResultToCsv,
} from './repo-stats-service.js';

export { initializeCsvFile, mapToRepoStatsResult, writeResultToCsv };

// --- Command configuration ---

const repoStatsConfig: CommandConfig = {
  logPrefix: 'repo-stats',
  sourceLabel: 'repo-list',
  supportsInstallationLookup: false,
  summaryLabel: 'PROCESSING',
  generateFileName: generateRepoStatsFileName,
  initializeCsvFile: initializeCsvFile,
  processSource: processRepoListSource,
  processOrg: processOrgRepoStats,
};

// --- Public entry point ---

export async function run(opts: Arguments): Promise<string[]> {
  const isRepoListSourceMode = isStandaloneRepoListSourceMode(opts);
  if (isRepoListSourceMode) {
    validateRepoListSourceOptions(opts);
  }

  // Build batch-aware config if batch mode is enabled
  const config = { ...repoStatsConfig };
  if (!isRepoListSourceMode) {
    config.processSource = undefined;
  }

  if (opts.batchSize != null) {
    const batchIndex = opts.batchIndex ?? 0;
    config.statePrefix = `batch-${batchIndex}`;
    config.generateFileName = (orgName: string) =>
      generateRepoStatsFileName(orgName, batchIndex);

    // Stagger batch start to avoid simultaneous API bursts
    await applyBatchStaggerDelay(batchIndex, opts.batchDelay ?? 0);
  }

  const context = await initCommand(opts, config);
  const result = await executeCommand(context, config);
  return result.outputFiles;
}

// --- Per-org processing (called by shared executeForOrg via config.processOrg) ---

async function processOrgRepoStats(context: OrgContext): Promise<void> {
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

  // Create a state object to track counts that can be modified by reference
  const processingState = {
    successCount: 0,
    retryCount: 0,
  };

  await withRetry(
    async () => {
      const result = await processRepositories({
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
          'All repositories have been processed successfully. Marking state as complete.',
        );
      }

      logger.info(
        `Completed processing ${result.processedCount} repositories. ` +
          `Last cursor: ${result.cursor}, ` +
          `Last repo: ${processedState.lastProcessedRepo}\n` +
          `Start time: ${startTime.toISOString()}\n` +
          `End time: ${endTime.toISOString()}\n` +
          `Total elapsed time: ${elapsedTime}\n` +
          `Consecutive successful operations: ${processingState.successCount}\n` +
          `Total retry attempts: ${processingState.retryCount}\n` +
          `Processing completed successfully: ${processedState.completedSuccessfully}\n` +
          `Output saved to: ${fileName}`,
      );

      stateManager.update(processedState, {});

      // Check for and process missing repositories if enabled
      if (opts.autoProcessMissing && result.isComplete) {
        await processMissingRepositories({
          opts,
          fileName,
          client,
          logger,
          processedState,
          retryConfig,
          stateManager,
        });
      }

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
        `Retry attempt ${state.attempt}: Failed while processing repositories. ` +
          `Current cursor: ${processedState.currentCursor}, ` +
          `Last successful cursor: ${processedState.lastSuccessfulCursor}, ` +
          `Last processed repo: ${processedState.lastProcessedRepo}, ` +
          `Processed repos count: ${processedState.processedRepos.length}, ` +
          `Total retries: ${state.retryCount}, ` +
          `Consecutive successes: ${state.successCount}, ` +
          `Error: ${state.error?.message}\n` +
          `Elapsed time so far: ${formatElapsedTime(startTime, new Date())}`,
      );
      stateManager.update(processedState, {});
    },
  );
}

async function processMissingRepositories({
  opts,
  fileName,
  client,
  logger,
  processedState,
  retryConfig,
  stateManager,
}: {
  opts: Arguments;
  fileName: string;
  client: OctokitClient;
  logger: Logger;
  processedState: ProcessedPageState;
  retryConfig: RetryConfig;
  stateManager: StateManager;
}): Promise<void> {
  logger.info('Checking for missing repositories...');
  const missingReposResult = await checkForMissingRepos({
    opts,
    processedFile: fileName,
  });

  const missingReposCount = missingReposResult.missingRepos.length;
  if (missingReposCount === 0) {
    logger.info(
      'No missing repositories found. All repositories have been processed.',
    );
    return;
  }

  logger.info(
    `Found ${missingReposCount} missing repositories that need to be processed`,
  );

  // Reset completedSuccessfully flag since we're now processing additional repos
  processedState.completedSuccessfully = false;
  stateManager.update(processedState, {});
  logger.debug(
    'Reset completedSuccessfully flag for missing repositories processing',
  );

  // Create temporary file with missing repos
  const missingReposFile = `${opts.orgName!}-missing-repos-${new Date().getTime()}.txt`;
  writeFileSync(
    missingReposFile,
    missingReposResult.missingRepos
      .map((repo) => `${opts.orgName!}/${repo}`)
      .join('\n'),
  );
  logger.info(`Created temporary file with missing repos: ${missingReposFile}`);

  try {
    // Process the missing repos
    logger.info('Processing missing repositories...');
    const missingReposProcessingState = {
      successCount: 0,
      retryCount: 0,
    };

    await withRetry(
      async () => {
        const missingResult = await processRepositoriesFromFile({
          client,
          logger,
          opts: { ...opts, repoList: missingReposFile },
          processedState,
          state: missingReposProcessingState,
          fileName,
          stateManager,
        });

        logger.info(
          `Completed processing ${missingResult.processedCount} out of ${missingReposCount} missing repositories`,
        );

        // Mark as complete if all missing repos were processed
        if (missingResult.isComplete) {
          processedState.completedSuccessfully = true;
          stateManager.update(processedState, {});
          logger.info(
            'All missing repositories processed successfully. Marking state as complete.',
          );
        }

        return missingResult;
      },
      retryConfig,
      (state) => {
        missingReposProcessingState.retryCount++;
        missingReposProcessingState.successCount = 0;
        logger.warn(
          `Retry attempt ${state.attempt}: Failed while processing missing repositories. ` +
            `Error: ${state.error?.message}`,
        );
      },
    );

    logger.info('Completed processing of missing repositories');
  } finally {
    // Clean up temporary file
    if (existsSync(missingReposFile)) {
      unlinkSync(missingReposFile);
      logger.info(`Removed temporary file: ${missingReposFile}`);
    }
  }
}

async function* processRepoStats({
  reposIterator,
  client,
  logger,
  extraPageSize,
  processedState,
  stateManager,
}: {
  reposIterator: AsyncGenerator<RepositoryStats, void, unknown>;
  client: OctokitClient;
  logger: Logger;
  extraPageSize: number;
  processedState: ProcessedPageState;
  stateManager: StateManager;
}): AsyncGenerator<RepoStatsResult> {
  for await (const repo of reposIterator) {
    if (repo.pageInfo?.endCursor) {
      stateManager.update(processedState, {
        newCursor: repo.pageInfo.endCursor,
      });
    }

    const result = await analyzeRepositoryStats({
      repo,
      owner: repo.owner.login,
      extraPageSize,
      client,
      logger,
    });

    yield result;
  }
}

async function processRepositoriesFromFile({
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

  if (!hasRepoListInput(opts.repoList)) {
    throw new Error('Repository list is required and cannot be empty');
  }

  const repoList = parseRepoListInput(opts.repoList).entries.filter(
    ({ owner }) => owner.toLowerCase() === opts.orgName!.toLowerCase(),
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

  const processedRepoKeys = buildProcessedRepoKeySet(processedState);

  for (const entry of repoList) {
    try {
      const identity = entry.repo;
      if (
        processedRepoKeys.has(identity.toLowerCase()) ||
        processedState.processedRepos.includes(identity)
      ) {
        logger.debug(`Skipping already processed repository: ${entry.repo}`);
        continue;
      }

      await processRepositoryByName({
        entry: {
          owner: entry.owner,
          repo: entry.repo,
          key: identity,
        },
        client,
        logger,
        opts,
        processedState,
        processedRepoKeys,
        state,
        processedCount: ++processedCount,
        fileName,
        stateManager,
      });
    } catch (error) {
      state.successCount = 0;
      logger.error(`Failed processing repo ${entry.repo}: ${error}`);
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

async function processRepositories({
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
    `Starting/Resuming from cursor: ${processedState.currentCursor}`,
  );

  // Batch mode: fetch repo names and process only the batch slice
  if (opts.batchSize != null) {
    const batchRepos = await getRepoListForBatch({
      client,
      orgName: opts.orgName!,
      batchSize: opts.batchSize,
      batchIndex: opts.batchIndex ?? 0,
      pageSize: opts.pageSize || 10,
      logger,
      repoListFile: opts.batchRepoListFile,
    });

    if (batchRepos.length === 0) {
      logger.info('No repositories in this batch. Nothing to process.');
      return {
        cursor: null,
        processedRepos: processedState.processedRepos,
        processedCount: 0,
        isComplete: true,
        successCount: state.successCount,
        retryCount: state.retryCount,
      };
    }

    return processRepositoriesFromFile({
      client,
      logger,
      opts: { ...opts, repoList: batchRepos },
      processedState,
      state,
      fileName,
      stateManager,
    });
  }

  if (hasRepoListInput(opts.repoList)) {
    return processRepositoriesFromFile({
      client,
      logger,
      opts,
      processedState,
      state,
      fileName,
      stateManager,
    });
  }

  // Use lastSuccessfulCursor only if cursor is null (first try)
  const startCursor =
    processedState.currentCursor || processedState.lastSuccessfulCursor;
  logger.info(`Using start cursor: ${startCursor}`);

  const reposIterator = client.getOrgRepoStats(
    opts.orgName!,
    opts.pageSize || 10,
    startCursor,
  );

  let processedCount = 0;

  try {
    for await (const result of processRepoStats({
      reposIterator,
      client,
      logger,
      extraPageSize:
        opts.extraPageSize != null ? Number(opts.extraPageSize) : 25,
      processedState,
      stateManager,
    })) {
      try {
        if (processedState.processedRepos.includes(result.Repo_Name)) {
          logger.debug(
            `Skipping already processed repository: ${result.Repo_Name}`,
          );
          continue;
        }

        await writeResultToCsv(result, fileName, logger);

        await handleRepoProcessingSuccess({
          result,
          processedState,
          state,
          opts,
          client,
          logger,
          processedCount: ++processedCount,
          stateManager,
        });
      } catch (error) {
        state.successCount = 0;
        logger.error(`Failed processing repo ${result.Repo_Name}: ${error}`);
        processedState.currentCursor = processedState.lastSuccessfulCursor;
        throw error;
      }
    }

    // If we get here, we've completed the iteration without errors
    logger.info('Successfully completed processing all repositories');
  } catch (error) {
    // If there's an error during iteration, we'll handle it at the caller
    logger.error(`Error during repository processing: ${error}`);
    throw error;
  }

  logger.info(
    'No more repositories to process - processing completed successfully',
  );

  return {
    cursor: processedState.lastSuccessfulCursor,
    processedRepos: processedState.processedRepos,
    processedCount,
    isComplete: true,
    successCount: state.successCount,
    retryCount: state.retryCount,
  };
}
