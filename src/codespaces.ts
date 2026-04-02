import {
  Arguments,
  Logger,
  Codespace,
  CodespaceStatsResult,
  OrgContext,
  CommandConfig,
} from './types.js';

import { withRetry } from './retry.js';
import { generateCodespaceStatsFileName, formatElapsedTime } from './utils.js';
import {
  initializeCsvFile as initializeCsvFileGeneric,
  appendCsvRow,
  CODESPACE_STATS_COLUMNS,
} from './csv.js';
import { initCommand, executeCommand } from './init.js';

// --- Command configuration ---

const codespaceStatsConfig: CommandConfig = {
  logPrefix: 'codespace-stats',
  summaryLabel: 'CODESPACE-STATS PROCESSING',
  generateFileName: generateCodespaceStatsFileName,
  initializeCsvFile: initializeCodespaceStatsCsvFile,
  processOrg: processOrgCodespaceStats,
  statePrefix: 'codespaces',
};

// --- Public entry point ---

export async function runCodespaceStats(opts: Arguments): Promise<string[]> {
  const context = await initCommand(opts, codespaceStatsConfig);
  const result = await executeCommand(context, codespaceStatsConfig);
  return result.outputFiles;
}

// --- CSV helpers ---

function initializeCodespaceStatsCsvFile(
  fileName: string,
  logger: Logger,
): void {
  initializeCsvFileGeneric(fileName, CODESPACE_STATS_COLUMNS, logger);
}

function writeCodespaceStatsCsv(
  row: CodespaceStatsResult,
  fileName: string,
  logger: Logger,
): void {
  appendCsvRow(
    fileName,
    [
      row.Org_Name,
      row.Repo_Name,
      row.Codespace_Name,
      row.State,
      row.Machine_Name,
      row.CPU_Size,
      row.Memory_Size_GB,
      row.Storage_GB,
      row.Billable_Owner,
      row.Owner,
      row.Last_Used_At,
      row.Created_At,
    ],
    logger,
  );
}

// --- Data mapping ---

export function codespaceToResult(
  orgName: string,
  codespace: Codespace,
): CodespaceStatsResult {
  return {
    Org_Name: orgName,
    Repo_Name: codespace.repository ? codespace.repository.name : 'Unknown',
    Codespace_Name: codespace.name,
    State: codespace.state,
    Machine_Name: codespace.machine ? codespace.machine.name : 'N/A',
    CPU_Size: codespace.machine ? codespace.machine.cpuSize.toString() : 'N/A',
    Memory_Size_GB: codespace.machine
      ? codespace.machine.memorySize.toString()
      : 'N/A',
    Storage_GB: codespace.machine
      ? codespace.machine.storage.toString()
      : 'N/A',
    Billable_Owner: codespace.billableOwner
      ? codespace.billableOwner.login
      : 'N/A',
    Owner: codespace.owner ? codespace.owner.login : 'N/A',
    Last_Used_At: codespace.lastUsedAt || 'N/A',
    Created_At: codespace.createdAt,
  };
}

// --- Per-org processing (called by shared executeForOrg via config.processOrg) ---

async function processOrgCodespaceStats(context: OrgContext): Promise<void> {
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
    `Started codespace-stats processing at: ${startTime.toISOString()}`,
  );

  const pageSize = opts.pageSize || 100;

  const processingState = {
    successCount: 0,
    retryCount: 0,
  };

  await withRetry(
    async () => {
      const orgName = opts.orgName!;

      logger.info(`Fetching codespaces for organization: ${orgName}`);

      let totalCodespaces = 0;
      const uniqueRepos = new Set<string>();

      for await (const codespace of client.getOrgCodespaces(
        orgName,
        pageSize,
        logger,
      )) {
        const row = codespaceToResult(orgName, codespace);
        writeCodespaceStatsCsv(row, fileName, logger);

        uniqueRepos.add(row.Repo_Name);
        totalCodespaces++;
        processingState.successCount++;

        if (totalCodespaces % 100 === 0) {
          logger.info(
            `Processed ${totalCodespaces} codespaces so far for ${orgName}`,
          );
        }
      }

      const endTime = new Date();
      const elapsedTime = formatElapsedTime(startTime, endTime);

      processedState.completedSuccessfully = true;
      logger.info('Codespace stats processing completed successfully.');

      logger.info(
        `Completed processing codespaces. ` +
          `Start time: ${startTime.toISOString()}\n` +
          `End time: ${endTime.toISOString()}\n` +
          `Total elapsed time: ${elapsedTime}\n` +
          `Unique repositories: ${uniqueRepos.size}\n` +
          `Total codespaces found: ${totalCodespaces}\n` +
          `Output saved to: ${fileName}`,
      );

      stateManager.update(processedState, {});

      // Clean up state file if requested
      if (opts.cleanState) {
        stateManager.cleanup();
      }
    },
    retryConfig,
    (state) => {
      processingState.retryCount++;
      processingState.successCount = 0;
      logger.warn(
        `Retry attempt ${state.attempt}: Failed while processing codespaces. ` +
          `Error: ${state.error?.message}\n` +
          `Elapsed time so far: ${formatElapsedTime(startTime, new Date())}`,
      );
      stateManager.update(processedState, {});
    },
  );
}
