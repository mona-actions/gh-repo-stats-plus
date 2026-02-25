import * as commander from 'commander';
import {
  parseFloatOption,
  parseIntOption,
  parseBooleanOption,
  parseFileAsNewlineSeparatedOption,
} from '../utils.js';
import { Arguments } from '../types.js';
import VERSION from '../version.js';

import { runProjectStats } from '../projects.js';

const { Option } = commander;

function validate(opts: Arguments) {
  if (!opts.orgName && !opts.orgList) {
    throw new Error(
      'Either orgName (-o, --org-name <org>) or orgList (--org-list <file>) must be provided',
    );
  }

  if (opts.orgName && opts.orgList) {
    throw new Error(
      'Cannot specify both orgName (-o, --org-name <org>) and orgList (--org-list <file>)',
    );
  }
}

const projectStatsCommand = new commander.Command();

projectStatsCommand
  .name('project-stats')
  .description(
    'Counts unique ProjectsV2 linked to repositories via issues and directly',
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
    )
      .env('ORG_LIST')
      .argParser(parseFileAsNewlineSeparatedOption),
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
      .default(10)
      .argParser(parseIntOption),
  )
  .addOption(
    new Option(
      '--rate-limit-check-interval <seconds>',
      'Interval for rate limit checks in seconds',
    )
      .env('RATE_LIMIT_CHECK_INTERVAL')
      .default(60)
      .argParser(parseIntOption),
  )
  .addOption(
    new Option(
      '--retry-max-attempts <attempts>',
      'Maximum number of retry attempts',
    )
      .env('RETRY_MAX_ATTEMPTS')
      .default(3)
      .argParser(parseIntOption),
  )
  .addOption(
    new Option(
      '--retry-initial-delay <milliseconds>',
      'Initial delay for retry in milliseconds',
    )
      .env('RETRY_INITIAL_DELAY')
      .default(1000)
      .argParser(parseIntOption),
  )
  .addOption(
    new Option(
      '--retry-max-delay <milliseconds>',
      'Maximum delay for retry in milliseconds',
    )
      .env('RETRY_MAX_DELAY')
      .default(30000)
      .argParser(parseIntOption),
  )
  .addOption(
    new Option(
      '--retry-backoff-factor <factor>',
      'Backoff factor for retry delays',
    )
      .env('RETRY_BACKOFF_FACTOR')
      .default(2)
      .argParser(parseFloatOption),
  )
  .addOption(
    new Option(
      '--retry-success-threshold <count>',
      'Number of successful operations before resetting retry count',
    )
      .env('RETRY_SUCCESS_THRESHOLD')
      .default(5)
      .argParser(parseIntOption),
  )
  .addOption(
    new Option(
      '--resume-from-last-save [value]',
      'Resume from the last saved state',
    )
      .env('RESUME_FROM_LAST_SAVE')
      .argParser(parseBooleanOption),
  )
  .addOption(
    new Option(
      '--force-fresh-start [value]',
      'Force a fresh start, ignoring any existing state (overrides resume-from-last-save)',
    )
      .env('FORCE_FRESH_START')
      .argParser(parseBooleanOption),
  )
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
      .argParser(parseBooleanOption),
  )
  .addOption(
    new Option(
      '--delay-between-orgs <seconds>',
      'Delay between processing organizations in seconds (for multi-org mode)',
    )
      .env('DELAY_BETWEEN_ORGS')
      .default(5)
      .argParser(parseIntOption),
  )
  .addOption(
    new Option(
      '--continue-on-error [value]',
      'Continue processing other organizations if one fails (for multi-org mode)',
    )
      .env('CONTINUE_ON_ERROR')
      .argParser(parseBooleanOption),
  )
  .action(async (options: Arguments) => {
    console.log('Version:', VERSION);

    console.log('Validating options...');
    validate(options);

    console.log('Starting project-stats...');
    await runProjectStats(options);
    console.log('Project-stats completed.');
  });

export default projectStatsCommand;
