import { appendFileSync } from 'fs';
import { readCsvFile } from './csv.js';
import { createClientFromOpts } from './init.js';
import { hasRepoListInput, readRepoListInputLines } from './repo-list.js';
import { resolveOutputPath } from './utils.js';
import type { Arguments } from './types.js';

export async function checkForMissingRepos({
  opts,
  processedFile,
}: {
  opts: Arguments;
  processedFile: string;
}): Promise<{
  missingRepos: string[];
}> {
  const logFileName = `${opts.orgName!}-missing-repos-check-${
    new Date().toISOString().split('T')[0]
  }.log`;
  const { logger, client } = await createClientFromOpts(opts, logFileName);

  const org = opts.orgName!.toLowerCase();
  const per_page = opts.pageSize || 10;

  logger.debug(`Checking for missing repositories in organization: ${org}`);

  logger.info(
    `Reading processed file: ${processedFile} to check for missing repositories`,
  );
  const records = readCsvFile(processedFile);

  logger.debug(`Parsed ${records.length} records from processed file`);
  const processedReposSet = new Set<string>();
  (records as Array<{ Repo_Name: string }>).forEach((record) => {
    processedReposSet.add(record.Repo_Name.toLowerCase());
  });

  const timestampSuffix = generateTimestampSuffix(new Date());
  const baseMissingReposFileName = `${org}-missing-repos-${timestampSuffix}.csv`;
  const missingReposFileName = await resolveOutputPath(
    opts.outputDir,
    baseMissingReposFileName,
  );

  logger.info('Checking for missing repositories');
  const missingRepos = [];

  if (hasRepoListInput(opts.repoList)) {
    logger.info('Checking against provided repo list');
    const repoListRaw = readRepoListInputLines(opts.repoList);

    const repoList = repoListRaw
      .filter((line) => line.trim() !== '' && !line.trim().startsWith('#'))
      .map((line) => {
        const parts = line.trim().split('/');
        return {
          owner: parts.length > 1 ? parts[0] : '',
          repo: parts.length > 1 ? parts[1] : parts[0],
        };
      })
      .filter(({ owner }) => !owner || owner.toLowerCase() === org);

    logger.info(`Found ${repoList.length} repos for ${org} in repo list`);

    for (const { repo: repoName } of repoList) {
      if (!processedReposSet.has(repoName.toLowerCase())) {
        missingRepos.push(repoName);
        appendFileSync(missingReposFileName, `${repoName}\n`);
      }
    }
  } else {
    logger.info('Checking against all organization repositories');
    for await (const repo of client.listReposForOrg(org, per_page)) {
      if (!processedReposSet.has(repo.name.toLowerCase())) {
        missingRepos.push(repo.name);
        appendFileSync(missingReposFileName, `${repo.name}\n`);
      }
    }
  }
  logger.info(`Found ${missingRepos.length} missing repositories`);
  if (missingRepos.length > 0) {
    logger.info(`Missing repositories written to: ${missingReposFileName}`);
  }

  return { missingRepos };
}

function generateTimestampSuffix(date: Date): string {
  const iso = date.toISOString();
  const [datePart, timePart] = iso.split('T');
  const [hour, minute] = timePart.split(':');
  return `${datePart}-${hour}-${minute}`;
}
