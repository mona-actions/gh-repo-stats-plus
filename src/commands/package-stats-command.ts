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

import { runPackageStats } from '../packages.js';

const { Option } = commander;

const SUPPORTED_PACKAGE_TYPES = [
  'maven',
  'npm',
  'docker',
  'nuget',
  'rubygems',
  'pypi',
] as const;

function validate(opts: Arguments) {
  validateOrgSourceOptions(opts);

  if (opts.packageType) {
    const normalized = opts.packageType.toLowerCase();
    if (
      !SUPPORTED_PACKAGE_TYPES.includes(
        normalized as (typeof SUPPORTED_PACKAGE_TYPES)[number],
      )
    ) {
      throw new Error(
        `Unsupported package type: '${opts.packageType}'. ` +
          `Supported types are: ${SUPPORTED_PACKAGE_TYPES.join(', ')}`,
      );
    }
  }
}

const packageStatsCommand = new commander.Command();

packageStatsCommand
  .name('package-stats')
  .description(
    'Retrieves package statistics for an organization. ' +
      'Supports Maven and other GitHub Packages types.',
  )
  .version(VERSION);

addOrgNameOption(packageStatsCommand);
addOrgListOption(packageStatsCommand);
addAuthOptions(packageStatsCommand);
addApiOptions(packageStatsCommand);
addPageSizeOption(packageStatsCommand, 100);
addRetryOptions(packageStatsCommand);
addStateOptions(packageStatsCommand);
addOutputOptions(packageStatsCommand);
addMultiOrgOptions(packageStatsCommand);
packageStatsCommand.addOption(
  new Option(
    '--package-type <type>',
    'The type of package to query (e.g., maven, npm, docker, nuget, rubygems, pypi)',
  )
    .env('PACKAGE_TYPE')
    .default('maven'),
);

packageStatsCommand.action(async (options: Arguments) => {
  console.log('Version:', VERSION);
  console.log('Validating options...');
  validate(options);

  console.log('Starting package-stats...');
  await runPackageStats(options);
  console.log('Package-stats completed.');
});

export default packageStatsCommand;
