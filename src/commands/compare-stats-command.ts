import * as commander from 'commander';
import { existsSync } from 'fs';
import { DEFAULT_SIZE_TOLERANCE_PCT } from '../compare-stats-core.js';
import { runCompareStats } from '../compare-stats.js';
import type { CompareStatsOptions } from '../compare-stats-types.js';
import { formatErrorMessage } from '../errors.js';
import {
  parseApiVersionOption,
  parseFloatOption,
  parseIntOption,
} from '../utils.js';
import { DEFAULT_API_VERSION, VALID_API_VERSIONS } from '../service.js';
import VERSION from '../version.js';

const { Option } = commander;

export function validate(options: CompareStatsOptions) {
  if (!existsSync(options.sourceFile)) {
    throw new Error(`Source file not found: ${options.sourceFile}`);
  }

  if (!existsSync(options.targetFile)) {
    throw new Error(`Target file not found: ${options.targetFile}`);
  }

  if (
    options.sizeTolerancePct !== undefined &&
    (options.sizeTolerancePct < 0 || options.sizeTolerancePct > 100)
  ) {
    throw new Error('--size-tolerance-pct must be between 0 and 100');
  }

  if (options.verifyGit && (!options.sourceOrg || !options.targetOrg)) {
    throw new Error(
      '--verify-git requires both --source-org and --target-org to be specified',
    );
  }
}

export function createCompareStatsCommand(): commander.Command {
  const command = new commander.Command();

  command
    .name('compare-stats')
    .description(
      'Compares two repo-stats CSV files (source vs target) by joining on Repo_Name and reporting per-column differences. ' +
        'Designed to verify GitHub Enterprise Cloud migrations.',
    )
    .version(VERSION)
    .addOption(
      new Option(
        '--source-file <path>',
        'Repo-stats CSV produced from the source organization',
      )
        .env('SOURCE_FILE')
        .makeOptionMandatory(true),
    )
    .addOption(
      new Option(
        '--target-file <path>',
        'Repo-stats CSV produced from the target organization',
      )
        .env('TARGET_FILE')
        .makeOptionMandatory(true),
    )
    .addOption(
      new Option('--output-dir <dir>', 'Output directory for the diff report')
        .env('OUTPUT_DIR')
        .default('output'),
    )
    .addOption(
      new Option(
        '--output-file <name>',
        'Name for the diff report CSV file (default: auto-generated with timestamp)',
      ).env('OUTPUT_FILE'),
    )
    .addOption(
      new Option(
        '--size-tolerance-pct <percent>',
        'Percentage tolerance applied to Repo_Size_mb before reporting a difference',
      )
        .env('SIZE_TOLERANCE_PCT')
        .default(DEFAULT_SIZE_TOLERANCE_PCT)
        .argParser(parseFloatOption),
    )
    .addOption(
      new Option(
        '--fail-on-blocking',
        'Exit with a non-zero status code when any blocking finding is reported',
      ).env('FAIL_ON_BLOCKING'),
    )
    .addOption(
      new Option(
        '--verify-git',
        'Additionally compare branch and tag SHAs live against both hosts',
      ).env('VERIFY_GIT'),
    )
    .addOption(
      new Option(
        '--source-org <org>',
        'Source organization name (required for --verify-git)',
      ).env('SOURCE_ORG'),
    )
    .addOption(
      new Option(
        '--target-org <org>',
        'Target organization name (required for --verify-git)',
      ).env('TARGET_ORG'),
    )
    .addOption(
      new Option(
        '--source-base-url <url>',
        'GitHub API base URL for the source',
      )
        .env('SOURCE_BASE_URL')
        .default('https://api.github.com'),
    )
    .addOption(
      new Option(
        '--target-base-url <url>',
        'GitHub API base URL for the target (e.g. https://api.<subdomain>.ghe.com)',
      )
        .env('TARGET_BASE_URL')
        .default('https://api.github.com'),
    )
    .addOption(
      new Option(
        '--source-token <token>',
        'Access token for the source host (falls back to ACCESS_TOKEN / GH_TOKEN / GITHUB_TOKEN)',
      ).env('SOURCE_TOKEN'),
    )
    .addOption(
      new Option(
        '--target-token <token>',
        'Access token for the target host (falls back to ACCESS_TOKEN / GH_TOKEN / GITHUB_TOKEN)',
      ).env('TARGET_TOKEN'),
    )
    .addOption(
      new Option('--proxy-url <url>', 'Proxy URL if required').env('PROXY_URL'),
    )
    .addOption(
      new Option(
        '--ca-cert-path <path>',
        'Path to CA certificate bundle (PEM) for TLS verification',
      ).env('CA_CERT_PATH'),
    )
    .addOption(
      new Option(
        '--api-version <version>',
        `GitHub API version to use (${VALID_API_VERSIONS.join(' or ')})`,
      )
        .env('GITHUB_API_VERSION')
        .default(DEFAULT_API_VERSION)
        .argParser(parseApiVersionOption),
    )
    .addOption(
      new Option('--page-size <size>', 'Number of git refs per API page')
        .env('PAGE_SIZE')
        .default(100)
        .argParser(parseIntOption),
    )
    .addOption(
      new Option(
        '--rate-limit-check-interval <count>',
        'How many repositories to process between rate limit checks',
      )
        .env('RATE_LIMIT_CHECK_INTERVAL')
        .default(10)
        .argParser(parseIntOption),
    )
    .addOption(
      new Option('-v, --verbose', 'Enable verbose logging').env('VERBOSE'),
    )
    .action(async (options: CompareStatsOptions) => {
      console.log('Version:', VERSION);

      console.log('Validating options...');
      validate(options);

      console.log('Starting compare-stats...');
      try {
        const { summary } = await runCompareStats(options);
        console.log('Compare-stats completed.');

        if (options.failOnBlocking && summary.blockingFindingCount > 0) {
          console.error(
            `Found ${summary.blockingFindingCount} blocking finding(s) across ${summary.reposWithBlockingDiffs} repositories.`,
          );
          process.exitCode = 1;
        }
      } catch (error) {
        console.error(`compare-stats failed: ${formatErrorMessage(error)}`);
        throw error;
      }
    });

  return command;
}

const compareStatsCommand = createCompareStatsCommand();
export default compareStatsCommand;
