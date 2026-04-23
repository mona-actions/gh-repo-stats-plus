import * as commander from 'commander';
import { parseBooleanOption } from '../utils.js';
import { createLogger } from '../logger.js';
import { createAuthConfig } from '../auth.js';
import { createOctokit } from '../octokit.js';
import { OctokitClient, DEFAULT_API_VERSION } from '../service.js';
import { resolveTlsDispatcher } from '../tls.js';
import { hostnameFromApiUrl, isGitHubDotCom } from '../url-utils.js';
import VERSION from '../version.js';

const { Option } = commander;

/** Stats-gathering types that require organization validation. */
const ORG_TYPES = new Set([
  'organization',
  'project-stats',
  'app-install-stats',
  'package-stats',
  'codespace-stats',
  'migration-audit',
]);

/** Valid values for the --type option. */
const VALID_TYPES = [
  'repository',
  'organization',
  'project-stats',
  'app-install-stats',
  'package-stats',
  'codespace-stats',
  'migration-audit',
  'combine',
];

interface PreflightOptions {
  baseUrl: string;
  skipTlsVerification?: boolean;
  caCertPath?: string;
  orgName?: string;
  repository?: string;
  type: string;
  accessToken?: string;
  appId?: string;
  privateKey?: string;
  appInstallationId?: string;
  verbose?: boolean;
}

function validate(opts: PreflightOptions): void {
  if (!VALID_TYPES.includes(opts.type)) {
    throw new Error(
      `Invalid type '${opts.type}'. Must be one of: ${VALID_TYPES.join(', ')}`,
    );
  }

  if (opts.type === 'repository') {
    if (!opts.repository) {
      throw new Error(
        "A repository name is required when type is 'repository'. " +
          'Pass --repository <name>.',
      );
    }
    if (!opts.orgName) {
      throw new Error(
        "An organization name is required when type is 'repository'. " +
          'Pass --org-name <org>.',
      );
    }
  }

  if (ORG_TYPES.has(opts.type) && !opts.orgName) {
    throw new Error(
      `An organization name is required when type is '${opts.type}'. ` +
        'Pass --org-name <org>.',
    );
  }

  if (opts.type === 'app-install-stats') {
    if (!opts.accessToken) {
      throw new Error(
        'app-install-stats requires a Personal Access Token (--access-token). ' +
          "GitHub App tokens cannot view other apps' installations.",
      );
    }
    if (opts.appId) {
      console.warn(
        'Warning: GitHub App credentials are ignored for app-install-stats. ' +
          'Only the access-token (PAT) will be used.',
      );
    }
  }
}

