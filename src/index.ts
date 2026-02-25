import { config } from 'dotenv';
config();

import * as commander from 'commander';

import VERSION from './version.js';
import repoStatsCommand from './commands/repo-stats-command.js';
import missingReposCommand from './commands/missing-repos-command.js';
import projectStatsCommand from './commands/project-stats-command.js';
import combineStatsCommand from './commands/combine-stats-command.js';

const program = new commander.Command();

program
  .description(
    'Fetches and processes repository statistics from GitHub organizations',
  )
  .version(VERSION)
  .addCommand(repoStatsCommand)
  .addCommand(missingReposCommand)
  .addCommand(projectStatsCommand)
  .addCommand(combineStatsCommand);

program.parse(process.argv);
