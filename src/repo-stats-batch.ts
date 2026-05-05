import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import type { Logger } from './types.js';
import type { OctokitClient } from './service.js';

/**
 * Returns the slice of an organization's repository list for the requested
 * batch.
 *
 * By default, fetches the full list of repository names via a lightweight
 * GraphQL query. When `repoListFile` is provided, reads the list from that
 * file instead, so parallel matrix runs do not all re-paginate the same org.
 */
export async function getRepoListForBatch({
  client,
  orgName,
  batchSize,
  batchIndex,
  pageSize,
  logger,
  repoListFile,
}: {
  client: Pick<OctokitClient, 'listOrgRepoNames'>;
  orgName: string;
  batchSize: number;
  batchIndex: number;
  pageSize: number;
  logger: Logger;
  repoListFile?: string;
}): Promise<string[]> {
  let allRepos: string[];

  if (repoListFile) {
    logger.info(
      `Batch mode: reading repository list from file '${repoListFile}' for org '${orgName}' (batch size: ${batchSize}, batch index: ${batchIndex})`,
    );
    allRepos = readRepoListFromFile(repoListFile, orgName, logger);
  } else {
    logger.info(
      `Batch mode: fetching repository list for org '${orgName}' (batch size: ${batchSize}, batch index: ${batchIndex})`,
    );
    allRepos = [];
    for await (const repo of client.listOrgRepoNames(orgName, pageSize)) {
      allRepos.push(`${repo.owner.login}/${repo.name}`);
    }
  }

  const totalRepos = allRepos.length;
  const totalBatches = Math.ceil(totalRepos / batchSize);

  logger.info(
    `Total repositories: ${totalRepos}, Total batches: ${totalBatches} (batch size: ${batchSize})`,
  );

  if (totalRepos === 0) {
    logger.info(
      `Organization '${orgName}' has no repositories. Nothing to process.`,
    );
    return [];
  }

  if (batchIndex >= totalBatches) {
    logger.warn(
      `Batch index ${batchIndex} is out of range (total batches: ${totalBatches}). No repositories to process.`,
    );
    return [];
  }

  const start = batchIndex * batchSize;
  const end = Math.min(start + batchSize, totalRepos);
  const batchRepos = allRepos.slice(start, end);

  logger.info(
    `Batch ${batchIndex} of ${totalBatches}: processing repositories ${start + 1}-${end} of ${totalRepos}`,
  );

  return batchRepos;
}

function readRepoListFromFile(
  filePath: string,
  orgName: string,
  logger: Logger,
): string[] {
  const resolved = resolve(process.cwd(), filePath);
  if (!existsSync(resolved)) {
    throw new Error(`Batch repo list file not found: ${filePath}`);
  }

  const raw = readFileSync(resolved, 'utf-8');
  const result: string[] = [];
  let skipped = 0;

  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    let owner: string;
    let repo: string;
    if (line.includes('/')) {
      const parts = line.split('/');
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        logger.warn(
          `Skipping malformed entry in repo list file: '${rawLine}' (expected 'owner/repo' or bare repo name)`,
        );
        skipped++;
        continue;
      }
      [owner, repo] = parts;
    } else {
      owner = orgName;
      repo = line;
    }

    if (owner.toLowerCase() !== orgName.toLowerCase()) {
      logger.warn(
        `Skipping entry '${rawLine}' from repo list file: owner '${owner}' does not match --org-name '${orgName}'`,
      );
      skipped++;
      continue;
    }

    result.push(`${owner}/${repo}`);
  }

  if (skipped > 0) {
    logger.warn(
      `Skipped ${skipped} entr${skipped === 1 ? 'y' : 'ies'} from repo list file '${filePath}'`,
    );
  }

  return result;
}
