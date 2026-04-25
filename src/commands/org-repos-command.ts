import * as commander from 'commander';
import {
  parseIntOption,
  parseBooleanOption,
  parseApiVersionOption,
  generateOrgReposFileName,
  resolveOutputPath,
} from '../utils.js';
import { DEFAULT_API_VERSION, VALID_API_VERSIONS } from '../service.js';
import { Arguments } from '../types.js';
import VERSION from '../version.js';
import { runOrgRepos } from '../org-repos.js';

const { Option } = commander;

function validate(opts: Arguments): void {
  if (!opts.orgName) {
    throw new Error('--org-name (-o) is required');
  }

  if (opts.batchSize != null && opts.batchSize < 1) {
    throw new Error('--batch-size must be at least 1');
  }

  if (opts.maxBatches != null && opts.maxBatches < 1) {
    throw new Error('--max-batches must be at least 1');
  }
}

const orgReposCommand = new commander.Command();

orgReposCommand
  .name('org-repos')
  .description(
    'Lists all repositories for an organization. Optionally writes the list to a file and outputs a batch matrix for parallel processing.',
  )
  .version(VERSION)
  .addOption(
    new Option('-o, --org-name <org>', 'The name of the organization').env(
      'ORG_NAME',
    ),
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
    new Option('--page-size <size>', 'Number of repos per API page')
      .env('PAGE_SIZE')
      .default(100)
      .argParser(parseIntOption),
  )
  .addOption(
    new Option('--output-dir <dir>', 'Output directory for generated files')
      .env('OUTPUT_DIR')
      .default('output'),
  )
  .addOption(
    new Option(
      '--output-file-name <name>',
      'Name for the output file containing the repo list (one owner/repo per line). Defaults to an auto-generated timestamped filename when --save-repo-list is set.',
    ).env('OUTPUT_FILE_NAME'),
  )
  .addOption(
    new Option(
      '--save-repo-list [value]',
      'Write the full repo list to a file in the output directory',
    )
      .env('SAVE_REPO_LIST')
      .argParser(parseBooleanOption),
  )
  .addOption(
    new Option(
      '--batch-size <size>',
      'When provided, calculates a batch matrix splitting repos into chunks of this size. Outputs batch-index array, total batches, and adjusted batch size.',
    )
      .env('BATCH_SIZE')
      .argParser(parseIntOption),
  )
  .addOption(
    new Option(
      '--max-batches <count>',
      'Maximum number of batches allowed when using --batch-size (default: 256). If the computed batch count exceeds this limit, batch-size is automatically increased.',
    )
      .env('MAX_BATCHES')
      .default(256)
      .argParser(parseIntOption),
  )
  .action(async (options: Arguments & { saveRepoList?: boolean | string }) => {
    console.log('Version:', VERSION);

    validate(options);

    // Resolve output file name when saving is requested
    if (options.saveRepoList && !options.outputFileName) {
      options.outputFileName = await resolveOutputPath(
        options.outputDir,
        generateOrgReposFileName(options.orgName!),
      );
    }

    const result = await runOrgRepos(options);

    // Print the repo list to stdout
    for (const repo of result.repos) {
      console.log(repo);
    }

    if (result.outputFile) {
      console.log(`\nWrote ${result.repoCount} repos to ${result.outputFile}`);
    }

    if (result.matrix) {
      console.log(`\nBatch matrix:`);
      console.log(`  Repos:         ${result.repoCount}`);
      console.log(`  Batch size:    ${result.batchSize}`);
      console.log(`  Total batches: ${result.totalBatches}`);
      console.log(`  Matrix:        ${JSON.stringify(result.matrix)}`);
    }
  });

export default orgReposCommand;
