import {
  Arguments,
  Logger,
  AppInstallationData,
  PerRepoInstallationResult,
  RepoAppDetailResult,
  AppReposResult,
  OrgContext,
  CommandConfig,
} from './types.js';

import { withRetry } from './retry.js';
import {
  generatePerRepoInstallFileName,
  generateRepoAppDetailFileName,
  generateAppReposFileName,
  formatElapsedTime,
  resolveOutputPath,
} from './utils.js';
import {
  initializeCsvFile as initializeCsvFileGeneric,
  appendCsvRow,
  PER_REPO_INSTALL_COLUMNS,
  REPO_APP_DETAIL_COLUMNS,
  APP_REPOS_COLUMNS,
} from './csv.js';
import { initCommand, executeCommand } from './init.js';

// --- Command configuration ---

const appInstallStatsConfig: CommandConfig = {
  logPrefix: 'app-install-stats',
  summaryLabel: 'APP-INSTALL-STATS PROCESSING',
  generateFileName: generatePerRepoInstallFileName,
  initializeCsvFile: initializePerRepoInstallCsvFile,
  processOrg: processOrgAppInstallStats,
  statePrefix: 'app-installs',
};

// --- Public entry point ---

export async function runAppInstallStats(opts: Arguments): Promise<string[]> {
  // Warn if GitHub App auth options are set — they won't work for this endpoint
  if (opts.appId || opts.privateKey || opts.privateKeyFile) {
    console.warn(
      "Warning: GitHub App authentication cannot view other apps' installations. " +
        'A Personal Access Token (PAT) with admin:org scope is required for app-install-stats.',
    );
  }

  const context = await initCommand(opts, appInstallStatsConfig);
  const result = await executeCommand(context, appInstallStatsConfig);
  return result.outputFiles;
}

// --- Per-org processing (called by shared executeForOrg via config.processOrg) ---

async function processOrgAppInstallStats(context: OrgContext): Promise<void> {
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
    `Started app-install-stats processing at: ${startTime.toISOString()}`,
  );

  // Warn if GitHub App auth is being used
  if (opts.appId || opts.privateKey || opts.privateKeyFile) {
    logger.warn(
      'GitHub App authentication detected. The GET /orgs/{org}/installations ' +
        'endpoint requires a Personal Access Token (PAT) — app tokens cannot view ' +
        "other apps' installations.",
    );
  }

  const processingState = {
    successCount: 0,
    retryCount: 0,
  };

  await withRetry(
    async () => {
      const orgName = opts.orgName!;

      logger.info(`Fetching app installations for organization: ${orgName}`);

      const data = await client.getOrgAppInstallationData(
        orgName,
        (appSlug, repoCount) => {
          logger.info(`App: ${appSlug}, Installation repos: ${repoCount}`);
        },
      );

      logger.info(
        `Found ${data.orgWideInstallations.length} org-wide installations and ` +
          `${data.repoSpecificInstallations.length} repo-specific installations`,
      );

      // Write per-repo installations CSV (primary output)
      if (!opts.skipPerRepoInstallCsv) {
        const perRepoData = preparePerRepoInstallationsData(data);
        for (const row of perRepoData) {
          writePerRepoInstallCsv(row, fileName, logger);
        }
        logger.info(
          `Wrote ${perRepoData.length} rows to per-repo installations CSV: ${fileName}`,
        );
      } else {
        logger.info(
          'Skipping per-repo installations CSV (--skip-per-repo-install-csv)',
        );
      }

      // Write repo-app details CSV
      if (!opts.skipRepoAppDetailCsv) {
        const repoAppDetailFileName = await resolveOutputPath(
          opts.outputDir,
          generateRepoAppDetailFileName(orgName),
        );
        initializeRepoAppDetailCsvFile(repoAppDetailFileName, logger);

        const repoAppData = prepareRepoAppDetailsData(data);
        for (const row of repoAppData) {
          writeRepoAppDetailCsv(row, repoAppDetailFileName, logger);
        }
        logger.info(
          `Wrote ${repoAppData.length} rows to repo-app details CSV: ${repoAppDetailFileName}`,
        );
        logger.info(`output_file=${repoAppDetailFileName}`);
      } else {
        logger.info(
          'Skipping repo-app details CSV (--skip-repo-app-detail-csv)',
        );
      }

      // Write app-repos summary CSV
      if (!opts.skipAppReposCsv) {
        const appReposFileName = await resolveOutputPath(
          opts.outputDir,
          generateAppReposFileName(orgName),
        );
        initializeAppReposCsvFile(appReposFileName, logger);

        const appReposData = prepareAppReposData(data);
        for (const row of appReposData) {
          writeAppReposCsv(row, appReposFileName, logger);
        }
        logger.info(
          `Wrote ${appReposData.length} rows to app-repos CSV: ${appReposFileName}`,
        );
        logger.info(`output_file=${appReposFileName}`);
      } else {
        logger.info('Skipping app-repos CSV (--skip-app-repos-csv)');
      }

      const endTime = new Date();
      const elapsedTime = formatElapsedTime(startTime, endTime);

      processedState.completedSuccessfully = true;
      logger.info('App installation stats processing completed successfully.');

      logger.info(
        `Completed processing app installations. ` +
          `Start time: ${startTime.toISOString()}\n` +
          `End time: ${endTime.toISOString()}\n` +
          `Total elapsed time: ${elapsedTime}\n` +
          `Org-wide installations: ${data.orgWideInstallations.length}\n` +
          `Repo-specific installations: ${data.repoSpecificInstallations.length}\n` +
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
        `Retry attempt ${state.attempt}: Failed while processing app installations. ` +
          `Error: ${state.error?.message}\n` +
          `Elapsed time so far: ${formatElapsedTime(startTime, new Date())}`,
      );
      stateManager.update(processedState, {});
    },
  );
}

