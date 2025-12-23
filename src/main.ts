import { OctokitClient } from './service.js';
import { createOctokit } from './octokit.js';
import {
  Arguments,
  IssuesConnection,
  IssueStatsResult,
  Logger,
  PullRequestsConnection,
  PullRequestStatsResult,
  RepositoryStats,
  RepoStatsResult,
  ProcessedPageState,
  RepoProcessingResult,
} from './types.js';
import { createLogger, logInitialization } from './logger.js';
import { createAuthConfig } from './auth.js';
import { StateManager } from './state.js';
import {
  appendFileSync,
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'fs';

import { withRetry, RetryConfig } from './retry.js';
import {
  generateRepoStatsFileName,
  convertKbToMb,
  checkIfHasMigrationIssues,
  formatElapsedTime,
  resolveOutputPath,
} from './utils.js';
import { parse } from 'csv-parse/sync';

interface ProcessingContext {
  opts: Arguments;
  logger: Logger;
  client: OctokitClient;
  fileName: string;
  processedState: ProcessedPageState;
  retryConfig: RetryConfig;
  stateManager: StateManager;
}

const _init = async (
  opts: Arguments,
): Promise<ProcessingContext> => {
  const logFileName = `${opts.orgName!}-repo-stats-${
    new Date().toISOString().split('T')[0]
  }.log`;
  const logger = await createLogger(opts.verbose, logFileName);
  logInitialization.start(logger);

  logInitialization.auth(logger);
  const authConfig = createAuthConfig({ ...opts, logger: logger });

  logInitialization.octokit(logger);
  const octokit = createOctokit(
    authConfig,
    opts.baseUrl,
    opts.proxyUrl,
    logger,
  );

  const client = new OctokitClient(octokit);

  const outputDir = opts.outputDir || 'output';
  const stateManager = new StateManager(outputDir, opts.orgName!, logger);

  logger.debug(
    `resumeFromLastSave option value: ${
      opts.resumeFromLastSave
    } (type: ${typeof opts.resumeFromLastSave})`,
  );

  const { processedState, resumeFromLastState } = stateManager.initialize(
    opts.resumeFromLastSave || false,
  );

  let fileName = '';
  if (resumeFromLastState) {
    fileName = processedState.outputFileName || '';
    logger.info(`Resuming from last state. Using existing file: ${fileName}`);
  } else {
    const baseFileName = generateRepoStatsFileName(opts.orgName!);
    fileName = await resolveOutputPath(opts.outputDir, baseFileName);

    initializeCsvFile(fileName, logger);
    logger.info(`Results will be saved to file: ${fileName}`);

    processedState.outputFileName = fileName;
    stateManager.update(processedState, {});
  }

  const retryConfig: RetryConfig = {
    maxAttempts: opts.retryMaxAttempts || 3,
    initialDelayMs: opts.retryInitialDelay || 1000,
    maxDelayMs: opts.retryMaxDelay || 30000,
    backoffFactor: opts.retryBackoffFactor || 2,
    successThreshold: opts.retrySuccessThreshold || 5,
  };

  return {
    opts,
    logger,
    client,
    fileName,
    processedState,
    retryConfig,
    stateManager,
  };
};

export async function run(opts: Arguments): Promise<void> {
  const {
    logger,
    client,
    fileName,
    processedState,
    retryConfig,
    stateManager,
  } = await _init(opts);
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

/**
 * Processes multiple GitHub organizations sequentially, collecting repository statistics for each.
 *
 * Reads a list of organizations from a file, then for each organization:
 *   - Runs the main processing logic (see `run` function) for that organization.
 *   - Waits for a configurable delay between organizations.
 *   - Handles errors according to the `continueOnError` option.
 *
 * @param {Arguments} opts - The options for multi-organization processing.
 * @param {string} opts.orgList - Path to a file containing a list of organizations (one per line).
 * @param {number} [opts.delayBetweenOrgs=5] - Delay in seconds between processing each organization.
 * @param {boolean} [opts.continueOnError=false] - Whether to continue processing remaining organizations if an error occurs.
 * @param {Function} [runFn=run] - Function to process each organization. Defaults to `run`. Used primarily for testing.
 * @throws {Error} If the organization list file is missing or empty.
 * @returns {Promise<void>} Resolves when all organizations have been processed.
 *
 * Notes:
 * - The function logs progress and errors using the logger.
 * - Organization list file may contain comments (lines starting with '#') and empty lines, which are ignored.
 * - Each organization's processing is isolated; errors can be skipped or halt the process based on options.
 * - Organizations are processed strictly sequentially to respect rate limits and provide predictable resource usage.
 */
export async function runMultiOrg(
  opts: Arguments,
  runFn: (opts: Arguments) => Promise<void> = run,
): Promise<void> {
  const { orgList, delayBetweenOrgs = 5, continueOnError = false } = opts;

  if (!orgList) {
    throw new Error(
      'Organization list file path is required for multi-org processing',
    );
  }

  // Validate that the org list file exists
  if (!existsSync(orgList)) {
    throw new Error(`Organization list file not found: ${orgList}`);
  }

  // Read and parse the organization list
  const orgListContent = readFileSync(orgList, 'utf-8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#')); // Filter empty lines and comments

  if (orgListContent.length === 0) {
    throw new Error(`No organizations found in file: ${orgList}`);
  }

  // Create a summary logger for the multi-org process
  const summaryLogger = await createLogger(
    opts.verbose || false,
    `multi-org-summary-${new Date().toISOString().split('T')[0]}.log`,
  );

  summaryLogger.info(
    `Starting processing of ${orgListContent.length} organizations`,
  );
  summaryLogger.info(`Organizations to process: ${orgListContent.join(', ')}`);

  // Log estimated completion time based on delay between orgs
  if (orgListContent.length > 1 && delayBetweenOrgs > 0) {
    const estimatedDelayMinutes = Math.ceil(
      ((orgListContent.length - 1) * delayBetweenOrgs) / 60,
    );
    summaryLogger.info(
      `Estimated minimum time (delays only): ${estimatedDelayMinutes} minutes`,
    );
    summaryLogger.info(
      `Note: Actual processing time will be longer depending on repository counts`,
    );
  }

  const results: Array<{
    org: string;
    success: boolean;
    error?: string;
    startTime: Date;
    endTime?: Date;
  }> = [];

  let totalSuccessful = 0;
  let totalFailed = 0;

  for (const [index, orgName] of orgListContent.entries()) {
    const orgStartTime = new Date();
    summaryLogger.info(
      `[${index + 1}/${
        orgListContent.length
      }] Starting processing for organization: ${orgName}`,
    );

    try {
      // Create organization-specific options
      const orgOptions: Arguments = {
        ...opts,
        orgName: orgName,
        orgList: undefined, // Clear orgList to prevent infinite recursion
      };

      // Process the organization using the injected function
      await runFn(orgOptions);

      const orgEndTime = new Date();
      const duration = (orgEndTime.getTime() - orgStartTime.getTime()) / 1000;

      results.push({
        org: orgName,
        success: true,
        startTime: orgStartTime,
        endTime: orgEndTime,
      });

      totalSuccessful++;
      summaryLogger.info(
        `[${index + 1}/${
          orgListContent.length
        }] Successfully completed processing for organization: ${orgName} (${duration}s)`,
      );

      // Add delay between organizations (except for the last one)
      if (index < orgListContent.length - 1 && delayBetweenOrgs > 0) {
        summaryLogger.info(
          `Waiting ${delayBetweenOrgs} seconds before processing next organization...`,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, delayBetweenOrgs * 1000),
        );
      }
    } catch (error) {
      const orgEndTime = new Date();
      const duration = (orgEndTime.getTime() - orgStartTime.getTime()) / 1000;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      results.push({
        org: orgName,
        success: false,
        error: errorMessage,
        startTime: orgStartTime,
        endTime: orgEndTime,
      });

      totalFailed++;
      summaryLogger.error(
        `[${index + 1}/${
          orgListContent.length
        }] Failed to process organization: ${orgName} (${duration}s) - Error: ${errorMessage}`,
      );

      if (!continueOnError) {
        summaryLogger.error(
          'Stopping processing due to error (use --continue-on-error to continue)',
        );
        throw error;
      } else {
        summaryLogger.warn(
          'Continuing with next organization due to --continue-on-error flag',
        );

        // Still add delay even after error (except for the last one)
        if (index < orgListContent.length - 1 && delayBetweenOrgs > 0) {
          summaryLogger.info(
            `Waiting ${delayBetweenOrgs} seconds before processing next organization...`,
          );
          await new Promise((resolve) =>
            setTimeout(resolve, delayBetweenOrgs * 1000),
          );
        }
      }
    }
  }

  // Log final summary
  const totalProcessed = totalSuccessful + totalFailed;
  summaryLogger.info('\n' + '='.repeat(80));
  summaryLogger.info('MULTI-ORG PROCESSING SUMMARY');
  summaryLogger.info('='.repeat(80));
  summaryLogger.info(`Total organizations processed: ${totalProcessed}`);
  summaryLogger.info(`Successful: ${totalSuccessful}`);
  summaryLogger.info(`Failed: ${totalFailed}`);
  summaryLogger.info(
    totalProcessed > 0
      ? `Success rate: ${((totalSuccessful / totalProcessed) * 100).toFixed(1)}%`
      : 'Success rate: N/A',
  );
  summaryLogger.info('\nDetailed Results:');

  for (const result of results) {
    const duration = result.endTime
      ? (
          (result.endTime.getTime() - result.startTime.getTime()) /
          1000
        ).toFixed(1)
      : 'N/A';
    const status = result.success ? '✅ SUCCESS' : '❌ FAILED';
    const errorInfo = result.error ? ` - ${result.error}` : '';

    summaryLogger.info(`  ${result.org}: ${status} (${duration}s)${errorInfo}`);
  }

  summaryLogger.info('='.repeat(80));

  // If there were failures and we continued, inform about them
  if (totalFailed > 0 && continueOnError) {
    summaryLogger.warn(
      `⚠️  ${totalFailed} organization(s) failed processing. Check individual logs for details.`,
    );
  }
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

function initializeCsvFile(fileName: string, logger: Logger): void {
  const columns = [
    'Org_Name',
    'Repo_Name',
    'Is_Empty',
    'Last_Push',
    'Last_Update',
    'isFork',
    'isArchived',
    'Repo_Size_mb',
    'Record_Count',
    'Collaborator_Count',
    'Protected_Branch_Count',
    'PR_Review_Count',
    'Milestone_Count',
    'Issue_Count',
    'PR_Count',
    'PR_Review_Comment_Count',
    'Commit_Comment_Count',
    'Issue_Comment_Count',
    'Issue_Event_Count',
    'Release_Count',
    'Project_Count',
    'Branch_Count',
    'Tag_Count',
    'Discussion_Count',
    'Has_Wiki',
    'Full_URL',
    'Migration_Issue',
    'Created',
  ];

  if (!existsSync(fileName)) {
    logger.info(`Creating new CSV file: ${fileName}`);
    // Create header row using same approach as data rows
    const headerRow = `${columns.join(',')}\n`;
    writeFileSync(fileName, headerRow);
  } else {
    logger.info(`Using existing CSV file: ${fileName}`);
  }
}

async function analyzeRepositoryStats({
  repo,
  owner,
  extraPageSize,
  client,
  logger,
}: {
  repo: RepositoryStats;
  owner: string;
  extraPageSize: number;
  client: OctokitClient;
  logger: Logger;
}): Promise<RepoStatsResult> {
  // Run issue and PR analysis concurrently
  const [issueStats, prStats] = await Promise.all([
    analyzeIssues({
      owner,
      repo: repo.name,
      per_page: extraPageSize,
      issues: repo.issues,
      client,
      logger,
    }),
    analyzePullRequests({
      owner,
      repo: repo.name,
      per_page: extraPageSize,
      pullRequests: repo.pullRequests,
      client,
      logger,
    }),
  ]);

  return mapToRepoStatsResult(repo, issueStats, prStats);
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

async function handleRepoProcessingSuccess({
  result,
  processedState,
  state,
  opts,
  client,
  logger,
  processedCount,
  currentCursor = null,
  stateManager,
}: {
  result: RepoStatsResult;
  processedState: ProcessedPageState;
  state: { successCount: number; retryCount: number };
  opts: Arguments;
  client: OctokitClient;
  logger: Logger;
  processedCount: number;
  currentCursor?: string | null;
  stateManager: StateManager;
}): Promise<void> {
  const successThreshold = opts.retrySuccessThreshold || 5;

  // Track successful processing
  state.successCount++;
  if (state.successCount >= successThreshold && state.retryCount > 0) {
    logger.info(
      `Reset retry count after ${state.successCount} successful operations`,
    );
    state.retryCount = 0;
    state.successCount = 0;
  }

  stateManager.update(processedState, {
    repoName: result.Repo_Name,
    lastSuccessfulCursor: currentCursor,
  });

  // Check rate limits after configured interval
  if (processedCount % (opts.rateLimitCheckInterval || 10) === 0) {
    const rateLimitReached = await checkAndHandleRateLimits({
      client,
      logger,
      processedCount,
    });

    if (rateLimitReached) {
      throw new Error(
        'Rate limit reached. Processing will be paused until limits reset.',
      );
    }
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

  if (!opts.repoList) {
    throw new Error('Repository list file path is required');
  }

  const repoList = readFileSync(opts.repoList, 'utf-8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [owner, repo] = line.trim().split('/');
      return { owner, repo };
    });

  let processedCount = 0;

  for (const { owner, repo } of repoList) {
    try {
      if (processedState.processedRepos.includes(repo)) {
        logger.debug(`Skipping already processed repository: ${repo}`);
        continue;
      }

      const repoStats = await client.getRepoStats(
        owner,
        repo,
        opts.pageSize != null ? Number(opts.pageSize) : 10,
      );

      const result = await analyzeRepositoryStats({
        repo: repoStats,
        owner,
        extraPageSize:
          opts.extraPageSize != null ? Number(opts.extraPageSize) : 25,
        client,
        logger,
      });

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

  if (opts.repoList) {
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
  let iterationComplete = false;

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
          currentCursor: processedState.currentCursor,
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
    iterationComplete = true;
    logger.info('Successfully completed processing all repositories');
  } catch (error) {
    // If there's an error during iteration, we'll handle it at the caller
    logger.error(`Error during repository processing: ${error}`);
    throw error;
  }

  // Simple completion logic: if we've successfully iterated through all repositories, we're done
  const isComplete = iterationComplete;

  if (isComplete) {
    logger.info(
      'No more repositories to process - processing completed successfully',
    );
  }

  return {
    cursor: processedState.lastSuccessfulCursor,
    processedRepos: processedState.processedRepos,
    processedCount,
    isComplete,
    successCount: state.successCount,
    retryCount: state.retryCount,
  };
}

async function checkAndHandleRateLimits({
  client,
  logger,
  processedCount,
}: {
  client: OctokitClient;
  logger: Logger;
  processedCount: number;
}): Promise<boolean> {
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
    logger.info(`GraphQL remaining: ${rateLimits.graphQLRemaining}`);
    logger.info(`REST API remaining: ${rateLimits.apiRemainingRequest}`);

    return true; // indicates rate limit was reached
  } else {
    logger.info(
      `GraphQL remaining: ${rateLimits.graphQLRemaining}, REST API remaining: ${rateLimits.apiRemainingRequest}`,
    );
  }

  return false; // indicates rate limit was not reached
}

async function writeResultToCsv(
  result: RepoStatsResult,
  fileName: string,
  logger: Logger,
): Promise<void> {
  try {
    const formattedResult = {
      ...result,
      Is_Empty: result.Is_Empty?.toString().toUpperCase() || 'FALSE',
      isFork: result.isFork?.toString().toUpperCase() || 'FALSE',
      isArchived: result.isArchived?.toString().toUpperCase() || 'FALSE',
      Has_Wiki: result.Has_Wiki?.toString().toUpperCase() || 'FALSE',
      Migration_Issue:
        result.Migration_Issue?.toString().toUpperCase() || 'FALSE',
    };

    // Create CSV row manually to maintain strict order
    const values = [
      formattedResult.Org_Name,
      formattedResult.Repo_Name,
      formattedResult.Is_Empty,
      formattedResult.Last_Push,
      formattedResult.Last_Update,
      formattedResult.isFork,
      formattedResult.isArchived,
      formattedResult.Repo_Size_mb,
      formattedResult.Record_Count,
      formattedResult.Collaborator_Count,
      formattedResult.Protected_Branch_Count,
      formattedResult.PR_Review_Count,
      formattedResult.Milestone_Count,
      formattedResult.Issue_Count,
      formattedResult.PR_Count,
      formattedResult.PR_Review_Comment_Count,
      formattedResult.Commit_Comment_Count,
      formattedResult.Issue_Comment_Count,
      formattedResult.Issue_Event_Count,
      formattedResult.Release_Count,
      formattedResult.Project_Count,
      formattedResult.Branch_Count,
      formattedResult.Tag_Count,
      formattedResult.Discussion_Count,
      formattedResult.Has_Wiki,
      formattedResult.Full_URL,
      formattedResult.Migration_Issue,
      formattedResult.Created,
    ].map((value) =>
      // Escape values containing commas with quotes
      value?.toString().includes(',') ? `"${value}"` : (value ?? ''),
    );

    const csvRow = `${values.join(',')}\n`;
    appendFileSync(fileName, csvRow);

    logger.info(
      `Successfully wrote result for repository: ${result.Repo_Name}`,
    );
  } catch (error) {
    logger.error(
      `Failed to write CSV for repository ${result.Repo_Name}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    throw error;
  }
}

function mapToRepoStatsResult(
  repo: RepositoryStats,
  issueStats: IssueStatsResult,
  prStats: PullRequestStatsResult,
): RepoStatsResult {
  const repoSizeMb = convertKbToMb(repo.diskUsage);
  const totalRecordCount = calculateRecordCount(repo, issueStats, prStats);
  const hasMigrationIssues = checkIfHasMigrationIssues({
    repoSizeMb,
    totalRecordCount,
  });

  return {
    Org_Name: repo.owner.login.toLowerCase(),
    Repo_Name: repo.name.toLowerCase(),
    Is_Empty: repo.isEmpty,
    Last_Push: repo.pushedAt,
    Last_Update: repo.updatedAt,
    isFork: repo.isFork,
    isArchived: repo.isArchived,
    Repo_Size_mb: repoSizeMb,
    Record_Count: totalRecordCount,
    Collaborator_Count: repo.collaborators.totalCount,
    Protected_Branch_Count: repo.branchProtectionRules.totalCount,
    PR_Review_Count: prStats.prReviewCount,
    PR_Review_Comment_Count: prStats.prReviewCommentCount,
    Commit_Comment_Count: repo.commitComments.totalCount,
    Milestone_Count: repo.milestones.totalCount,
    PR_Count: repo.pullRequests.totalCount,
    Project_Count: repo.projectsV2.totalCount,
    Branch_Count: repo.branches.totalCount,
    Release_Count: repo.releases.totalCount,
    Issue_Count: issueStats.totalIssuesCount,
    Issue_Event_Count: issueStats.issueEventCount + prStats.issueEventCount,
    Issue_Comment_Count:
      issueStats.issueCommentCount + prStats.issueCommentCount,
    Tag_Count: repo.tags.totalCount,
    Discussion_Count: repo.discussions.totalCount,
    Has_Wiki: repo.hasWikiEnabled,
    Full_URL: repo.url,
    Migration_Issue: hasMigrationIssues,
    Created: repo.createdAt,
  };
}

function calculateRecordCount(
  repo: RepositoryStats,
  issueStats: IssueStatsResult,
  prStats: PullRequestStatsResult,
): number {
  // Match exactly how the bash script calculates record count (line 918)
  return (
    repo.collaborators.totalCount +
    repo.branchProtectionRules.totalCount +
    prStats.prReviewCount +
    repo.milestones.totalCount +
    issueStats.totalIssuesCount +
    repo.pullRequests.totalCount +
    prStats.prReviewCommentCount +
    repo.commitComments.totalCount +
    issueStats.issueCommentCount +
    prStats.issueCommentCount +
    issueStats.issueEventCount +
    prStats.issueEventCount +
    repo.releases.totalCount +
    repo.projectsV2.totalCount
  );
}

async function analyzeIssues({
  owner,
  repo,
  per_page,
  issues,
  client,
  logger,
}: {
  owner: string;
  repo: string;
  per_page: number;
  issues: IssuesConnection;
  client: OctokitClient;
  logger: Logger;
}): Promise<IssueStatsResult> {
  logger.debug(`Analyzing issues for repository: ${repo}`);

  if (issues.totalCount <= 0) {
    logger.debug(`No issues found for repository: ${repo}`);
    return {
      totalIssuesCount: issues.totalCount,
      issueEventCount: 0,
      issueCommentCount: 0,
    };
  }

  let totalEventCount = 0;
  let totalCommentCount = 0;

  // Process first page
  for (const issue of issues.nodes) {
    const eventCount = issue.timeline.totalCount;
    const commentCount = issue.comments.totalCount;

    // Calculate non-comment events by subtracting comments from total timeline events
    totalEventCount += eventCount - commentCount;
    totalCommentCount += commentCount;
  }

  // Process additional pages if they exist
  if (issues.pageInfo.hasNextPage && issues.pageInfo.endCursor != null) {
    logger.debug(`More pages of issues found for repository: ${repo}`);

    try {
      // Get next page of issues using iterator
      const nextPagesIterator = client.getRepoIssues(
        owner,
        repo,
        per_page,
        issues.pageInfo.endCursor,
      );

      // Process each issue from subsequent pages
      for await (const issue of nextPagesIterator) {
        const eventCount = issue.timeline.totalCount;
        const commentCount = issue.comments.totalCount;

        // Calculate non-comment events by subtracting comments from total timeline events
        totalEventCount += eventCount - commentCount;
        totalCommentCount += commentCount;
      }
    } catch (error) {
      logger.error(
        `Error retrieving additional issues for ${owner}/${repo}. ` +
          `Consider reducing page size. Error: ${error}`,
        error,
      );
      throw error;
    }
  }

  logger.debug(`Gathered all issues from repository: ${repo}`);
  return {
    totalIssuesCount: issues.totalCount,
    issueEventCount: totalEventCount,
    issueCommentCount: totalCommentCount,
  };
}

async function analyzePullRequests({
  owner,
  repo,
  per_page,
  pullRequests,
  client,
  logger,
}: {
  owner: string;
  repo: string;
  per_page: number;
  pullRequests: PullRequestsConnection;
  client: OctokitClient;
  logger: Logger;
}): Promise<PullRequestStatsResult> {
  if (pullRequests.totalCount <= 0) {
    return {
      prReviewCommentCount: 0,
      commitCommentCount: 0,
      issueEventCount: 0,
      issueCommentCount: 0,
      prReviewCount: 0,
    };
  }

  let issueEventCount = 0;
  let issueCommentCount = 0;
  let prReviewCount = 0;
  let prReviewCommentCount = 0;
  let commitCommentCount = 0;

  // Process first page
  for (const pr of pullRequests.nodes) {
    const eventCount = pr.timeline.totalCount;
    const commentCount = pr.comments.totalCount;
    const reviewCount = pr.reviews.totalCount;
    const commitCount = pr.commits.totalCount;

    // This matches how the bash script handles event counts
    // It subtracts comments from timeline events, and handles commit limits
    const redundantEventCount =
      commentCount + (commitCount > 250 ? 250 : commitCount);

    const adjustedEventCount = Math.max(0, eventCount - redundantEventCount);

    issueEventCount += adjustedEventCount;
    issueCommentCount += commentCount;
    prReviewCount += reviewCount;

    // Count review comments by examining each review
    for (const review of pr.reviews.nodes) {
      prReviewCommentCount += review.comments.totalCount;
    }

    commitCommentCount += commitCount;
  }

  // Process additional pages if they exist
  if (
    pullRequests.pageInfo.hasNextPage &&
    pullRequests.pageInfo.endCursor != null
  ) {
    const cursor = pullRequests.pageInfo.endCursor;
    logger.debug(
      `Fetching additional pull requests for ${repo} starting from cursor ${cursor}`,
    );

    for await (const pr of client.getRepoPullRequests(
      owner,
      repo,
      per_page,
      cursor,
    )) {
      const eventCount = pr.timeline.totalCount;
      const commentCount = pr.comments.totalCount;
      const reviewCount = pr.reviews.totalCount;
      const commitCount = pr.commits.totalCount;

      const redundantEventCount =
        commentCount + (commitCount > 250 ? 250 : commitCount);

      const adjustedEventCount = Math.max(0, eventCount - redundantEventCount);

      issueEventCount += adjustedEventCount;
      issueCommentCount += commentCount;
      prReviewCount += reviewCount;

      // Process review comments for additional pages
      for (const review of pr.reviews.nodes) {
        prReviewCommentCount += review.comments.totalCount;
      }

      commitCommentCount += commitCount;
    }
  }

  return {
    prReviewCommentCount,
    commitCommentCount,
    issueEventCount,
    issueCommentCount,
    prReviewCount,
  };
}

export async function checkForMissingRepos({
  opts,
  processedFile,
}: {
  opts: Arguments;
  processedFile: string;
}): Promise<{
  missingRepos: string[];
}> {
  // Initialize only what we need - logger and client
  const logFileName = `${opts.orgName!}-missing-repos-check-${
    new Date().toISOString().split('T')[0]
  }.log`;
  const logger = await createLogger(opts.verbose, logFileName);

  const authConfig = createAuthConfig({ ...opts, logger: logger });
  const octokit = createOctokit(
    authConfig,
    opts.baseUrl,
    opts.proxyUrl,
    logger,
  );
  const client = new OctokitClient(octokit);

  const org = opts.orgName!.toLowerCase();
  const per_page = opts.pageSize || 10;

  logger.debug(`Checking for missing repositories in organization: ${org}`);

  logger.info(
    `Reading processed file: ${processedFile} to check for missing repositories`,
  );
  const fileContent = readFileSync(processedFile, 'utf-8');
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
  });

  logger.debug(`Parsed ${records.length} records from processed file`);
  const processedReposSet = new Set<string>();
  (records as Array<{ Repo_Name: string }>).forEach((record) => {
    processedReposSet.add(record.Repo_Name.toLowerCase());
  });

  // file name of output file with missing repos with datetime suffix
  function generateTimestampSuffix(date: Date): string {
    const iso = date.toISOString();
    const [datePart, timePart] = iso.split('T');
    const [hour, minute] = timePart.split(':');
    return `${datePart}-${hour}-${minute}`;
  }
  const timestampSuffix = generateTimestampSuffix(new Date());
  const baseMissingReposFileName = `${org}-missing-repos-${timestampSuffix}.csv`;
  const missingReposFileName = await resolveOutputPath(
    opts.outputDir,
    baseMissingReposFileName,
  );

  logger.info('Checking for missing repositories in the organization');
  const missingRepos = [];
  for await (const repo of client.listReposForOrg(org, per_page)) {
    if (processedReposSet.has(repo.name.toLowerCase())) {
      continue;
    } else {
      missingRepos.push(repo.name);
      // write to csv file append
      const csvRow = `${repo.name}\n`;
      appendFileSync(missingReposFileName, csvRow);
    }
  }
  logger.info(`Found ${missingRepos.length} missing repositories`);
  if (missingRepos.length > 0) {
    logger.info(`Missing repositories written to: ${missingReposFileName}`);
  }

  return { missingRepos };
}
