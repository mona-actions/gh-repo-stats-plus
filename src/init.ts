import {
  OctokitClient,
  DEFAULT_API_VERSION,
  lookupInstallationId,
} from './service.js';
import { createOctokit } from './octokit.js';
import {
  Arguments,
  Logger,
  ProcessedPageState,
  OrgProcessingResult,
  CommandContext,
  OrgContext,
  CommandConfig,
  CommandResult,
} from './types.js';
import { createLogger, logInitialization } from './logger.js';
import {
  createAuthConfig,
  createAppLevelAuthConfig,
  needsInstallationLookup,
  getAuthPrivateKey,
} from './auth.js';
import { loadCaCertificate } from './tls.js';
import { StateManager } from './state.js';
import { SessionManager } from './session.js';
import { RetryConfig } from './retry.js';
import { formatElapsedTime, resolveOutputPath } from './utils.js';

/**
 * Initializes the shared processing context for a command.
 * Sets up logging, authentication, Octokit client, state management,
 * and session management. This should only be called once per command invocation.
 */
export async function initCommand(
  opts: Arguments,
  config: CommandConfig,
): Promise<CommandContext> {
  const { orgList, orgName } = opts;
  const hasOrgList = orgList && Array.isArray(orgList) && orgList.length > 0;
  const singleOrg = orgName && !hasOrgList ? [orgName] : [];
  const orgsToProcess = hasOrgList ? orgList : singleOrg;

  const sourceLabel =
    typeof config.sourceLabel === 'function'
      ? config.sourceLabel(opts)
      : config.sourceLabel;
  const orgForLog =
    orgsToProcess.length === 1
      ? orgsToProcess[0]
      : orgsToProcess.length > 1
        ? 'multi-org'
        : sourceLabel || 'source';
  const logFileName = `${orgForLog}-${config.logPrefix}-${
    new Date().toISOString().split('T')[0]
  }.log`;
  const logger = await createLogger(opts.verbose, logFileName);
  logInitialization.start(logger);

  logInitialization.auth(logger);

  const caCert = loadCaCertificate(opts.caCertPath, logger);

  // Wrap createOctokit to bind the loaded CA cert for all callers
  const createOctokitWithCa: typeof createOctokit = (
    authConfig,
    baseUrl,
    proxyUrl,
    logger,
    options?,
  ) =>
    createOctokit(authConfig, baseUrl, proxyUrl, logger, {
      ...options,
      caCert,
    });

  const supportsInstallationLookup =
    orgsToProcess.length > 0 || (config.supportsInstallationLookup ?? true);
  const shouldLookupInstallation =
    supportsInstallationLookup && needsInstallationLookup(opts);

  let resolvedOpts = opts;
  let createClientForOrg:
    | ((orgName: string) => Promise<OctokitClient>)
    | undefined;
  // Resolved once so we never re-read the key file per org or per auth call
  let resolvedKey: string | undefined;

  if (shouldLookupInstallation) {
    resolvedKey = getAuthPrivateKey(opts.privateKey, opts.privateKeyFile);
    // Opts with the resolved key so downstream auth helpers don't re-read the file
    const optsWithKey = {
      ...opts,
      privateKey: resolvedKey,
      privateKeyFile: undefined,
    };

    // Treat as single-org if there is exactly one org to process, regardless
    // of whether it came from --org-name or a one-item --org-list.
    const isSingleOrg = orgsToProcess.length === 1;

    if (isSingleOrg) {
      logger.info(
        'GitHub App credentials detected without installation ID. Looking up installation ID for organization...',
      );
      const resolvedInstallationId = await lookupInstallationId({
        appId: opts.appId || process.env.GITHUB_APP_ID || '',
        privateKey: resolvedKey,
        org: orgsToProcess[0],
        baseUrl: opts.baseUrl,
        proxyUrl: opts.proxyUrl,
        createOctokitFn: createOctokitWithCa,
        logger,
      });
      logger.info(
        `Resolved installation ID ${resolvedInstallationId} for organization ${orgsToProcess[0]}`,
      );
      resolvedOpts = {
        ...optsWithKey,
        appInstallationId: String(resolvedInstallationId),
      };
    } else {
      logger.info(
        'GitHub App credentials detected without installation ID. Installation ID will be looked up per organization.',
      );

      createClientForOrg = async (orgName: string): Promise<OctokitClient> => {
        logger.info(
          `Looking up installation ID for organization ${orgName}...`,
        );
        const installationId = await lookupInstallationId({
          appId: opts.appId || process.env.GITHUB_APP_ID || '',
          privateKey: resolvedKey!,
          org: orgName,
          baseUrl: opts.baseUrl,
          proxyUrl: opts.proxyUrl,
          createOctokitFn: createOctokitWithCa,
          logger,
        });
        logger.info(
          `Resolved installation ID ${installationId} for organization ${orgName}`,
        );
        const orgOpts = {
          ...optsWithKey,
          appInstallationId: String(installationId),
        };
        const orgAuthConfig = createAuthConfig({ ...orgOpts, logger });
        const orgOctokit = createOctokitWithCa(
          orgAuthConfig,
          opts.baseUrl,
          opts.proxyUrl,
          logger,
        );
        return new OctokitClient(
          orgOctokit,
          opts.apiVersion ?? DEFAULT_API_VERSION,
        );
      };
    }
  }

  // For the multi-org lookup path the shared client uses app-level JWT auth
  // (no installation ID needed). Per-org clients created by createClientForOrg
  // handle installation-scoped auth for actual data fetching.
  const authConfig =
    shouldLookupInstallation && createClientForOrg
      ? createAppLevelAuthConfig(
          opts.appId || process.env.GITHUB_APP_ID || '',
          resolvedKey!,
        )
      : createAuthConfig({ ...resolvedOpts, logger });

  logInitialization.octokit(logger);
  const octokit = createOctokitWithCa(
    authConfig,
    opts.baseUrl,
    opts.proxyUrl,
    logger,
  );

  const client = new OctokitClient(
    octokit,
    opts.apiVersion ?? DEFAULT_API_VERSION,
  );

  // Only initialize StateManager for single-org mode
  let stateManager: StateManager | undefined;
  let processedState: ProcessedPageState | undefined;
  let fileName = '';

  if (orgsToProcess.length === 1 && orgName) {
    const outputDir = opts.outputDir || 'output';
    stateManager = new StateManager(
      outputDir,
      orgName,
      logger,
      config.statePrefix,
    );

    logger.debug(
      `resumeFromLastSave option value: ${
        opts.resumeFromLastSave
      } (type: ${typeof opts.resumeFromLastSave})`,
    );

    const initResult = stateManager.initialize(
      opts.resumeFromLastSave || false,
      opts.forceFreshStart || false,
    );
    processedState = initResult.processedState;
    const resumeFromLastState = initResult.resumeFromLastState;

    if (resumeFromLastState) {
      fileName = processedState.outputFileName || '';
      logger.info(`Resuming from last state. Using existing file: ${fileName}`);
    } else {
      const baseFileName =
        opts.outputFileName || config.generateFileName(orgName);
      fileName = await resolveOutputPath(opts.outputDir, baseFileName);

      config.initializeCsvFile(fileName, logger);
      logger.info(`Results will be saved to file: ${fileName}`);

      processedState.outputFileName = fileName;
      stateManager.update(processedState, {});
    }
  }

  const retryConfig: RetryConfig = {
    maxAttempts: opts.retryMaxAttempts || 3,
    initialDelayMs: opts.retryInitialDelay || 1000,
    maxDelayMs: opts.retryMaxDelay || 30000,
    backoffFactor: opts.retryBackoffFactor || 2,
    successThreshold: opts.retrySuccessThreshold || 5,
  };

  // Initialize SessionManager for multi-org coordination
  let sessionManager: SessionManager | undefined;
  let resumeFromOrgIndex = 0;
  if (orgsToProcess.length > 1) {
    const outputDir = opts.outputDir || 'output';
    sessionManager = new SessionManager(outputDir, logger);
    const sessionSettings = {
      delayBetweenOrgs: opts.delayBetweenOrgs || 5,
      continueOnError: opts.continueOnError || false,
      outputDir,
    };
    const sessionInit = sessionManager.initialize(
      orgsToProcess,
      sessionSettings,
      opts.resumeFromLastSave,
    );
    resumeFromOrgIndex = sessionInit.currentOrgIndex;
    if (sessionInit.canResume) {
      logger.info(
        `Resuming session from organization ${resumeFromOrgIndex + 1} of ${orgsToProcess.length}`,
      );
    }
  }

  return {
    opts,
    logger,
    client,
    fileName,
    processedState,
    retryConfig,
    stateManager,
    orgsToProcess,
    sessionManager,
    resumeFromOrgIndex,
    createClientForOrg,
  };
}

