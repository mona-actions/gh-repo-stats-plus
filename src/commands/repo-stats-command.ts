import * as commander from 'commander';
import {
  parseFloatOption,
  parseIntOption,
  parseBooleanOption,
} from '../utils.js';
import { Arguments } from '../types.js';
import VERSION from '../version.js';

import { run, runMultiOrg } from '../main.js';

const repoStatsCommand = new commander.Command();
const { Option } = commander;

repoStatsCommand
  .name('repo-stats')
  .description(
    'Gathers repo-stats for all repositories in an organization or multiple organizations',
  )
  .version(VERSION)
  .addOption(
    new Option(
      '-o, --org-name <org>',
      'The name of the organization to process',
    ).env('ORG_NAME'),
  )
  .addOption(
    new Option(
      '--org-list <file>',
      'Path to file containing list of organizations to process (one org per line)',
    ).env('ORG_LIST'),
  )
  .addOption(
    new Option('-t, --access-token <token>', 'GitHub access token').env(
      'ACCESS_TOKEN',
    ),
  )
  .addOption(
    new Option('-u, --base-url <url>', 'GitHub API base URL')
      .env('BASE_URL')
      .default('https://api.github.com'),
  )
  .addOption(
    new Option('--proxy-url <url>', 'Proxy URL if required').env('PROXY_URL'),
  )
  .addOption(
    new Option('-v, --verbose', 'Enable verbose logging').env('VERBOSE'),
  )
  .addOption(new Option('--app-id <id>', 'GitHub App ID').env('APP_ID'))
  .addOption(
    new Option('--private-key <key>', 'GitHub App private key').env(
      'PRIVATE_KEY',
    ),
  )
  .addOption(
    new Option(
      '--private-key-file <file>',
      'Path to GitHub App private key file',
    ).env('PRIVATE_KEY_FILE'),
  )
  .addOption(
    new Option('--app-installation-id <id>', 'GitHub App installation ID').env(
      'APP_INSTALLATION_ID',
    ),
  )
  .addOption(
    new Option('--page-size <size>', 'Number of items per page')
      .env('PAGE_SIZE')
      .default('10')
      .argParser(parseIntOption),
  )
  .addOption(
    new Option('--extra-page-size <size>', 'Extra page size')
      .env('EXTRA_PAGE_SIZE')
      .default('25')
      .argParser(parseIntOption),
  )
  .addOption(
    new Option(
      '--rate-limit-check-interval <seconds>',
      'Interval for rate limit checks in seconds',
    )
      .env('RATE_LIMIT_CHECK_INTERVAL')
      .default('60')
      .argParser(parseIntOption),
  )
  .addOption(
    new Option(
      '--retry-max-attempts <attempts>',
      'Maximum number of retry attempts',
    )
      .env('RETRY_MAX_ATTEMPTS')
      .default('3')
      .argParser(parseIntOption),
  )
  .addOption(
    new Option(
      '--retry-initial-delay <milliseconds>',
      'Initial delay for retry in milliseconds',
    )
      .env('RETRY_INITIAL_DELAY')
      .default('1000')
      .argParser(parseIntOption),
  )
  .addOption(
    new Option(
      '--retry-max-delay <milliseconds>',
      'Maximum delay for retry in milliseconds',
    )
      .env('RETRY_MAX_DELAY')
      .default('30000')
      .argParser(parseIntOption),
  )
  .addOption(
    new Option(
      '--retry-backoff-factor <factor>',
      'Backoff factor for retry delays',
    )
      .env('RETRY_BACKOFF_FACTOR')
      .default('2')
      .argParser(parseFloatOption),
  )
  .addOption(
    new Option(
      '--retry-success-threshold <count>',
      'Number of successful operations before resetting retry count',
    )
      .env('RETRY_SUCCESS_THRESHOLD')
      .default('5')
      .argParser(parseIntOption),
  )
  .addOption(
    new Option(
      '--resume-from-last-save [value]',
      'Resume from the last saved state',
    )
      .env('RESUME_FROM_LAST_SAVE')
      .default('false')
      .argParser(parseBooleanOption),
  )
  .addOption(
    new Option(
      '--repo-list <file>',
      'Path to file containing list of repositories to process (format: owner/repo_name)',
    ).env('REPO_LIST'),
  )
  .addOption(
    new Option(
      '--auto-process-missing [value]',
      'Automatically process any missing repositories when main processing is complete',
    )
      .env('AUTO_PROCESS_MISSING')
      .default('false')
      .argParser(parseBooleanOption),
  )
  .addOption(
    new Option('--output-dir <dir>', 'Output directory for generated files')
      .env('OUTPUT_DIR')
      .default('output'),
  )
  .addOption(
    new Option(
      '--clean-state [value]',
      'Remove state file after successful completion',
    )
      .env('CLEAN_STATE')
      .default('false')
      .argParser(parseBooleanOption),
  )
  .addOption(
    new Option(
      '--delay-between-orgs <seconds>',
      'Delay between processing organizations in seconds (for multi-org mode)',
    )
      .env('DELAY_BETWEEN_ORGS')
      .default('5')
      .argParser(parseIntOption),
  )
  .addOption(
    new Option(
      '--continue-on-error [value]',
      'Continue processing other organizations if one fails (for multi-org mode)',
    )
      .env('CONTINUE_ON_ERROR')
      .default('false')
      .argParser(parseBooleanOption),
  )
  .action(async (options: Arguments) => {
    console.log('Version:', VERSION);

    // Validate that either org-name or org-list is provided
    if (!options.orgName && !options.orgList) {
      console.error('Error: Either --org-name or --org-list must be provided');
      process.exit(1);
    }

    if (options.orgName && options.orgList) {
      console.error('Error: Cannot specify both --org-name and --org-list');
      process.exit(1);
    }

    console.log('Starting repo-stats...');

    if (options.orgList) {
      // Multi-org processing
      await runMultiOrg(options);
    } else {
      // Single org processing
      await run(options);
    }

    console.log('Repo-stats completed.');
  });

export default repoStatsCommand;
