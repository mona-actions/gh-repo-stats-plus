import { OctokitClient } from './service.js';
import { Arguments, Logger } from './types.js';
import { createClientFromOpts } from './init.js';
import { createWriteStream, WriteStream } from 'fs';
import { isAbsolute } from 'path';
import { resolveOutputPath } from './utils.js';

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

async function writeOutputLine(
  outputStream: WriteStream,
  line: string,
): Promise<void> {
  if (outputStream.write(line, 'utf-8')) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      outputStream.off('drain', onDrain);
      outputStream.off('error', onError);
    };

    outputStream.once('drain', onDrain);
    outputStream.once('error', onError);
  });
}

async function closeOutputStream(outputStream: WriteStream): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onFinish = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      outputStream.off('finish', onFinish);
      outputStream.off('error', onError);
    };

    outputStream.once('finish', onFinish);
    outputStream.once('error', onError);
    outputStream.end();
  });
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
  let outputStream: WriteStream | undefined;
  if (opts.outputFileName) {
    fileName = isAbsolute(opts.outputFileName)
      ? opts.outputFileName
      : await resolveOutputPath(opts.outputDir, opts.outputFileName);
    outputStream = createWriteStream(fileName, {
      encoding: 'utf-8',
      flags: 'w',
    });
  }

  // Stream repos: write to file incrementally and collect into array
  const repos: string[] = [];
  try {
    for await (const repo of client.listOrgRepoNames(orgName, pageSize)) {
      const fullName = `${repo.owner.login}/${repo.name}`;
      repos.push(fullName);
      if (outputStream) {
        await writeOutputLine(outputStream, `${fullName}\n`);
      }
      logger.debug(`Found repo: ${fullName}`);
    }
  } finally {
    if (outputStream) {
      await closeOutputStream(outputStream);
    }
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
