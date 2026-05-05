import { describe, it, expect, vi } from 'vitest';
import repoStatsCommand, {
  validateRepoStatsOptions,
} from '../src/commands/repo-stats-command.js';
import missingReposCommand from '../src/commands/missing-repos-command.js';
import projectStatsCommand from '../src/commands/project-stats-command.js';
import appInstallStatsCommand from '../src/commands/app-install-stats-command.js';
import packageStatsCommand from '../src/commands/package-stats-command.js';
import codespaceStatsCommand from '../src/commands/codespace-stats-command.js';
import { Arguments } from '../src/types.js';
import { parseRepoListFileOption } from '../src/repo-list.js';
import {
  getRepoStatsSourceModeStatus,
  isStandaloneRepoListSourceMode,
} from '../src/repo-stats-source-mode.js';

// Mock the main module functions
vi.mock('../src/main.js', () => ({
  run: vi.fn(),
}));

vi.mock('../src/missing-repos-service.js', () => ({
  checkForMissingRepos: vi.fn(),
}));

vi.mock('../src/projects.js', () => ({
  runProjectStats: vi.fn(),
}));

vi.mock('../src/app-installs.js', () => ({
  runAppInstallStats: vi.fn(),
}));

vi.mock('../src/packages.js', () => ({
  runPackageStats: vi.fn(),
}));

vi.mock('../src/codespaces.js', () => ({
  runCodespaceStats: vi.fn(),
}));

