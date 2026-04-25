import * as commander from 'commander';
import {
  parseFloatOption,
  parseIntOption,
  parseBooleanOption,
  parseFileAsNewlineSeparatedOption,
  parseApiVersionOption,
} from '../utils.js';
import { Arguments } from '../types.js';
import { DEFAULT_API_VERSION, VALID_API_VERSIONS } from '../service.js';
import VERSION from '../version.js';

import { run } from '../main.js';

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

  if (opts.batchSize != null) {
    if (opts.batchSize < 1) {
      throw new Error('--batch-size must be at least 1');
    }

    if (opts.batchIndex != null && opts.batchIndex < 0) {
      throw new Error('--batch-index must be 0 or greater');
    }

    if (opts.orgList) {
      throw new Error(
        'Batch mode (--batch-size) cannot be used with --org-list. Use with a single --org-name instead.',
      );
    }

    if (opts.repoList) {
      throw new Error(
        'Batch mode (--batch-size) cannot be used with --repo-list. Batch mode generates its own repo list.',
      );
    }
  }

  if (opts.batchRepoListFile && opts.batchSize == null) {
    throw new Error(
      '--batch-repo-list-file requires --batch-size. Use --repo-list instead if you want to process a flat list of repos without batching.',
    );
  }
}

const repoStatsCommand = new commander.Command();

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
    new Option(
      '--api-version <version>',
      `GitHub API version to use (${VALID_API_VERSIONS.join(' or ')})`,
    )
      .env('GITHUB_API_VERSION')
      .default(DEFAULT_API_VERSION)
      .argParser(parseApiVersionOption),
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
    new Option('--extra-page-size <size>', 'Extra page size')
      .env('EXTRA_PAGE_SIZE')
      .default(25)
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
      '--auto-process-missing [value]',
      'Automatically process any missing repositories when main processing is complete',
    )
      .env('AUTO_PROCESS_MISSING')
      .argParser(parseBooleanOption),
  )
  .addOption(
    new Option('--output-dir <dir>', 'Output directory for generated files')
      .env('OUTPUT_DIR')
      .default('output'),
  )
  .addOption(
    new Option(
      '--output-file-name <name>',
      'Name for the output CSV file (default: auto-generated with timestamp)',
    ).env('OUTPUT_FILE_NAME'),
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
  .addOption(
    new Option(
      '--batch-size <size>',
      'Number of repositories per batch. Fetches the full repo list for the org and processes only the slice for the given batch index.',
    )
      .env('BATCH_SIZE')
      .argParser(parseIntOption),
  )
  .addOption(
    new Option(
      '--batch-index <index>',
      'Zero-based batch index to process (default: 0). Requires --batch-size.',
    )
      .env('BATCH_INDEX')
      .default(0)
      .argParser(parseIntOption),
  )
  .addOption(
    new Option(
      '--batch-delay <seconds>',
      'Stagger delay in seconds per batch index before starting (e.g., batch 2 with delay 10 waits 20s). Useful when launching multiple batches simultaneously.',
    )
      .env('BATCH_DELAY')
      .default(0)
      .argParser(parseIntOption),
  )
  .addOption(
    new Option(
      '--batch-repo-list-file <file>',
      "Path to a pre-fetched repository list (one entry per line, 'owner/repo' or bare repo name). When provided with --batch-size, batches read from this file instead of paginating the org's repos for every batch. Useful for large parallel matrix runs to avoid exhausting the installation rate limit.",
    ).env('BATCH_REPO_LIST_FILE'),
  )
  .action(async (options: Arguments) => {
    console.log('Version:', VERSION);

    console.log('Validating options...');
    validate(options);

    console.log('Starting repo-stats...');
    await run(options);
    console.log('Repo-stats completed.');
  });

export default repoStatsCommand;
