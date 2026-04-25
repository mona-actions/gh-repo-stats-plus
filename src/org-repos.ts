import { OctokitClient } from './service.js';
import { Arguments, Logger } from './types.js';
import { createClientFromOpts } from './init.js';
import { writeFileSync } from 'fs';
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
 * Calculates a batch matrix from a list of repos, respecting the maxBatches limit.
 * If the natural number of batches exceeds maxBatches, the batch size is adjusted upward.
 */
export function calculateBatchMatrix(
  repos: string[],
  requestedBatchSize: number,
  maxBatches: number,
): { batchSize: number; totalBatches: number; matrix: BatchMatrix } {
  let batchSize = requestedBatchSize;
  let totalBatches = Math.ceil(repos.length / batchSize);

  if (totalBatches > maxBatches) {
    batchSize = Math.ceil(repos.length / maxBatches);
    totalBatches = Math.ceil(repos.length / batchSize);
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

  const repos: string[] = [];
  for await (const repo of client.listOrgRepoNames(orgName, pageSize)) {
    const fullName = `${repo.owner.login}/${repo.name}`;
    repos.push(fullName);
    logger.debug(`Found repo: ${fullName}`);
  }

  logger.info(`Total repos found: ${repos.length}`);

  const result: OrgReposResult = { repos, repoCount: repos.length };

  if (opts.outputFileName) {
    const fileName = opts.outputFileName.includes('/')
      ? opts.outputFileName
      : await resolveOutputPath(
          opts.outputDir,
          opts.outputFileName || generateOrgReposFileName(orgName),
        );
    writeFileSync(fileName, repos.join('\n') + '\n', 'utf-8');
    result.outputFile = fileName;
    logger.info(`Wrote ${repos.length} repos to ${fileName}`);
  }

  if (opts.batchSize != null) {
    const maxBatches = opts.maxBatches ?? 256;
    const { batchSize, totalBatches, matrix } = calculateBatchMatrix(
      repos,
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
