import * as commander from 'commander';
import { parseFileAsNewlineSeparatedOption } from '../utils.js';
import { Arguments } from '../types.js';
import VERSION from '../version.js';
import {
  validateOrgSourceOptions,
  validateBatchOptions,
} from './shared-validation.js';
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

import { runProjectStats } from '../projects.js';

const { Option } = commander;

function validate(opts: Arguments) {
  validateOrgSourceOptions(opts);
  validateBatchOptions(opts);
}

const projectStatsCommand = new commander.Command();

projectStatsCommand
  .name('project-stats')
  .description(
    'Counts unique ProjectsV2 linked to repositories via issues and directly',
  )
  .version(VERSION);

addOrgNameOption(projectStatsCommand);
addOrgListOption(projectStatsCommand);
addAuthOptions(projectStatsCommand);
addApiOptions(projectStatsCommand);
addPageSizeOption(projectStatsCommand, 100);
addRetryOptions(projectStatsCommand);
addStateOptions(projectStatsCommand);
projectStatsCommand
  .addOption(
    new Option(
      '--repo-list <file>',
      'Path to file containing list of repositories to process (format: owner/repo_name)',
    )
      .env('REPO_LIST')
      .argParser(parseFileAsNewlineSeparatedOption),
  )
  .addOption(
    new Option(
      '--repo-names-file <file>',
      'Path to file containing repository names (one per line). If provided, skips querying GitHub for repo names.',
    ).env('REPO_NAMES_FILE'),
  );
addOutputOptions(projectStatsCommand);
addMultiOrgOptions(projectStatsCommand);
addBatchOptions(projectStatsCommand);

projectStatsCommand.action(async (options: Arguments) => {
  console.log('Version:', VERSION);

  console.log('Validating options...');
  validate(options);

  console.log('Starting project-stats...');
  await runProjectStats(options);
  console.log('Project-stats completed.');
});

export default projectStatsCommand;
