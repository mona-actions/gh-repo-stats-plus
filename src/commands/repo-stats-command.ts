import * as commander from 'commander';
import { parseIntOption, parseBooleanOption } from '../utils.js';
import { Arguments } from '../types.js';
import VERSION from '../version.js';
import { parseRepoListFileOption } from '../repo-list.js';
import { getRepoStatsSourceModeStatus } from '../repo-stats-source-mode.js';
import { validateBatchOptions } from './shared-validation.js';
import {
  addOrgNameOption,
  addOrgListOption,
  addAuthOptions,
  addApiOptions,
  addPageSizeOption,
  addRetryOptions,
  addStateOptions,
  addOutputOptions,
  addMultiOrgOptions,
  addBatchOptions,
} from './shared-options.js';

import { run } from '../main.js';

const { Option } = commander;

export function validateRepoStatsOptions(opts: Arguments) {
  const { hasRepoList, hasEmptyRepoList, sourceModeCount } =
    getRepoStatsSourceModeStatus(opts);

  if (hasEmptyRepoList) {
    throw new Error(
      '--repo-list must contain at least one repository entry in owner/repo format',
    );
  }

  if (sourceModeCount === 0) {
    throw new Error(
      'Exactly one source mode must be provided: orgName (-o, --org-name <org>), orgList (--org-list <file>), or repoList (--repo-list <file>)',
    );
  }

  if (sourceModeCount > 1) {
    throw new Error(
      'Cannot combine source modes. Specify exactly one of --org-name, --org-list, or --repo-list.',
    );
  }

  // repo-stats disallows combining batch mode with --repo-list
  if (opts.batchSize != null && hasRepoList) {
    throw new Error(
      'Batch mode (--batch-size) cannot be used with --repo-list. Batch mode generates its own repo list.',
    );
  }

  validateBatchOptions(opts, { allowRepoList: true });
}

const repoStatsCommand = new commander.Command();

repoStatsCommand
  .name('repo-stats')
  .description(
    'Gathers repo-stats for all repositories in an organization or multiple organizations',
  )
  .version(VERSION);

addOrgNameOption(repoStatsCommand);
addOrgListOption(repoStatsCommand);
addAuthOptions(repoStatsCommand);
addApiOptions(repoStatsCommand);
addPageSizeOption(repoStatsCommand, 10);
repoStatsCommand.addOption(
  new Option('--extra-page-size <size>', 'Extra page size')
    .env('EXTRA_PAGE_SIZE')
    .default(25)
    .argParser(parseIntOption),
);
addRetryOptions(repoStatsCommand);
addStateOptions(repoStatsCommand);
repoStatsCommand
  .addOption(
    new Option(
      '--repo-list <file>',
      'Path to file containing list of repositories to process (format: owner/repo_name)',
    )
      .env('REPO_LIST')
      .argParser(parseRepoListFileOption),
  )
  .addOption(
    new Option(
      '--auto-process-missing [value]',
      'Automatically process any missing repositories when main processing is complete',
    )
      .env('AUTO_PROCESS_MISSING')
      .argParser(parseBooleanOption),
  );
addOutputOptions(repoStatsCommand);
addMultiOrgOptions(repoStatsCommand);
addBatchOptions(repoStatsCommand);

repoStatsCommand.action(async (options: Arguments) => {
  console.log('Version:', VERSION);

  console.log('Validating options...');
  validateRepoStatsOptions(options);

  console.log('Starting repo-stats...');
  await run(options);
  console.log('Repo-stats completed.');
});

export default repoStatsCommand;