/**
 * Executes the multi-org processing loop for a command.
 * Handles session management, delay between orgs, error propagation,
 * and summary logging. Delegates per-org work to executeForOrg.
 */
export async function executeCommand(
  context: CommandContext,
  config: CommandConfig,
): Promise<CommandResult> {
  const { delayBetweenOrgs = 5, continueOnError = false } = context.opts;
  const { logger, orgsToProcess, sessionManager, resumeFromOrgIndex } = context;
  const sourceLabel =
    typeof config.sourceLabel === 'function'
      ? config.sourceLabel(context.opts)
      : config.sourceLabel;

  if (orgsToProcess.length === 0) {
    if (config.processSource) {
      logger.info(`Processing source: ${sourceLabel || 'source'}`);
      const result = await config.processSource(context);
      for (const file of result.outputFiles.filter(Boolean)) {
        logger.info(`output_file=${file}`);
      }
      return result;
    }

    throw new Error('Either orgName or orgList must be provided');
  }

  logger.info(`Organizations to process: ${orgsToProcess.join(', ')}`);
  if (orgsToProcess.length > 1 && delayBetweenOrgs > 0) {
    const estimatedDelayMinutes = Math.ceil(
      ((orgsToProcess.length - 1) * delayBetweenOrgs) / 60,
    );
    logger.info(
      `Estimated minimum time (delays only): ${estimatedDelayMinutes} minutes`,
    );
  }

  const results: OrgProcessingResult[] = [];
  for (let i = 0; i < orgsToProcess.length; i++) {
    const orgName = orgsToProcess[i];
    const isLastToProcess = i === orgsToProcess.length - 1;

    // Skip orgs before resume index when resuming
    if (sessionManager && i < resumeFromOrgIndex) {
      logger.debug(
        `Skipping org ${orgName} (before resume index ${resumeFromOrgIndex})`,
      );
      continue;
    }

    // Skip already completed orgs
    if (sessionManager) {
      const orgRef = sessionManager.getOrCreateOrgReference(orgName);
      if (orgRef.status === 'completed') {
        logger.info(`Organization ${orgName} already completed, skipping`);
        continue;
      }
    }

    // Update session: org is starting
    if (sessionManager) {
      sessionManager.updateOrgReference(orgName, {
        status: 'in-progress',
        startTime: new Date().toISOString(),
      });
    }

    const result = await executeForOrg(orgName, context, config);
    results.push(result);

    // Update session: org completed or failed
    if (sessionManager) {
      sessionManager.updateOrgReference(orgName, {
        status: result.success ? 'completed' : 'failed',
        endTime: new Date().toISOString(),
        error: result.error || null,
        reposProcessed: result.reposProcessed || 0,
      });
    }

    if (!continueOnError && !result.success) {
      throw new Error(
        `Stopping processing due to error (use --continue-on-error to continue)`,
      );
    }

    // Add delay between organizations (except for the last one)
    if (!isLastToProcess && delayBetweenOrgs > 0) {
      logger.info(
        `Waiting for ${delayBetweenOrgs} seconds before processing the next organization...`,
      );
      await new Promise((resolve) =>
        setTimeout(resolve, delayBetweenOrgs * 1000),
      );
    }
  }

  // Log final summary
  logSummary(logger, results, orgsToProcess, config.summaryLabel);

  // Collect output file paths from successful results
  const outputFiles = results
    .filter((r) => r.success && r.outputFile)
    .map((r) => r.outputFile!);

  for (const file of outputFiles) {
    logger.info(`output_file=${file}`);
  }

  return { outputFiles };
}