// --- Data preparation (matches jcantosz/org-app-stats output format) ---

/**
 * Prepares per-repo installation data for CSV output.
 * One row per repository showing how many apps are installed,
 * plus a special `_ORG_LEVEL_` row for org-wide installations.
 */
export function preparePerRepoInstallationsData(
  data: AppInstallationData,
): PerRepoInstallationResult[] {
  const results: PerRepoInstallationResult[] = [];

  // Add repository-specific installations
  for (const [repoName, apps] of Object.entries(data.repoApps)) {
    results.push({
      Org_Name: data.orgName,
      Repo_Name: repoName,
      App_Installations: apps.length,
    });
  }

  // Add a special entry for org-wide apps
  if (data.orgWideInstallations.length > 0) {
    results.push({
      Org_Name: data.orgName,
      Repo_Name: '_ORG_LEVEL_',
      App_Installations: data.orgWideInstallations.length,
    });
  }

  return results;
}

/**
 * Prepares repo-app detail data for CSV output.
 * One row per repo-app pair, plus rows for org-wide apps with
 * `_ORG_LEVEL_` as the repo name.
 */
export function prepareRepoAppDetailsData(
  data: AppInstallationData,
): RepoAppDetailResult[] {
  const results: RepoAppDetailResult[] = [];

  // Add repository-specific installations
  for (const [repoName, apps] of Object.entries(data.repoApps)) {
    for (const appName of apps) {
      results.push({
        Org_Name: data.orgName,
        Repo_Name: repoName,
        App_Name: appName,
        Configured: 'TRUE',
      });
    }
  }

  // Add org-wide apps
  for (const installation of data.orgWideInstallations) {
    results.push({
      Org_Name: data.orgName,
      Repo_Name: '_ORG_LEVEL_',
      App_Name: installation.app_slug,
      Configured: 'TRUE',
    });
  }

  return results;
}

/**
 * Prepares app-repos summary data for CSV output.
 * One row per app showing how many repos it's installed in.
 */
export function prepareAppReposData(
  data: AppInstallationData,
): AppReposResult[] {
  const results: AppReposResult[] = [];

  for (const [appName, repos] of Object.entries(data.installationRepos)) {
    results.push({
      Org_Name: data.orgName,
      App_Name: appName,
      Repos_Installed_In: repos.length,
    });
  }

  return results;
}

// --- CSV initialization ---

export function initializePerRepoInstallCsvFile(
  fileName: string,
  logger: Logger,
): void {
  initializeCsvFileGeneric(fileName, PER_REPO_INSTALL_COLUMNS, logger);
}

export function initializeRepoAppDetailCsvFile(
  fileName: string,
  logger: Logger,
): void {
  initializeCsvFileGeneric(fileName, REPO_APP_DETAIL_COLUMNS, logger);
}

export function initializeAppReposCsvFile(
  fileName: string,
  logger: Logger,
): void {
  initializeCsvFileGeneric(fileName, APP_REPOS_COLUMNS, logger);
}

// --- CSV writing ---

export function writePerRepoInstallCsv(
  result: PerRepoInstallationResult,
  fileName: string,
  logger: Logger,
): void {
  try {
    const values = [
      result.Org_Name,
      result.Repo_Name,
      result.App_Installations,
    ];
    appendCsvRow(fileName, values, logger);
    logger.debug(
      `Wrote per-repo install row for ${result.Org_Name}/${result.Repo_Name}`,
    );
  } catch (error) {
    logger.error(
      `Error writing per-repo install CSV for ${result.Org_Name}/${result.Repo_Name}: ${error}`,
    );
    throw error;
  }
}

export function writeRepoAppDetailCsv(
  result: RepoAppDetailResult,
  fileName: string,
  logger: Logger,
): void {
  try {
    const values = [
      result.Org_Name,
      result.Repo_Name,
      result.App_Name,
      result.Configured,
    ];
    appendCsvRow(fileName, values, logger);
    logger.debug(
      `Wrote repo-app detail row for ${result.Org_Name}/${result.Repo_Name}/${result.App_Name}`,
    );
  } catch (error) {
    logger.error(
      `Error writing repo-app detail CSV for ${result.Org_Name}/${result.Repo_Name}: ${error}`,
    );
    throw error;
  }
}

export function writeAppReposCsv(
  result: AppReposResult,
  fileName: string,
  logger: Logger,
): void {
  try {
    const values = [
      result.Org_Name,
      result.App_Name,
      result.Repos_Installed_In,
    ];
    appendCsvRow(fileName, values, logger);
    logger.debug(
      `Wrote app-repos row for ${result.Org_Name}/${result.App_Name}`,
    );
  } catch (error) {
    logger.error(
      `Error writing app-repos CSV for ${result.Org_Name}/${result.App_Name}: ${error}`,
    );
    throw error;
  }
}
