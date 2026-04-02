import {
  Arguments,
  Logger,
  PackageDetail,
  PackageStatsResult,
  OrgContext,
  CommandConfig,
} from './types.js';

import { withRetry } from './retry.js';
import { generatePackageStatsFileName, formatElapsedTime } from './utils.js';
import {
  initializeCsvFile as initializeCsvFileGeneric,
  appendCsvRow,
  PACKAGE_STATS_COLUMNS,
} from './csv.js';
import { initCommand, executeCommand } from './init.js';

// --- Command configuration ---

const packageStatsConfig: CommandConfig = {
  logPrefix: 'package-stats',
  summaryLabel: 'PACKAGE-STATS PROCESSING',
  generateFileName: generatePackageStatsFileName,
  initializeCsvFile: initializePackageStatsCsvFile,
  processOrg: processOrgPackageStats,
  statePrefix: 'packages',
};

// --- Public entry point ---

export async function runPackageStats(opts: Arguments): Promise<string[]> {
  const context = await initCommand(opts, packageStatsConfig);
  const result = await executeCommand(context, packageStatsConfig);
  return result.outputFiles;
}

// --- CSV helpers ---

function initializePackageStatsCsvFile(fileName: string, logger: Logger): void {
  initializeCsvFileGeneric(fileName, PACKAGE_STATS_COLUMNS, logger);
}

function writePackageStatsCsv(
  row: PackageStatsResult,
  fileName: string,
  logger: Logger,
): void {
  appendCsvRow(
    fileName,
    [
      row.Org_Name,
      row.Package_Name,
      row.Package_Type,
      row.Repo_Name,
      row.Repo_Archived,
      row.Repo_Visibility,
      row.Downloads_Count,
      row.Last_Published,
      row.Latest_Version,
      row.Latest_Version_Size_Bytes,
      row.Latest_Version_Size,
      row.Total_Versions,
      row.Total_Files,
      row.Total_Size_Bytes,
      row.Total_Size,
    ],
    logger,
  );
}

// --- Size formatting ---

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const index = Math.min(i, units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(2)} ${units[index]}`;
}

// --- Data mapping ---

export function packageDetailToResult(
  orgName: string,
  pkg: PackageDetail,
  totalFiles: number,
  totalSize: number,
  totalVersions: number,
): PackageStatsResult {
  const repoName = pkg.repository ? pkg.repository.name : 'N/A';
  const isArchived = pkg.repository ? pkg.repository.isArchived : false;
  const visibility = pkg.repository ? pkg.repository.visibility : 'N/A';
  const downloads = pkg.statistics ? pkg.statistics.downloadsTotalCount : 0;
  const version = pkg.latestVersion ? pkg.latestVersion.version : 'N/A';

  // nodes[0] is the most recently updated file (query orders by UPDATED_AT DESC)
  const updatedAt =
    pkg.latestVersion &&
    pkg.latestVersion.files &&
    pkg.latestVersion.files.nodes.length > 0
      ? pkg.latestVersion.files.nodes[0].updatedAt
      : 'N/A';

  // Sum of file sizes from the first page (up to 100).
  // For versions with >100 files, this is an approximation;
  // the accurate total across all versions is in Total_Size_Bytes.
  const latestVersionSize =
    pkg.latestVersion &&
    pkg.latestVersion.files &&
    pkg.latestVersion.files.nodes.length > 0
      ? pkg.latestVersion.files.nodes.reduce((sum, file) => sum + file.size, 0)
      : 0;

  return {
    Org_Name: orgName,
    Package_Name: pkg.name,
    Package_Type: pkg.packageType,
    Repo_Name: repoName,
    Repo_Archived: isArchived,
    Repo_Visibility: visibility,
    Downloads_Count: downloads,
    Last_Published: updatedAt,
    Latest_Version: version,
    Latest_Version_Size_Bytes: latestVersionSize,
    Latest_Version_Size: formatBytes(latestVersionSize),
    Total_Versions: totalVersions,
    Total_Files: totalFiles,
    Total_Size_Bytes: totalSize,
    Total_Size: formatBytes(totalSize),
  };
}

// --- Per-org processing (called by shared executeForOrg via config.processOrg) ---

async function processOrgPackageStats(context: OrgContext): Promise<void> {
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
    `Started package-stats processing at: ${startTime.toISOString()}`,
  );

  const packageType = opts.packageType || 'maven';
  const pageSize = opts.pageSize || 100;

  const processingState = {
    successCount: 0,
    retryCount: 0,
  };

  await withRetry(
    async () => {
      const orgName = opts.orgName!;

      logger.info(
        `Fetching ${packageType} packages for organization: ${orgName}`,
      );

      let packageCount = 0;
      let skippedCount = 0;
      let totalSizeBytes = 0;

      for await (const pkg of client.getOrgPackageDetails(
        orgName,
        packageType,
        pageSize,
        logger,
      )) {
        // Skip deleted packages with no versions
        if (pkg.name.startsWith('deleted_') && pkg.versions.totalCount === 0) {
          logger.info(`Skipping package ${pkg.name} because it is deleted`);
          skippedCount++;
          continue;
        }

        // Fetch detailed version information
        logger.info(
          `Fetching detailed version information for package: ${pkg.name}`,
        );
        const { totalFiles, totalSize, totalVersions } =
          await client.getPackageVersionDetails(
            orgName,
            pkg.name,
            logger,
            pageSize,
          );

        const row = packageDetailToResult(
          orgName,
          pkg,
          totalFiles,
          totalSize,
          totalVersions,
        );
        writePackageStatsCsv(row, fileName, logger);

        totalSizeBytes += totalSize;
        packageCount++;
        processingState.successCount++;

        if (packageCount % 100 === 0) {
          logger.info(
            `Processed ${packageCount} packages so far for ${orgName}`,
          );
        }
      }

      const endTime = new Date();
      const elapsedTime = formatElapsedTime(startTime, endTime);

      processedState.completedSuccessfully = true;
      logger.info('Package stats processing completed successfully.');

      logger.info(
        `Completed processing packages. ` +
          `Start time: ${startTime.toISOString()}\n` +
          `End time: ${endTime.toISOString()}\n` +
          `Total elapsed time: ${elapsedTime}\n` +
          `Packages written to CSV: ${packageCount}\n` +
          `Packages skipped (deleted): ${skippedCount}\n` +
          `Total size (bytes): ${totalSizeBytes}\n` +
          `Total size: ${formatBytes(totalSizeBytes)}\n` +
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
        `Retry attempt ${state.attempt}: Failed while processing packages. ` +
          `Error: ${state.error?.message}\n` +
          `Elapsed time so far: ${formatElapsedTime(startTime, new Date())}`,
      );
      stateManager.update(processedState, {});
    },
  );
}
