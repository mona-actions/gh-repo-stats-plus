import { writeFileSync } from 'fs';
import type { components } from '@octokit/openapi-types';

import {
  Arguments,
  Logger,
  OrgContext,
  CommandConfig,
  CommandContext,
  CommandResult,
  WebhookScope,
  WebhookStatsResult,
  WebhookType,
} from './types.js';
import { withRetry } from './retry.js';
import {
  generateWebhookStatsFileName,
  formatElapsedTime,
  resolveOutputPath,
} from './utils.js';
import {
  initializeCsvFile as initializeCsvFileGeneric,
  appendCsvRow,
  WEBHOOK_STATS_COLUMNS,
} from './csv.js';
import { initCommand, executeCommand } from './init.js';
import { isStandaloneRepoListSourceMode } from './repo-stats-source-mode.js';
import { parseRepoListInput } from './repo-list.js';
import { validateRepoListAuthSupport } from './auth.js';
import { StateManager } from './state.js';
import type { OctokitClient } from './service.js';

type OrgHook = components['schemas']['org-hook'];
type RepoHook = components['schemas']['hook'];
type AnyWebhook = OrgHook | RepoHook;

// --- Command configuration ---

const webhookStatsConfig: CommandConfig = {
  logPrefix: 'webhook-stats',
  summaryLabel: 'WEBHOOK-STATS PROCESSING',
  sourceLabel: 'repo-list',
  generateFileName: generateWebhookStatsFileName,
  initializeCsvFile: initializeWebhookStatsCsvFile,
  processOrg: processOrgWebhookStats,
  processSource: processWebhookListSource,
  statePrefix: 'webhooks',
};

// --- Public entry point ---

export async function runWebhookStats(opts: Arguments): Promise<string[]> {
  // Only org-name / org-list modes use the per-org processing loop. Repo-list
  // mode is handled by config.processSource, so disable it otherwise.
  const config: CommandConfig = { ...webhookStatsConfig };
  if (!isStandaloneRepoListSourceMode(opts)) {
    config.processSource = undefined;
  }

  const context = await initCommand(opts, config);
  const result = await executeCommand(context, config);
  return result.outputFiles;
}

// --- Scope helpers ---

function scopeIncludesOrg(scope: WebhookScope): boolean {
  return scope === 'org' || scope === 'both';
}

function scopeIncludesRepo(scope: WebhookScope): boolean {
  return scope === 'repo' || scope === 'both';
}

// --- CSV helpers ---

function initializeWebhookStatsCsvFile(fileName: string, logger: Logger): void {
  initializeCsvFileGeneric(fileName, WEBHOOK_STATS_COLUMNS, logger);
}

function writeWebhookStatsCsv(
  row: WebhookStatsResult,
  fileName: string,
  logger: Logger,
): void {
  appendCsvRow(
    fileName,
    [
      row.Org_Name,
      row.Repo_Name,
      row.Webhook_Type,
      row.Webhook_Id,
      row.Name,
      row.Active,
      row.Has_Secret,
      row.Events,
      row.Url,
      row.Content_Type,
      row.Insecure_SSL,
      row.Created_At,
      row.Updated_At,
      row.Last_Response_Code,
      row.Last_Response_Status,
      row.Last_Response_Message,
    ],
    logger,
  );
}

// --- Data mapping ---

interface WebhookLastResponse {
  code?: number | null;
  status?: string | null;
  message?: string | null;
}

function getLastResponse(hook: AnyWebhook): WebhookLastResponse | undefined {
  if ('last_response' in hook && hook.last_response) {
    return hook.last_response as WebhookLastResponse;
  }
  return undefined;
}

/**
 * Determines whether a webhook is considered active.
 * Repository webhooks expose `last_response.status` (the example from
 * list-webhooks treats 'active' as the live status). Organization webhooks
 * have no last-response payload, so fall back to the `active` flag.
 */
export function isWebhookActive(hook: AnyWebhook): boolean {
  const lastResponse = getLastResponse(hook);
  if (lastResponse && typeof lastResponse.status === 'string') {
    return lastResponse.status === 'active';
  }
  return hook.active === true;
}

export function webhookToResult(
  orgName: string,
  repoName: string | undefined,
  type: WebhookType,
  hook: AnyWebhook,
): WebhookStatsResult {
  const config = hook.config ?? {};
  const lastResponse = getLastResponse(hook);

  return {
    Org_Name: orgName,
    Repo_Name: repoName ?? '',
    Webhook_Type: type,
    Webhook_Id: hook.id,
    Name: hook.name ?? '',
    Active: hook.active ?? false,
    Has_Secret: Boolean(config.secret),
    Events: (hook.events ?? []).join(';'),
    Url: config.url ?? '',
    Content_Type: config.content_type ?? '',
    Insecure_SSL:
      config.insecure_ssl != null ? String(config.insecure_ssl) : '',
    Created_At: hook.created_at ?? '',
    Updated_At: hook.updated_at ?? '',
    Last_Response_Code:
      lastResponse?.code != null ? String(lastResponse.code) : '',
    Last_Response_Status: lastResponse?.status ?? '',
    Last_Response_Message: lastResponse?.message ?? '',
  };
}

