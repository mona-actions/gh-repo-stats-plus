import * as commander from 'commander';
import { Arguments } from '../types.js';
import VERSION from '../version.js';
import { validateOrgSourceOptions } from './shared-validation.js';
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
} from './shared-options.js';

import { runCodespaceStats } from '../codespaces.js';

const codespaceStatsCommand = new commander.Command();

codespaceStatsCommand
  .name('codespace-stats')
  .description(
    'Retrieves codespace usage statistics for an organization. ' +
      'Lists all codespaces grouped by repository with machine details.',
  )
  .version(VERSION);

addOrgNameOption(codespaceStatsCommand);
addOrgListOption(codespaceStatsCommand);
addAuthOptions(codespaceStatsCommand);
addApiOptions(codespaceStatsCommand);
addPageSizeOption(codespaceStatsCommand, 100);
addRetryOptions(codespaceStatsCommand);
addStateOptions(codespaceStatsCommand);
addOutputOptions(codespaceStatsCommand);
addMultiOrgOptions(codespaceStatsCommand);

codespaceStatsCommand.action(async (options: Arguments) => {
  console.log('Version:', VERSION);
  console.log('Validating options...');
  validateOrgSourceOptions(options);

  console.log('Starting codespace-stats...');
  await runCodespaceStats(options);
  console.log('Codespace-stats completed.');
});

export default codespaceStatsCommand;