/**
 * Execute processing for a single organization.
 * Creates per-org StateManager, initializes CSV file, then delegates
 * to the command-specific processOrg callback.
 */
async function executeForOrg(
  orgName: string,
  context: CommandContext,
  config: CommandConfig,
): Promise<OrgProcessingResult> {
  const { logger, opts, client, retryConfig, createClientForOrg } = context;

  logger.debug(`Starting processing for organization: ${orgName}`);

  const result: OrgProcessingResult = {
    orgName,
    success: false,
    error: undefined,
    startTime: undefined,
    endTime: undefined,
    elapsedTime: undefined,
  };

  try {
    result.startTime = new Date();

    // Use a per-org client when the factory is provided (multi-org app auth without installation ID)
    const orgClient = createClientForOrg
      ? await createClientForOrg(orgName)
      : client;

    const outputDir = opts.outputDir || 'output';
    const stateManager = new StateManager(
      outputDir,
      orgName,
      logger,
      config.statePrefix,
    );

    const { processedState, resumeFromLastState } = stateManager.initialize(
      opts.resumeFromLastSave || false,
      opts.forceFreshStart || false,
    );

    let fileName = '';
    if (resumeFromLastState) {
      fileName = processedState.outputFileName || '';
      logger.info(`Resuming from last state. Using existing file: ${fileName}`);
    } else {
      const baseFileName =
        opts.outputFileName || config.generateFileName(orgName);
      fileName = await resolveOutputPath(opts.outputDir, baseFileName);

      config.initializeCsvFile(fileName, logger);
      logger.info(`Results will be saved to file: ${fileName}`);

      processedState.outputFileName = fileName;
      stateManager.update(processedState, {});
    }

    const orgContext: OrgContext = {
      opts: { ...opts, orgName },
      logger,
      client: orgClient,
      fileName,
      processedState,
      retryConfig,
      stateManager,
    };

    await config.processOrg(orgContext);
    result.endTime = new Date();

    result.elapsedTime = formatElapsedTime(result.startTime, result.endTime);
    result.reposProcessed = processedState.processedRepos.length;
    result.outputFile = fileName;
    result.success = true;

    logger.info(
      `Successfully completed processing for organization: ${orgName} in ${result.elapsedTime}`,
    );
  } catch (e) {
    result.success = false;
    result.error = e instanceof Error ? e.message : String(e);
    logger.error(`Error processing organization ${orgName}: ${result.error}`);
  }

  return result;
}