// --- Unique URL collection (secondary outputs) ---

function collectWebhookUrl(
  url: string,
  baseUrls: Set<string>,
  urlsWithoutQuery: Set<string>,
  logger: Logger,
): void {
  if (!url || url === 'N/A') {
    return;
  }

  try {
    const parsed = new URL(url);
    baseUrls.add(`${parsed.protocol}//${parsed.host}`);
    urlsWithoutQuery.add(
      `${parsed.protocol}//${parsed.host}${parsed.pathname}`,
    );
  } catch {
    logger.warn(`Invalid webhook URL format: ${url}`);
  }
}

function writeUniqueUrlFiles(
  csvFileName: string,
  baseUrls: Set<string>,
  urlsWithoutQuery: Set<string>,
  logger: Logger,
): void {
  if (baseUrls.size > 0) {
    const file = csvFileName.replace(/\.csv$/, '-unique-base-urls.txt');
    writeFileSync(file, Array.from(baseUrls).sort().join('\n') + '\n');
    logger.info(`Exported ${baseUrls.size} unique base URLs to ${file}`);
  }

  if (urlsWithoutQuery.size > 0) {
    const file = csvFileName.replace(/\.csv$/, '-unique-urls-no-query.txt');
    writeFileSync(file, Array.from(urlsWithoutQuery).sort().join('\n') + '\n');
    logger.info(
      `Exported ${urlsWithoutQuery.size} unique URLs (without query strings) to ${file}`,
    );
  }
}

// --- Shared webhook collection ---

interface WebhookAccumulator {
  fileName: string;
  baseUrls: Set<string>;
  urlsWithoutQuery: Set<string>;
  onlyActiveWebhooks: boolean;
  logger: Logger;
}

function recordWebhook(row: WebhookStatsResult, acc: WebhookAccumulator): void {
  writeWebhookStatsCsv(row, acc.fileName, acc.logger);
  collectWebhookUrl(row.Url, acc.baseUrls, acc.urlsWithoutQuery, acc.logger);
}

async function collectOrgWebhooks(
  client: OctokitClient,
  owner: string,
  pageSize: number,
  acc: WebhookAccumulator,
): Promise<number> {
  acc.logger.info(`Fetching organization webhooks for: ${owner}`);
  let count = 0;
  for await (const hook of client.listOrgWebhooks(owner, pageSize)) {
    if (acc.onlyActiveWebhooks && !isWebhookActive(hook)) {
      continue;
    }
    recordWebhook(webhookToResult(owner, undefined, 'Organization', hook), acc);
    count++;
  }
  return count;
}

async function collectRepoWebhooks(
  client: OctokitClient,
  owner: string,
  repo: string,
  pageSize: number,
  acc: WebhookAccumulator,
): Promise<number> {
  let count = 0;
  for await (const hook of client.listRepoWebhooks(owner, repo, pageSize)) {
    if (acc.onlyActiveWebhooks && !isWebhookActive(hook)) {
      continue;
    }
    recordWebhook(webhookToResult(owner, repo, 'Repository', hook), acc);
    count++;
  }
  return count;
}

// --- Per-org processing (called by shared executeForOrg via config.processOrg) ---

async function processOrgWebhookStats(context: OrgContext): Promise<void> {
  const {
    opts,
    logger,
    client,
    fileName,
    processedState,
    retryConfig,
    stateManager,
  } = context;

  const orgName = opts.orgName!;
  const pageSize = opts.pageSize || 100;
  const scope = opts.webhookScope ?? 'repo';
  const onlyActiveRepos = opts.onlyActiveRepos ?? false;
  const onlyActiveWebhooks = opts.onlyActiveWebhooks ?? false;

  const startTime = new Date();
  logger.info(
    `Started webhook-stats processing at: ${startTime.toISOString()} ` +
      `(scope: ${scope})`,
  );

  await withRetry(
    async () => {
      const acc: WebhookAccumulator = {
        fileName,
        baseUrls: new Set<string>(),
        urlsWithoutQuery: new Set<string>(),
        onlyActiveWebhooks,
        logger,
      };
      let totalWebhooks = 0;

      if (scopeIncludesOrg(scope)) {
        totalWebhooks += await collectOrgWebhooks(
          client,
          orgName,
          pageSize,
          acc,
        );
      }

      if (scopeIncludesRepo(scope)) {
        logger.info(`Fetching repository webhooks for: ${orgName}`);
        let repoCount = 0;
        for await (const repo of client.listReposForOrg(orgName, pageSize)) {
          if (onlyActiveRepos && repo.archived) {
            logger.debug(`Skipping archived repository: ${repo.name}`);
            continue;
          }
          repoCount++;
          totalWebhooks += await collectRepoWebhooks(
            client,
            orgName,
            repo.name,
            pageSize,
            acc,
          );

          if (repoCount % 100 === 0) {
            logger.info(
              `Processed ${repoCount} repositories so far for ${orgName}`,
            );
          }
        }
      }

      writeUniqueUrlFiles(fileName, acc.baseUrls, acc.urlsWithoutQuery, logger);

      const endTime = new Date();
      const elapsedTime = formatElapsedTime(startTime, endTime);

      processedState.completedSuccessfully = true;
      logger.info('Webhook stats processing completed successfully.');
      logger.info(
        `Completed processing webhooks. ` +
          `Start time: ${startTime.toISOString()}\n` +
          `End time: ${endTime.toISOString()}\n` +
          `Total elapsed time: ${elapsedTime}\n` +
          `Total webhooks found: ${totalWebhooks}\n` +
          `Unique base URLs: ${acc.baseUrls.size}\n` +
          `Output saved to: ${fileName}`,
      );

      stateManager.update(processedState, {});

      if (opts.cleanState) {
        stateManager.cleanup();
      }
    },
    retryConfig,
    (state) => {
      logger.warn(
        `Retry attempt ${state.attempt}: Failed while processing webhooks. ` +
          `Error: ${state.error?.message}\n` +
          `Elapsed time so far: ${formatElapsedTime(startTime, new Date())}`,
      );
      stateManager.update(processedState, {});
    },
  );
}