describe('Commands', () => {
  describe('repo-stats-command', () => {
    it('should be defined with correct name and description', () => {
      expect(repoStatsCommand.name()).toBe('repo-stats');
      expect(repoStatsCommand.description()).toBe(
        'Gathers repo-stats for all repositories in an organization or multiple organizations',
      );
    });

    it('should have required options defined', () => {
      const options = repoStatsCommand.options;
      const optionNames = options.map((opt) => opt.long);

      expect(optionNames).toContain('--org-name');
      expect(optionNames).toContain('--access-token');
      expect(optionNames).toContain('--base-url');
      expect(optionNames).toContain('--page-size');
      expect(optionNames).toContain('--extra-page-size');
      expect(optionNames).toContain('--verbose');
      expect(optionNames).toContain('--output-dir');
      expect(optionNames).toContain('--clean-state');
      expect(optionNames).toContain('--resume-from-last-save');
      expect(optionNames).toContain('--auto-process-missing');
      expect(optionNames).toContain('--org-list');
      expect(optionNames).toContain('--delay-between-orgs');
      expect(optionNames).toContain('--continue-on-error');
    });

    it('should have default values for certain options', () => {
      const baseUrlOption = repoStatsCommand.options.find(
        (opt) => opt.long === '--base-url',
      );
      expect(baseUrlOption?.defaultValue).toBe('https://api.github.com');

      const pageSizeOption = repoStatsCommand.options.find(
        (opt) => opt.long === '--page-size',
      );
      expect(pageSizeOption?.defaultValue).toBe(10);

      const extraPageSizeOption = repoStatsCommand.options.find(
        (opt) => opt.long === '--extra-page-size',
      );
      expect(extraPageSizeOption?.defaultValue).toBe(25);

      const outputDirOption = repoStatsCommand.options.find(
        (opt) => opt.long === '--output-dir',
      );
      expect(outputDirOption?.defaultValue).toBe('output');
    });

    it('should have numeric defaults as numbers not strings', () => {
      // This test ensures defaults are properly typed as numbers
      // If defaults were strings like '10', these would fail
      const numericOptions = [
        { name: '--page-size', expected: 10 },
        { name: '--extra-page-size', expected: 25 },
        { name: '--rate-limit-check-interval', expected: 60 },
        { name: '--retry-max-attempts', expected: 3 },
        { name: '--retry-initial-delay', expected: 1000 },
        { name: '--retry-max-delay', expected: 30000 },
        { name: '--retry-backoff-factor', expected: 2 },
        { name: '--retry-success-threshold', expected: 5 },
        { name: '--delay-between-orgs', expected: 5 },
      ];

      numericOptions.forEach(({ name, expected }) => {
        const option = repoStatsCommand.options.find(
          (opt) => opt.long === name,
        );
        expect(option?.defaultValue).toBe(expected);
        expect(typeof option?.defaultValue).toBe('number');
      });
    });

    it('should have environment variable mappings', () => {
      const orgNameOption = repoStatsCommand.options.find(
        (opt) => opt.long === '--org-name',
      );
      expect(orgNameOption?.envVar).toBe('ORG_NAME');

      const accessTokenOption = repoStatsCommand.options.find(
        (opt) => opt.long === '--access-token',
      );
      expect(accessTokenOption?.envVar).toBe('ACCESS_TOKEN');

      const outputDirOption = repoStatsCommand.options.find(
        (opt) => opt.long === '--output-dir',
      );
      expect(outputDirOption?.envVar).toBe('OUTPUT_DIR');

      const cleanStateOption = repoStatsCommand.options.find(
        (opt) => opt.long === '--clean-state',
      );
      expect(cleanStateOption?.envVar).toBe('CLEAN_STATE');

      const resumeFromLastSaveOption = repoStatsCommand.options.find(
        (opt) => opt.long === '--resume-from-last-save',
      );
      expect(resumeFromLastSaveOption?.envVar).toBe('RESUME_FROM_LAST_SAVE');

      const autoProcessMissingOption = repoStatsCommand.options.find(
        (opt) => opt.long === '--auto-process-missing',
      );
      expect(autoProcessMissingOption?.envVar).toBe('AUTO_PROCESS_MISSING');
    });

    it('should have clean-state option properly configured', () => {
      const cleanStateOption = repoStatsCommand.options.find(
        (opt) => opt.long === '--clean-state',
      );

      expect(cleanStateOption).toBeDefined();
      expect(cleanStateOption?.long).toBe('--clean-state');
      expect(cleanStateOption?.description).toBe(
        'Remove state file after successful completion',
      );
      expect(cleanStateOption?.envVar).toBe('CLEAN_STATE');
    });

    it('should have multi-org options properly configured', () => {
      const orgListOption = repoStatsCommand.options.find(
        (opt) => opt.long === '--org-list',
      );
      expect(orgListOption).toBeDefined();
      expect(orgListOption?.description).toContain('list of organizations');
      expect(orgListOption?.envVar).toBe('ORG_LIST');

      const delayOption = repoStatsCommand.options.find(
        (opt) => opt.long === '--delay-between-orgs',
      );
      expect(delayOption).toBeDefined();
      expect(delayOption?.defaultValue).toBe(5);
      expect(delayOption?.envVar).toBe('DELAY_BETWEEN_ORGS');

      const continueOnErrorOption = repoStatsCommand.options.find(
        (opt) => opt.long === '--continue-on-error',
      );
      expect(continueOnErrorOption).toBeDefined();
      expect(continueOnErrorOption?.description).toContain(
        'Continue processing',
      );
      expect(continueOnErrorOption?.envVar).toBe('CONTINUE_ON_ERROR');
    });

    describe('source mode validation', () => {
      function createOptions(overrides: Partial<Arguments> = {}): Arguments {
        return {
          orgName: undefined,
          orgList: [],
          repoList: undefined,
          baseUrl: 'https://api.github.com',
          proxyUrl: undefined,
          verbose: false,
          ...overrides,
        } as Arguments;
      }

      it('should allow org-name only', () => {
        expect(() =>
          validateRepoStatsOptions(createOptions({ orgName: 'test-org' })),
        ).not.toThrow();
      });

      it('should allow org-list only', () => {
        expect(() =>
          validateRepoStatsOptions(createOptions({ orgList: ['test-org'] })),
        ).not.toThrow();
      });

      it('should allow org-list when REPO_LIST is set but empty', () => {
        expect(() =>
          validateRepoStatsOptions(
            createOptions({
              orgList: ['test-org'],
              repoList: parseRepoListFileOption(''),
            }),
          ),
        ).not.toThrow();
      });

      it('should allow repo-list only', () => {
        expect(() =>
          validateRepoStatsOptions(
            createOptions({ repoList: ['github/repo-stats'] }),
          ),
        ).not.toThrow();
      });

      it('should allow repo-list file source only', () => {
        expect(() =>
          validateRepoStatsOptions(
            createOptions({
              repoList: {
                kind: 'repo-list-file',
                sourcePath: '/tmp/repos.txt',
                content: 'github/repo-stats\n',
              },
            }),
          ),
        ).not.toThrow();
      });

      it('should reject missing source mode', () => {
        expect(() => validateRepoStatsOptions(createOptions())).toThrow(
          'Exactly one source mode must be provided',
        );
      });

      it('should reject org-name combined with repo-list', () => {
        expect(() =>
          validateRepoStatsOptions(
            createOptions({
              orgName: 'test-org',
              repoList: ['github/repo-stats'],
            }),
          ),
        ).toThrow('Cannot combine source modes');
      });

      it('should reject org-list combined with repo-list', () => {
        expect(() =>
          validateRepoStatsOptions(
            createOptions({
              orgList: ['test-org'],
              repoList: ['github/repo-stats'],
            }),
          ),
        ).toThrow('Cannot combine source modes');
      });

      it('should reject org-list combined with repo-list file source', () => {
        expect(() =>
          validateRepoStatsOptions(
            createOptions({
              orgList: ['test-org'],
              repoList: {
                kind: 'repo-list-file',
                sourcePath: '/tmp/repos.txt',
                content: 'github/repo-stats\n',
              },
            }),
          ),
        ).toThrow('Cannot combine source modes');
      });

      it('should reject empty repo-list clearly', () => {
        expect(() =>
          validateRepoStatsOptions(createOptions({ repoList: [] })),
        ).toThrow(
          '--repo-list must contain at least one repository entry in owner/repo format',
        );
      });

      it('should preserve batch incompatibility with repo-list', () => {
        expect(() =>
          validateRepoStatsOptions(
            createOptions({
              repoList: ['github/repo-stats'],
              batchSize: 10,
            }),
          ),
        ).toThrow('Batch mode (--batch-size) cannot be used with --repo-list');
      });

      it('should preserve batch incompatibility with repo-list file sources', () => {
        expect(() =>
          validateRepoStatsOptions(
            createOptions({
              repoList: {
                kind: 'repo-list-file',
                sourcePath: '/tmp/repos.txt',
                content: 'github/repo-stats\n',
              },
              batchSize: 10,
            }),
          ),
        ).toThrow('Batch mode (--batch-size) cannot be used with --repo-list');
      });

      it('should classify source modes independently from command and main modules', () => {
        expect(
          getRepoStatsSourceModeStatus(createOptions({ orgName: 'test-org' })),
        ).toMatchObject({
          hasOrgName: true,
          hasOrgList: false,
          hasRepoList: false,
          hasEmptyRepoList: false,
          sourceModeCount: 1,
          sourceMode: 'org-name',
        });

        expect(
          getRepoStatsSourceModeStatus(
            createOptions({
              orgList: ['test-org'],
              repoList: parseRepoListFileOption(''),
            }),
          ),
        ).toMatchObject({
          hasOrgName: false,
          hasOrgList: true,
          hasRepoList: false,
          hasEmptyRepoList: false,
          sourceModeCount: 1,
          sourceMode: 'org-list',
        });

        expect(
          getRepoStatsSourceModeStatus(
            createOptions({ repoList: ['github/repo-stats'] }),
          ),
        ).toMatchObject({
          hasOrgName: false,
          hasOrgList: false,
          hasRepoList: true,
          hasEmptyRepoList: false,
          sourceModeCount: 1,
          sourceMode: 'repo-list',
        });
      });

      it('should only route standalone repo-list mode when repo-list is the sole source', () => {
        expect(
          isStandaloneRepoListSourceMode(
            createOptions({ repoList: ['github/repo-stats'] }),
          ),
        ).toBe(true);

        expect(
          isStandaloneRepoListSourceMode(
            createOptions({
              orgName: 'test-org',
              repoList: ['github/repo-stats'],
            }),
          ),
        ).toBe(false);
      });
    });
  });

  describe('missing-repos-command', () => {
    it('should be defined with correct name and description', () => {
      expect(missingReposCommand.name()).toBe('missing-repos');
      expect(missingReposCommand.description()).toContain(
        'Identifies repositories that are part of an organization',
      );
    });

    it('should have required options defined', () => {
      const options = missingReposCommand.options;
      const optionNames = options.map((opt) => opt.long);

      expect(optionNames).toContain('--output-file-name');
      expect(optionNames).toContain('--org-name');
      expect(optionNames).toContain('--access-token');
      expect(optionNames).toContain('--base-url');
      expect(optionNames).toContain('--output-dir');
    });

    it('should have mandatory output-file-name option', () => {
      const outputFileOption = missingReposCommand.options.find(
        (opt) => opt.long === '--output-file-name',
      );
      expect(outputFileOption?.mandatory).toBe(true);
    });

    it('should have default values for certain options', () => {
      const baseUrlOption = missingReposCommand.options.find(
        (opt) => opt.long === '--base-url',
      );
      expect(baseUrlOption?.defaultValue).toBe('https://api.github.com');

      const outputDirOption = missingReposCommand.options.find(
        (opt) => opt.long === '--output-dir',
      );
      expect(outputDirOption?.defaultValue).toBe('output');

      const verboseOption = missingReposCommand.options.find(
        (opt) => opt.long === '--verbose',
      );
      // Note: verbose may not have an explicit default, that's ok
      expect(verboseOption).toBeDefined();
    });

    it('should have environment variable mappings', () => {
      const outputFileOption = missingReposCommand.options.find(
        (opt) => opt.long === '--output-file-name',
      );
      expect(outputFileOption?.envVar).toBe('OUTPUT_FILE_NAME');

      const orgNameOption = missingReposCommand.options.find(
        (opt) => opt.long === '--org-name',
      );
      expect(orgNameOption?.envVar).toBe('ORG_NAME');

      const outputDirOption = missingReposCommand.options.find(
        (opt) => opt.long === '--output-dir',
      );
      expect(outputDirOption?.envVar).toBe('OUTPUT_DIR');
    });
  });

  describe('Integration tests', () => {
    it('should export command objects that can be used with commander', () => {
      // Test that the commands are properly configured commander objects
      expect(repoStatsCommand).toBeDefined();
      expect(typeof repoStatsCommand.parse).toBe('function');
      expect(typeof repoStatsCommand.parseAsync).toBe('function');

      expect(missingReposCommand).toBeDefined();
      expect(typeof missingReposCommand.parse).toBe('function');
      expect(typeof missingReposCommand.parseAsync).toBe('function');
    });

    it('should parse default numeric options as numbers, not strings', () => {
      // Use parseOptions to parse without triggering the action
      // This tests the actual repoStatsCommand configuration
      repoStatsCommand.parseOptions(['-o', 'test-org', '-t', 'test-token']);
      const opts = repoStatsCommand.opts();

      // Verify numeric defaults are numbers (would fail if defaults were strings like '10')
      expect(opts.pageSize).toBeTypeOf('number');
      expect(opts.extraPageSize).toBeTypeOf('number');
      expect(opts.rateLimitCheckInterval).toBeTypeOf('number');
      expect(opts.retryMaxAttempts).toBeTypeOf('number');
      expect(opts.retryInitialDelay).toBeTypeOf('number');
      expect(opts.retryMaxDelay).toBeTypeOf('number');
      expect(opts.retryBackoffFactor).toBeTypeOf('number');
      expect(opts.retrySuccessThreshold).toBeTypeOf('number');
      expect(opts.delayBetweenOrgs).toBeTypeOf('number');

      // String defaults should remain strings
      expect(opts.baseUrl).toBeTypeOf('string');
      expect(opts.outputDir).toBeTypeOf('string');
    });

    it('should parse provided numeric arguments correctly', () => {
      // Use parseOptions on the actual command with explicit values
      repoStatsCommand.parseOptions([
        '-o',
        'test-org',
        '-t',
        'test-token',
        '--page-size',
        '50',
        '--extra-page-size',
        '100',
      ]);
      const opts = repoStatsCommand.opts();

      // Verify the parsed values are numbers
      expect(opts.pageSize).toBeTypeOf('number');
      expect(opts.pageSize).toBe(50);

      expect(opts.extraPageSize).toBeTypeOf('number');
      expect(opts.extraPageSize).toBe(100);
    });
  });

  describe('Command line integration - multi-org options', () => {
    it('should parse --delay-between-orgs from command line', () => {
      const option = repoStatsCommand.options.find(
        (opt) => opt.long === '--delay-between-orgs',
      );

      expect(option).toBeDefined();
      expect(option?.description).toContain('Delay between processing');
      expect(option?.defaultValue).toBe(5);
      expect(option?.argParser).toBeDefined(); // parseIntOption
    });

    it('should parse --continue-on-error flag correctly', () => {
      const option = repoStatsCommand.options.find(
        (opt) => opt.long === '--continue-on-error',
      );

      expect(option).toBeDefined();
      expect(option?.description).toContain('Continue processing');
    });

    it('should read ORG_LIST from environment variable', () => {
      const option = repoStatsCommand.options.find(
        (opt) => opt.long === '--org-list',
      );

      expect(option).toBeDefined();
      expect(option?.envVar).toBe('ORG_LIST');
      expect(option?.description).toContain('list of organizations');
    });

    it('should read DELAY_BETWEEN_ORGS from environment variable', () => {
      const option = repoStatsCommand.options.find(
        (opt) => opt.long === '--delay-between-orgs',
      );

      expect(option).toBeDefined();
      expect(option?.envVar).toBe('DELAY_BETWEEN_ORGS');
    });

    it('should read CONTINUE_ON_ERROR from environment variable', () => {
      const option = repoStatsCommand.options.find(
        (opt) => opt.long === '--continue-on-error',
      );

      expect(option).toBeDefined();
      expect(option?.envVar).toBe('CONTINUE_ON_ERROR');
    });

    it('should use parseIntOption for delay parsing', () => {
      const option = repoStatsCommand.options.find(
        (opt) => opt.long === '--delay-between-orgs',
      );

      expect(option?.argParser).toBeDefined();
      // The argParser is parseIntOption which converts string to int
      // We just verify it's defined - the actual parsing is tested in utils.test.ts
    });

    it('should have all required multi-org options configured', () => {
      const multiOrgOptions = [
        '--org-list',
        '--delay-between-orgs',
        '--continue-on-error',
      ];

      multiOrgOptions.forEach((optionName) => {
        const option = repoStatsCommand.options.find(
          (opt) => opt.long === optionName,
        );
        expect(option).toBeDefined();
      });
    });

    it('should have --api-version option with default 2022-11-28', () => {
      const option = repoStatsCommand.options.find(
        (opt) => opt.long === '--api-version',
      );
      expect(option).toBeDefined();
      expect(option?.defaultValue).toBe('2022-11-28');
      expect(option?.envVar).toBe('GITHUB_API_VERSION');
    });
  });

  describe('TLS options', () => {
    const commandsToTest = [
      { name: 'repo-stats', command: repoStatsCommand },
      { name: 'missing-repos', command: missingReposCommand },
      { name: 'project-stats', command: projectStatsCommand },
      { name: 'app-install-stats', command: appInstallStatsCommand },
      { name: 'package-stats', command: packageStatsCommand },
      { name: 'codespace-stats', command: codespaceStatsCommand },
    ];

    commandsToTest.forEach(({ name, command }) => {
      it(`should have --ca-cert option on ${name} command`, () => {
        const option = command.options.find((opt) => opt.long === '--ca-cert');
        expect(option).toBeDefined();
        expect(option?.description).toContain('CA certificate');
        expect(option?.envVar).toBe('NODE_EXTRA_CA_CERTS');
      });
    });
  });
});
