import { StateManager } from './state.js';
import { withRetry } from './retry.js';
import { formatElapsedTime, resolveOutputPath } from './utils.js';
import { readCsvFile } from './csv.js';
import { validateRepoListAuthSupport } from './auth.js';
import {
  NormalizedRepoListEntry,
  NormalizedRepoList,
  RepoListOwnerGroup,
  createRepoListKey,
  parseRepoListInput,
} from './repo-list.js';
import {
  buildProcessedRepoKeySet,
  initializeCsvFile,
  processRepositoryByName,
} from './repo-stats-service.js';
import type {
  Arguments,
  CommandContext,
  CommandResult,
  Logger,
  ProcessedPageState,
} from './types.js';
import type { OctokitClient } from './service.js';
import type { RetryConfig } from './retry.js';

export function generateRepoListStatsFileName(): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/:/g, '')
    .replace(/\..+/, '');
  return `repo-list-all_repos-${timestamp}_ts.csv`;
}

export function validateRepoListSourceOptions(
  opts: Arguments,
): NormalizedRepoList {
  const normalizedRepoList = parseRepoListInput(opts.repoList);
  if (normalizedRepoList.entries.length === 0) {
    throw new Error('--repo-list must contain at least one repository entry');
  }
  validateRepoListAuthSupport(opts, {
    ownerCount: normalizedRepoList.summary.ownerCount,
  });
  return normalizedRepoList;
}

export async function processRepoListSource(
  context: CommandContext,
): Promise<CommandResult> {
  const { opts, logger, client, retryConfig } = context;
  const normalizedRepoList = validateRepoListSourceOptions(opts);

  logger.info(
    `Processing ${normalizedRepoList.summary.uniqueEntryCount} repositories ` +
      `across ${normalizedRepoList.summary.ownerCount} owner groups from --repo-list`,
  );
  if (normalizedRepoList.duplicates.length > 0) {
    logger.warn(
      `Ignored ${normalizedRepoList.duplicates.length} duplicate repo-list entr${
        normalizedRepoList.duplicates.length === 1 ? 'y' : 'ies'
      }`,
    );
  }

  const outputDir = opts.outputDir || 'output';
  const stateManager = new StateManager(outputDir, 'repo-list', logger);
  const initResult = stateManager.initialize(
    opts.resumeFromLastSave || false,
    opts.forceFreshStart || false,
  );
  const processedState = initResult.processedState;
  let fileName = processedState.outputFileName || '';

  if (initResult.resumeFromLastState && fileName) {
    logger.info(
      `Resuming from last repo-list state. Using existing file: ${fileName}`,
    );
  } else {
    const baseFileName = opts.outputFileName || generateRepoListStatsFileName();
    fileName = await resolveOutputPath(opts.outputDir, baseFileName);
    initializeCsvFile(fileName, logger);
    processedState.outputFileName = fileName;
    stateManager.update(processedState, {});
    logger.info(`Repo-list results will be saved to file: ${fileName}`);
  }

  const processingState = {
    successCount: 0,
    retryCount: 0,
    processedCount: 0,
  };
  const processedRepoKeys = buildProcessedRepoKeySet(processedState);
  const startTime = new Date();

  await withRetry(
    async () => {
      let processedCount = 0;

      for (const ownerGroup of normalizedRepoList.groupedByOwner.values()) {
        processedCount += await processRepoListOwnerGroup({
          ownerGroup,
          client,
          logger,
          opts,
          processedState,
          processedRepoKeys,
          state: processingState,
          fileName,
          stateManager,
        });
      }

      processedState.completedSuccessfully = true;
      stateManager.update(processedState, {});
      logger.info(
        `Completed repo-list processing. Processed ${processedCount} new repositories. ` +
          `Total tracked repositories: ${processedRepoKeys.size}. ` +
          `Elapsed time: ${formatElapsedTime(startTime, new Date())}. ` +
          `Output saved to: ${fileName}`,
      );
    },
    retryConfig,
    (state) => {
      processingState.retryCount++;
      processingState.successCount = 0;
      logger.warn(
        `Retry attempt ${state.attempt}: Failed while processing repo-list. ` +
          `Last processed repo: ${processedState.lastProcessedRepo}, ` +
          `Processed repos count: ${processedState.processedRepos.length}, ` +
          `Error: ${state.error?.message}`,
      );
      stateManager.update(processedState, {});
    },
  );

  if (opts.autoProcessMissing) {
    await processMissingRepoListRepositories({
      opts,
      normalizedRepoList,
      client,
      logger,
      processedState,
      processedRepoKeys,
      retryConfig,
      fileName,
      stateManager,
    });
  }

  if (opts.cleanState) {
    stateManager.cleanup();
  }

  return { outputFiles: [fileName] };
}