// --- Repo-list source processing (called via config.processSource) ---

async function processWebhookListSource(
  context: CommandContext,
): Promise<CommandResult> {
  const { opts, logger, client, retryConfig } = context;

  const normalizedRepoList = parseRepoListInput(opts.repoList);
  if (normalizedRepoList.entries.length === 0) {
    throw new Error('--repo-list must contain at least one repository entry');
  }
  validateRepoListAuthSupport(opts, {
    ownerCount: normalizedRepoList.summary.ownerCount,
  });

  const scope = opts.webhookScope ?? 'repo';
  const onlyActiveWebhooks = opts.onlyActiveWebhooks ?? false;
  const pageSize = opts.pageSize || 100;

  logger.info(
    `Processing webhooks for ${normalizedRepoList.summary.uniqueEntryCount} repositories ` +
      `across ${normalizedRepoList.summary.ownerCount} owner groups from --repo-list ` +
      `(scope: ${scope})`,
  );
  if (normalizedRepoList.duplicates.length > 0) {
    logger.warn(
      `Ignored ${normalizedRepoList.duplicates.length} duplicate repo-list entr${
        normalizedRepoList.duplicates.length === 1 ? 'y' : 'ies'
      }`,
    );
  }

  const outputDir = opts.outputDir || 'output';
  const stateManager = new StateManager(
    outputDir,
    'repo-list',
    logger,
    'webhooks',
  );
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
    const baseFileName =
      opts.outputFileName || generateWebhookStatsFileName('repo-list');
    fileName = await resolveOutputPath(opts.outputDir, baseFileName);
    initializeWebhookStatsCsvFile(fileName, logger);
    processedState.outputFileName = fileName;
    stateManager.update(processedState, {});
    logger.info(`Webhook results will be saved to file: ${fileName}`);
  }

  const startTime = new Date();

  await withRetry(
    async () => {
      const acc: WebhookAccumulator = {
        fileName,
        baseUrls: new Set<string>(),
        urlsWithoutQuery: new Set<string>(),
        onlyActiveWebhooks,
        logger,
      };
      let totalWebhooks = 0;

      for (const ownerGroup of normalizedRepoList.groupedByOwner.values()) {
        const owner = ownerGroup.owner;

        if (scopeIncludesOrg(scope)) {
          totalWebhooks += await collectOrgWebhooks(
            client,
            owner,
            pageSize,
            acc,
          );
        }

        if (scopeIncludesRepo(scope)) {
          for (const entry of ownerGroup.entries) {
            totalWebhooks += await collectRepoWebhooks(
              client,
              entry.owner,
              entry.repo,
              pageSize,
              acc,
            );
          }
        }
      }

      writeUniqueUrlFiles(fileName, acc.baseUrls, acc.urlsWithoutQuery, logger);

      processedState.completedSuccessfully = true;
      stateManager.update(processedState, {});
      logger.info(
        `Completed repo-list webhook processing. ` +
          `Total webhooks: ${totalWebhooks}. ` +
          `Unique base URLs: ${acc.baseUrls.size}. ` +
          `Elapsed time: ${formatElapsedTime(startTime, new Date())}. ` +
          `Output saved to: ${fileName}`,
      );
    },
    retryConfig,
    (state) => {
      logger.warn(
        `Retry attempt ${state.attempt}: Failed while processing repo-list webhooks. ` +
          `Error: ${state.error?.message}`,
      );
      stateManager.update(processedState, {});
    },
  );

  if (opts.cleanState) {
    stateManager.cleanup();
  }

  return { outputFiles: [fileName] };
}