export async function runPreflight(opts: PreflightOptions): Promise<void> {
  validate(opts);

  const logger = await createLogger(opts.verbose ?? false, 'preflight.log');

  // 1. Resolve hostname
  const ghHost = hostnameFromApiUrl(opts.baseUrl);
  const isPublicGitHub = isGitHubDotCom(opts.baseUrl);
  logger.info(`Resolved GH_HOST: ${ghHost}`);

  // 2. Resolve TLS: prefer CA cert over global SSL bypass.
  //    resolveTlsDispatcher checks caCertPath arg first, then GHES_CA_CERT_PATH env var,
  //    then falls back to configureSslBypass() when skipTlsVerification is true.
  const sslVerifyDisabled = opts.skipTlsVerification === true;
  const caCertDispatcher = resolveTlsDispatcher(
    opts.baseUrl,
    sslVerifyDisabled,
    logger,
    opts.caCertPath,
  );

  // 3. Determine if we need to validate with an API call
  const needsRepoValidation = opts.type === 'repository';
  const needsOrgValidation = ORG_TYPES.has(opts.type);

  if (needsRepoValidation || needsOrgValidation) {
    logger.info('Creating authenticated client for validation...');
    const authConfig = createAuthConfig({
      accessToken: opts.accessToken,
      appId: opts.appId,
      privateKey: opts.privateKey,
      appInstallationId: opts.appInstallationId,
      logger,
    });

    const octokit = createOctokit(
      authConfig,
      opts.baseUrl,
      undefined,
      logger,
      undefined,
      caCertDispatcher,
    );
    const client = new OctokitClient(octokit, DEFAULT_API_VERSION);

    // 4. Validate repository exists
    if (needsRepoValidation && opts.orgName && opts.repository) {
      logger.info(`Validating repository: ${opts.orgName}/${opts.repository}`);
      const { fullName } = await client.validateRepository(
        opts.orgName,
        opts.repository,
      );
      logger.info(`Repository exists and is accessible: ${fullName}`);
    }

    // 5. Validate organization exists
    if (needsOrgValidation && opts.orgName) {
      logger.info(`Validating organization: ${opts.orgName}`);
      const { login } = await client.validateOrganization(opts.orgName);
      logger.info(`Organization exists and is accessible: ${login}`);
    }
  }

  // 6. Output key=value pairs for action.yml consumption
  console.log(`gh_host=${ghHost}`);
  console.log(`ssl_verify_disabled=${sslVerifyDisabled && !caCertDispatcher}`);
  console.log(`ca_cert_used=${caCertDispatcher !== undefined}`);
  console.log(`is_github_com=${isPublicGitHub}`);
}

export function createPreflightCommand(): commander.Command {
  const command = new commander.Command();

  command
    .name('preflight')
    .description(
      'Runs pre-flight checks: resolves host, configures TLS, and validates API access',
    )
    .version(VERSION)
    .addOption(
      new Option('-u, --base-url <url>', 'GitHub API base URL')
        .env('BASE_URL')
        .default('https://api.github.com'),
    )
    .addOption(
      new Option(
        '--skip-tls-verification [value]',
        'Skip TLS certificate verification (for GHES with self-signed certs). ' +
          'Prefer --ca-cert-path for proper verification instead of disabling it globally.',
      )
        .env('SKIP_TLS_VERIFICATION')
        .default(false)
        .argParser(parseBooleanOption),
    )
    .addOption(
      new Option(
        '--ca-cert-path <path>',
        'Path to a PEM CA certificate for TLS verification against GHES. ' +
          'When set, uses proper TLS instead of disabling verification globally. ' +
          'Also reads GHES_CA_CERT_PATH environment variable.',
      ).env('GHES_CA_CERT_PATH'),
    )
    .addOption(
      new Option(
        '-o, --org-name <org>',
        'Organization or owner name to validate',
      ).env('ORG_NAME'),
    )
    .addOption(
      new Option(
        '-r, --repository <repo>',
        'Repository name to validate (when type is repository)',
      ).env('REPOSITORY'),
    )
    .addOption(
      new Option(
        '--type <type>',
        `Type of stats gathering (${VALID_TYPES.join(', ')})`,
      )
        .env('STATS_TYPE')
        .default('repository'),
    )
    .addOption(
      new Option('-t, --access-token <token>', 'GitHub access token').env(
        'ACCESS_TOKEN',
      ),
    )
    .addOption(new Option('--app-id <id>', 'GitHub App ID').env('APP_ID'))
    .addOption(
      new Option('--private-key <key>', 'GitHub App private key').env(
        'PRIVATE_KEY',
      ),
    )
    .addOption(
      new Option(
        '--app-installation-id <id>',
        'GitHub App installation ID',
      ).env('APP_INSTALLATION_ID'),
    )
    .addOption(
      new Option('-v, --verbose', 'Enable verbose logging').env('VERBOSE'),
    )
    .action(async (options: PreflightOptions) => {
      console.log('Version:', VERSION);

      console.log('Running preflight checks...');
      await runPreflight(options);
      console.log('Preflight checks completed.');
    });

  return command;
}

export default createPreflightCommand();