function logSummary(
  logger: Logger,
  results: OrgProcessingResult[],
  orgsToProcess: string[],
  summaryLabel: string,
): void {
  logger.info('='.repeat(80));
  logger.info(
    `${orgsToProcess.length > 1 ? 'MULTI-ORG' : 'ORG'} ${summaryLabel} SUMMARY`,
  );
  logger.info('='.repeat(80));
  logger.info(`Total organizations processed: ${results.length}`);

  const totalSuccessful = results.filter((r) => r.success).length;
  const totalFailed = results.filter((r) => !r.success).length;
  logger.info(`Successful: ${totalSuccessful}`);
  logger.info(`Failed: ${totalFailed}`);
  if (results.length > 0) {
    logger.info(
      `Success rate: ${((totalSuccessful / results.length) * 100).toFixed(2)}%`,
    );
  }

  logger.info('Detailed Results:');
  for (const result of results) {
    const duration = result.elapsedTime || 'N/A';
    const status = result.success ? '✅ SUCCESS' : '❌ FAILED';
    const errorInfo = result.error ? ` - ${result.error}` : '';
    logger.info(`- ${result.orgName}: ${status} (${duration})${errorInfo}`);
  }
  logger.info('='.repeat(80));

  if (totalFailed > 0) {
    logger.warn(
      `⚠️  ${totalFailed} organization(s) failed processing. Check individual logs for details.`,
    );
  }
}

/**
 * Creates a logger and OctokitClient from command options.
 *
 * Lightweight alternative to initCommand for commands that only need a GitHub
 * API client without the full processing pipeline (state management, CSV
 * output, multi-org loops, etc.).
 */
export async function createClientFromOpts(
  opts: Arguments,
  logFileName: string,
): Promise<{ logger: Logger; client: OctokitClient }> {
  const logger = await createLogger(opts.verbose, logFileName);
  const caCert = loadCaCertificate(opts.caCertPath, logger);
  const authConfig = createAuthConfig({ ...opts, logger });
  const octokit = createOctokit(
    authConfig,
    opts.baseUrl,
    opts.proxyUrl,
    logger,
    {
      caCert,
    },
  );
  const client = new OctokitClient(
    octokit,
    opts.apiVersion ?? DEFAULT_API_VERSION,
  );
  return { logger, client };
}
