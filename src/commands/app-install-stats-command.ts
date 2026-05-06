import * as commander from 'commander';
import { parseBooleanOption } from '../utils.js';
import { Arguments } from '../types.js';
import VERSION from '../version.js';
import { validateOrgSourceOptions } from './shared-validation.js';
import {
  addOrgNameOption,
  addOrgListOption,
  addApiOptions,
  addPageSizeOption,
  addRetryOptions,
  addStateOptions,
  addOutputOptions,
  addMultiOrgOptions,
} from './shared-options.js';

import { runAppInstallStats } from '../app-installs.js';

const { Option } = commander;

const appInstallStatsCommand = new commander.Command();

appInstallStatsCommand
  .name('app-install-stats')
  .description(
    'Retrieves GitHub App installation statistics for an organization. ' +
      'Requires a Personal Access Token (PAT) — app tokens cannot view other apps.',
  )
  .version(VERSION);

addOrgNameOption(appInstallStatsCommand);
addOrgListOption(appInstallStatsCommand);
// app-install-stats only uses PAT auth (not GitHub App auth)
appInstallStatsCommand.addOption(
  new Option('-t, --access-token <token>', 'GitHub access token').env(
    'ACCESS_TOKEN',
  ),
);
addApiOptions(appInstallStatsCommand);
addPageSizeOption(appInstallStatsCommand, 30);
addRetryOptions(appInstallStatsCommand);
addStateOptions(appInstallStatsCommand);
addOutputOptions(appInstallStatsCommand);
addMultiOrgOptions(appInstallStatsCommand);
appInstallStatsCommand
  .addOption(
    new Option(
      '--skip-per-repo-install-csv [value]',
      'Skip generating the per-repo installations CSV file',
    )
      .env('SKIP_PER_REPO_INSTALL_CSV')
      .argParser(parseBooleanOption),
  )
  .addOption(
    new Option(
      '--skip-repo-app-detail-csv [value]',
      'Skip generating the repo-app details CSV file',
    )
      .env('SKIP_REPO_APP_DETAIL_CSV')
      .argParser(parseBooleanOption),
  )
  .addOption(
    new Option(
      '--skip-app-repos-csv [value]',
      'Skip generating the app-repos summary CSV file',
    )
      .env('SKIP_APP_REPOS_CSV')
      .argParser(parseBooleanOption),
  );

appInstallStatsCommand.action(async (options: Arguments) => {
  console.log('Version:', VERSION);

  console.log('Validating options...');
  validateOrgSourceOptions(options);

  console.log('Starting app-install-stats...');
  await runAppInstallStats(options);
  console.log('App-install-stats completed.');
});

export default appInstallStatsCommand;
