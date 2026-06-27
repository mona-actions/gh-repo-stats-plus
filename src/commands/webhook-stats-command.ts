import * as commander from 'commander';
import {
  parseFloatOption,
  parseIntOption,
  parseBooleanOption,
  parseFileAsNewlineSeparatedOption,
  parseApiVersionOption,
} from '../utils.js';
import { Arguments, WebhookScope } from '../types.js';
import { DEFAULT_API_VERSION, VALID_API_VERSIONS } from '../service.js';
import VERSION from '../version.js';
import { parseRepoListFileOption } from '../repo-list.js';
import { getRepoStatsSourceModeStatus } from '../repo-stats-source-mode.js';

import { runWebhookStats } from '../webhooks.js';

const { Option } = commander;

const SUPPORTED_WEBHOOK_SCOPES = ['repo', 'org', 'both'] as const;

function validate(opts: Arguments) {
  const { hasEmptyRepoList, sourceModeCount } =
    getRepoStatsSourceModeStatus(opts);

  if (hasEmptyRepoList) {
    throw new Error(
      '--repo-list must contain at least one repository entry in owner/repo format',
    );
  }

  if (sourceModeCount === 0) {
    throw new Error(
      'Exactly one source mode must be provided: orgName (-o, --org-name <org>), orgList (--org-list <file>), or repoList (--repo-list <file>)',
    );
  }

  if (sourceModeCount > 1) {
    throw new Error(
      'Cannot combine source modes. Specify exactly one of --org-name, --org-list, or --repo-list.',
    );
  }

  if (opts.webhookScope) {
    const normalized = opts.webhookScope.toLowerCase();
    if (
      !SUPPORTED_WEBHOOK_SCOPES.includes(
        normalized as (typeof SUPPORTED_WEBHOOK_SCOPES)[number],
      )
    ) {
      throw new Error(
        `Unsupported webhook scope: '${opts.webhookScope}'. ` +
          `Supported scopes are: ${SUPPORTED_WEBHOOK_SCOPES.join(', ')}`,
      );
    }
  }
}

const webhookStatsCommand = new commander.Command();

webhookStatsCommand
  .name('webhook-stats')
  .description(
    'Retrieves webhook configuration statistics for organizations or repositories. ' +
      'Supports organization-level and repository-level webhooks.',
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
    new Option(
      '--repo-list <file>',
      'Path to file containing list of repositories to process (format: owner/repo_name). Use a single entry to process one repository.',
    )
      .env('REPO_LIST')
      .argParser(parseRepoListFileOption),
  )
  .addOption(
    new Option('-t, --access-token <token>', 'GitHub access token').env(
      'ACCESS_TOKEN',
    ),
  )
  .addOption(
    new Option('--app-id <id>', 'GitHub App ID for authentication').env(
      'APP_ID',
    ),
  )
  .addOption(
    new Option('--private-key <key>', 'GitHub App private key content').env(
      'PRIVATE_KEY',
    ),
  )
  .addOption(
    new Option(
      '--private-key-file <path>',
      'Path to GitHub App private key file',
    ).env('PRIVATE_KEY_FILE'),
  )
  .addOption(
    new Option('--app-installation-id <id>', 'GitHub App installation ID').env(
      'APP_INSTALLATION_ID',
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
      '--ca-cert <path>',
      'Path to CA certificate bundle (PEM) for TLS verification (e.g. GHES with internal CA)',
    ).env('NODE_EXTRA_CA_CERTS'),
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
  .addOption(
    new Option('--page-size <size>', 'Number of items per page')
      .env('PAGE_SIZE')
      .default(100)
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
    new Option('--output-dir <dir>', 'Output directory for generated files')
      .env('OUTPUT_DIR')
      .default('output'),
  )
  .addOption(
    new Option(
      '--output-file-name <name>',
      'Name for the primary output CSV file (default: auto-generated with timestamp)',
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
      '--webhook-scope <scope>',
      'Which webhooks to collect: repo, org, or both',
    )
      .env('WEBHOOK_SCOPE')
      .default('repo')
      .choices(SUPPORTED_WEBHOOK_SCOPES as unknown as string[]),
  )
  .addOption(
    new Option(
      '--only-active-repos [value]',
      'Skip archived repositories when collecting repository webhooks',
    )
      .env('ONLY_ACTIVE_REPOS')
      .argParser(parseBooleanOption),
  )
  .addOption(
    new Option(
      '--only-active-webhooks [value]',
      "Only include webhooks whose last delivery response status is 'active'",
    )
      .env('ONLY_ACTIVE_WEBHOOKS')
      .argParser(parseBooleanOption),
  )
  .action(async (options: Arguments) => {
    console.log('Version:', VERSION);
    console.log('Validating options...');
    validate(options);

    if (options.webhookScope) {
      options.webhookScope = options.webhookScope.toLowerCase() as WebhookScope;
    }

    console.log('Starting webhook-stats...');
    await runWebhookStats(options);
    console.log('Webhook-stats completed.');
  });

export default webhookStatsCommand;