export function findMissingRepoListEntries({
  normalizedRepoList,
  processedFile,
}: {
  normalizedRepoList: NormalizedRepoList;
  processedFile: string;
}): NormalizedRepoListEntry[] {
  const records = readCsvFile(processedFile);
  const processedCsvKeys = new Set<string>();

  (records as Array<{ Org_Name?: string; Repo_Name?: string }>).forEach(
    (record) => {
      if (record.Org_Name && record.Repo_Name) {
        processedCsvKeys.add(
          createRepoListKey(record.Org_Name, record.Repo_Name),
        );
      }
    },
  );

  return normalizedRepoList.entries.filter(
    (entry) => !processedCsvKeys.has(entry.key),
  );
}

export function groupRepoListEntriesForProcessing(
  entries: readonly NormalizedRepoListEntry[],
): RepoListOwnerGroup[] {
  const groups = new Map<string, NormalizedRepoListEntry[]>();

  for (const entry of entries) {
    const ownerEntries = groups.get(entry.ownerKey) ?? [];
    ownerEntries.push(entry);
    groups.set(entry.ownerKey, ownerEntries);
  }

  return [...groups.values()].map((entriesForOwner) => ({
    owner: entriesForOwner[0].owner,
    ownerKey: entriesForOwner[0].ownerKey,
    entries: entriesForOwner,
  }));
}

export async function processMissingRepoListRepositories({
  opts,
  normalizedRepoList,
  client,
  logger,
  processedState,
  processedRepoKeys,
  retryConfig,
  fileName,
  stateManager,
}: {
  opts: Arguments;
  normalizedRepoList: NormalizedRepoList;
  client: OctokitClient;
  logger: Logger;
  processedState: ProcessedPageState;
  processedRepoKeys: Set<string>;
  retryConfig: RetryConfig;
  fileName: string;
  stateManager: StateManager;
}): Promise<void> {
  logger.info('Checking for missing repositories from --repo-list output...');
  const missingEntries = findMissingRepoListEntries({
    normalizedRepoList,
    processedFile: fileName,
  });

  if (missingEntries.length === 0) {
    logger.info(
      'No missing repo-list repositories found. All requested repositories have output rows.',
    );
    return;
  }

  logger.info(
    `Found ${missingEntries.length} missing repo-list repositories that need to be processed`,
  );
  processedState.completedSuccessfully = false;
  stateManager.update(processedState, {});

  for (const entry of missingEntries) {
    processedRepoKeys.delete(entry.key);
  }

  const missingProcessingState = {
    successCount: 0,
    retryCount: 0,
    processedCount: 0,
  };

  await withRetry(
    async () => {
      let processedCount = 0;
      for (const ownerGroup of groupRepoListEntriesForProcessing(
        missingEntries,
      )) {
        processedCount += await processRepoListOwnerGroup({
          ownerGroup,
          client,
          logger,
          opts,
          processedState,
          processedRepoKeys,
          state: missingProcessingState,
          fileName,
          stateManager,
        });
      }

      logger.info(
        `Completed processing ${processedCount} missing repo-list repositories`,
      );
    },
    retryConfig,
    (state) => {
      missingProcessingState.retryCount++;
      missingProcessingState.successCount = 0;
      logger.warn(
        `Retry attempt ${state.attempt}: Failed while processing missing repo-list repositories. ` +
          `Error: ${state.error?.message}`,
      );
      stateManager.update(processedState, {});
    },
  );

  processedState.completedSuccessfully = true;
  stateManager.update(processedState, {});
}

export async function processRepoListOwnerGroup({
  ownerGroup,
  client,
  logger,
  opts,
  processedState,
  processedRepoKeys,
  state,
  fileName,
  stateManager,
}: {
  ownerGroup: RepoListOwnerGroup;
  client: OctokitClient;
  logger: Logger;
  opts: Arguments;
  processedState: ProcessedPageState;
  processedRepoKeys: Set<string>;
  state: { successCount: number; retryCount: number; processedCount: number };
  fileName: string;
  stateManager: StateManager;
}): Promise<number> {
  logger.info(
    `Processing ${ownerGroup.entries.length} repositories for owner ${ownerGroup.owner}`,
  );
  let processedCount = 0;

  for (const entry of ownerGroup.entries) {
    if (processedRepoKeys.has(entry.key)) {
      logger.debug(`Skipping already processed repository: ${entry.key}`);
      continue;
    }

    try {
      await processRepositoryByName({
        entry,
        client,
        logger,
        opts,
        processedState,
        processedRepoKeys,
        state,
        fileName,
        stateManager,
        processedCount: ++state.processedCount,
      });
      processedCount += 1;
    } catch (error) {
      state.successCount = 0;
      logger.error(
        `Failed processing repo ${entry.owner}/${entry.repo}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }

  return processedCount;
}
