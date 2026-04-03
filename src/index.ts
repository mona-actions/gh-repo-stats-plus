import { config } from 'dotenv';
config();

import * as commander from 'commander';

import VERSION from './version.js';
import repoStatsCommand from './commands/repo-stats-command.js';
import missingReposCommand from './commands/missing-repos-command.js';
import projectStatsCommand from './commands/project-stats-command.js';
import appInstallStatsCommand from './commands/app-install-stats-command.js';
import packageStatsCommand from './commands/package-stats-command.js';
import codespaceStatsCommand from './commands/codespace-stats-command.js';
import combineStatsCommand from './commands/combine-stats-command.js';
import postProcessCommand from './commands/post-process-command.js';
import rowsToColumnsCommand from './commands/rows-to-columns-command.js';

const program = new commander.Command();

program
  .description(
    'Fetches and processes repository statistics from GitHub organizations',
  )
  .version(VERSION)
  .addCommand(repoStatsCommand)
  .addCommand(missingReposCommand)
  .addCommand(projectStatsCommand)
  .addCommand(appInstallStatsCommand)
  .addCommand(packageStatsCommand)
  .addCommand(codespaceStatsCommand)
  .addCommand(combineStatsCommand)
  .addCommand(postProcessCommand)
  .addCommand(rowsToColumnsCommand);

program.parse(process.argv);
