import { OctokitClient } from './service.js';
import { Arguments, Logger } from './types.js';
import { createClientFromOpts } from './init.js';
import { appendFileSync, writeFileSync } from 'fs';
import { isAbsolute } from 'path';
import { generateOrgReposFileName, resolveOutputPath } from './utils.js';

export interface BatchMatrix {
  'batch-index': number[];
}

export interface OrgReposResult {
  repos: string[];
  repoCount: number;
  outputFile?: string;
  batchSize?: number;
  totalBatches?: number;
  matrix?: BatchMatrix;
}

/**
 * Calculates a batch matrix from a repo count, respecting the maxBatches limit.
 * If the natural number of batches exceeds maxBatches, the batch size is adjusted upward.
 */
export function calculateBatchMatrix(
  repoCount: number,
  requestedBatchSize: number,
  maxBatches: number,
): { batchSize: number; totalBatches: number; matrix: BatchMatrix } {
  if (requestedBatchSize < 1) {
    throw new Error(
      `requestedBatchSize must be >= 1, got ${requestedBatchSize}`,
    );
  }
  if (maxBatches < 1) {
    throw new Error(`maxBatches must be >= 1, got ${maxBatches}`);
  }

  let batchSize = requestedBatchSize;
  let totalBatches = Math.ceil(repoCount / batchSize);

  if (totalBatches > maxBatches) {
    batchSize = Math.ceil(repoCount / maxBatches);
    totalBatches = Math.ceil(repoCount / batchSize);
  }

  const matrix: BatchMatrix = {
    'batch-index': Array.from({ length: totalBatches }, (_, i) => i),
  };

  return { batchSize, totalBatches, matrix };
}

/**
 * Lists all repositories for an organization and optionally writes them to a
 * file and/or calculates a batch matrix.
 */
export async function runOrgRepos(opts: Arguments): Promise<OrgReposResult> {
  const orgName = opts.orgName;
  if (!orgName) {
    throw new Error('orgName is required');
  }

  const logFileName = `${orgName}-org-repos-${
    new Date().toISOString().split('T')[0]
  }.log`;
  const { logger, client } = await createClientFromOpts(opts, logFileName);

  return fetchOrgRepos({ orgName, opts, client, logger });
}

/**
 * Core fetch logic — separated so it can be unit tested with a mock client.
 * Streams repos to file incrementally as they arrive from the API.
 */
export async function fetchOrgRepos({
  orgName,
  opts,
  client,
  logger,
}: {
  orgName: string;
  opts: Pick<
    Arguments,
    'pageSize' | 'outputFileName' | 'outputDir' | 'batchSize' | 'maxBatches'
  >;
  client: Pick<OctokitClient, 'listOrgRepoNames'>;
  logger: Logger;
}): Promise<OrgReposResult> {
  const pageSize = opts.pageSize ?? 100;

  logger.info(`Fetching repos for organization: ${orgName}`);

  // Resolve file path up front if writing is requested
  let fileName: string | undefined;
  if (opts.outputFileName) {
    fileName = isAbsolute(opts.outputFileName)
      ? opts.outputFileName
      : await resolveOutputPath(
          opts.outputDir,
          opts.outputFileName || generateOrgReposFileName(orgName),
        );
    // Initialize empty file (truncate if exists)
    writeFileSync(fileName, '', 'utf-8');
  }

  // Stream repos: write to file incrementally and collect into array
  const repos: string[] = [];
  for await (const repo of client.listOrgRepoNames(orgName, pageSize)) {
    const fullName = `${repo.owner.login}/${repo.name}`;
    repos.push(fullName);
    if (fileName) {
      appendFileSync(fileName, `${fullName}\n`, 'utf-8');
    }
    logger.debug(`Found repo: ${fullName}`);
  }

  logger.info(`Total repos found: ${repos.length}`);

  const result: OrgReposResult = { repos, repoCount: repos.length };

  if (fileName) {
    result.outputFile = fileName;
    logger.info(`Wrote ${repos.length} repos to ${fileName}`);
  }

  if (opts.batchSize != null) {
    const maxBatches = opts.maxBatches ?? 256;
    const { batchSize, totalBatches, matrix } = calculateBatchMatrix(
      repos.length,
      opts.batchSize,
      maxBatches,
    );
    result.batchSize = batchSize;
    result.totalBatches = totalBatches;
    result.matrix = matrix;
    logger.info(
      `Batch matrix: ${repos.length} repos → ${totalBatches} batches of ~${batchSize}`,
    );
  }

  return result;
}
