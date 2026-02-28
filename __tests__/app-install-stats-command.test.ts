import { describe, it, expect, vi } from 'vitest';
import appInstallStatsCommand from '../src/commands/app-install-stats-command.js';

// Mock the app-installs module functions
vi.mock('../src/app-installs.js', () => ({
  runAppInstallStats: vi.fn(),
}));

describe('Commands - app-install-stats-command', () => {
  describe('app-install-stats-command', () => {
    it('should be defined with correct name and description', () => {
      expect(appInstallStatsCommand.name()).toBe('app-install-stats');
      expect(appInstallStatsCommand.description()).toContain(
        'GitHub App installation statistics',
      );
      expect(appInstallStatsCommand.description()).toContain(
        'Personal Access Token',
      );
    });

    it('should have required options defined', () => {
      const options = appInstallStatsCommand.options;
      const optionNames = options.map((opt) => opt.long);

      expect(optionNames).toContain('--org-name');
      expect(optionNames).toContain('--org-list');
      expect(optionNames).toContain('--access-token');
      expect(optionNames).toContain('--base-url');
      expect(optionNames).toContain('--proxy-url');
      expect(optionNames).toContain('--verbose');
      expect(optionNames).toContain('--page-size');
      expect(optionNames).toContain('--rate-limit-check-interval');
      expect(optionNames).toContain('--retry-max-attempts');
      expect(optionNames).toContain('--retry-initial-delay');
      expect(optionNames).toContain('--retry-max-delay');
      expect(optionNames).toContain('--retry-backoff-factor');
      expect(optionNames).toContain('--retry-success-threshold');
      expect(optionNames).toContain('--resume-from-last-save');
      expect(optionNames).toContain('--force-fresh-start');
      expect(optionNames).toContain('--output-dir');
      expect(optionNames).toContain('--output-file-name');
      expect(optionNames).toContain('--clean-state');
      expect(optionNames).toContain('--delay-between-orgs');
      expect(optionNames).toContain('--continue-on-error');
      expect(optionNames).toContain('--skip-per-repo-install-csv');
      expect(optionNames).toContain('--skip-repo-app-detail-csv');
      expect(optionNames).toContain('--skip-app-repos-csv');
    });

    it('should NOT have GitHub App auth options', () => {
      const options = appInstallStatsCommand.options;
      const optionNames = options.map((opt) => opt.long);

      expect(optionNames).not.toContain('--app-id');
      expect(optionNames).not.toContain('--private-key');
      expect(optionNames).not.toContain('--private-key-file');
      expect(optionNames).not.toContain('--app-installation-id');
    });

    it('should have default values for certain options', () => {
      const baseUrlOption = appInstallStatsCommand.options.find(
        (opt) => opt.long === '--base-url',
      );
      expect(baseUrlOption?.defaultValue).toBe('https://api.github.com');

      const pageSizeOption = appInstallStatsCommand.options.find(
        (opt) => opt.long === '--page-size',
      );
      expect(pageSizeOption?.defaultValue).toBe(30);

      const outputDirOption = appInstallStatsCommand.options.find(
        (opt) => opt.long === '--output-dir',
      );
      expect(outputDirOption?.defaultValue).toBe('output');
    });

    it('should have numeric defaults as numbers not strings', () => {
      const numericOptions = [
        { name: '--page-size', expected: 30 },
        { name: '--rate-limit-check-interval', expected: 60 },
        { name: '--retry-max-attempts', expected: 3 },
        { name: '--retry-initial-delay', expected: 1000 },
        { name: '--retry-max-delay', expected: 30000 },
        { name: '--retry-backoff-factor', expected: 2 },
        { name: '--retry-success-threshold', expected: 5 },
        { name: '--delay-between-orgs', expected: 5 },
      ];

      numericOptions.forEach(({ name, expected }) => {
        const option = appInstallStatsCommand.options.find(
          (opt) => opt.long === name,
        );
        expect(option?.defaultValue).toBe(expected);
        expect(typeof option?.defaultValue).toBe('number');
      });
    });

    it('should have environment variable mappings', () => {
      const envMappings: Record<string, string> = {
        '--org-name': 'ORG_NAME',
        '--org-list': 'ORG_LIST',
        '--access-token': 'ACCESS_TOKEN',
        '--base-url': 'BASE_URL',
        '--proxy-url': 'PROXY_URL',
        '--verbose': 'VERBOSE',
        '--page-size': 'PAGE_SIZE',
        '--rate-limit-check-interval': 'RATE_LIMIT_CHECK_INTERVAL',
        '--retry-max-attempts': 'RETRY_MAX_ATTEMPTS',
        '--retry-initial-delay': 'RETRY_INITIAL_DELAY',
        '--retry-max-delay': 'RETRY_MAX_DELAY',
        '--retry-backoff-factor': 'RETRY_BACKOFF_FACTOR',
        '--retry-success-threshold': 'RETRY_SUCCESS_THRESHOLD',
        '--resume-from-last-save': 'RESUME_FROM_LAST_SAVE',
        '--force-fresh-start': 'FORCE_FRESH_START',
        '--output-dir': 'OUTPUT_DIR',
        '--clean-state': 'CLEAN_STATE',
        '--delay-between-orgs': 'DELAY_BETWEEN_ORGS',
        '--continue-on-error': 'CONTINUE_ON_ERROR',
        '--skip-per-repo-install-csv': 'SKIP_PER_REPO_INSTALL_CSV',
        '--skip-repo-app-detail-csv': 'SKIP_REPO_APP_DETAIL_CSV',
        '--skip-app-repos-csv': 'SKIP_APP_REPOS_CSV',
      };

      for (const [optionName, expectedEnv] of Object.entries(envMappings)) {
        const option = appInstallStatsCommand.options.find(
          (opt) => opt.long === optionName,
        );
        expect(option?.envVar).toBe(expectedEnv);
      }
    });

    it('should have multi-org options properly configured', () => {
      const orgListOption = appInstallStatsCommand.options.find(
        (opt) => opt.long === '--org-list',
      );
      expect(orgListOption).toBeDefined();
      expect(orgListOption?.description).toContain('list of organizations');
      expect(orgListOption?.envVar).toBe('ORG_LIST');

      const delayOption = appInstallStatsCommand.options.find(
        (opt) => opt.long === '--delay-between-orgs',
      );
      expect(delayOption).toBeDefined();
      expect(delayOption?.defaultValue).toBe(5);
      expect(delayOption?.envVar).toBe('DELAY_BETWEEN_ORGS');

      const continueOnErrorOption = appInstallStatsCommand.options.find(
        (opt) => opt.long === '--continue-on-error',
      );
      expect(continueOnErrorOption).toBeDefined();
      expect(continueOnErrorOption?.description).toContain(
        'Continue processing',
      );
      expect(continueOnErrorOption?.envVar).toBe('CONTINUE_ON_ERROR');
    });

    it('should have resume and state options configured', () => {
      const resumeOption = appInstallStatsCommand.options.find(
        (opt) => opt.long === '--resume-from-last-save',
      );
      expect(resumeOption).toBeDefined();
      expect(resumeOption?.envVar).toBe('RESUME_FROM_LAST_SAVE');

      const cleanStateOption = appInstallStatsCommand.options.find(
        (opt) => opt.long === '--clean-state',
      );
      expect(cleanStateOption).toBeDefined();
      expect(cleanStateOption?.envVar).toBe('CLEAN_STATE');

      const forceFreshStartOption = appInstallStatsCommand.options.find(
        (opt) => opt.long === '--force-fresh-start',
      );
      expect(forceFreshStartOption).toBeDefined();
      expect(forceFreshStartOption?.envVar).toBe('FORCE_FRESH_START');
    });

    it('should have skip CSV output flags configured', () => {
      const skipPerRepo = appInstallStatsCommand.options.find(
        (opt) => opt.long === '--skip-per-repo-install-csv',
      );
      expect(skipPerRepo).toBeDefined();
      expect(skipPerRepo?.description).toContain('per-repo installations CSV');
      expect(skipPerRepo?.envVar).toBe('SKIP_PER_REPO_INSTALL_CSV');

      const skipRepoAppDetail = appInstallStatsCommand.options.find(
        (opt) => opt.long === '--skip-repo-app-detail-csv',
      );
      expect(skipRepoAppDetail).toBeDefined();
      expect(skipRepoAppDetail?.description).toContain('repo-app details CSV');
      expect(skipRepoAppDetail?.envVar).toBe('SKIP_REPO_APP_DETAIL_CSV');

      const skipAppRepos = appInstallStatsCommand.options.find(
        (opt) => opt.long === '--skip-app-repos-csv',
      );
      expect(skipAppRepos).toBeDefined();
      expect(skipAppRepos?.description).toContain('app-repos summary CSV');
      expect(skipAppRepos?.envVar).toBe('SKIP_APP_REPOS_CSV');
    });
  });

  describe('Integration tests', () => {
    it('should export a command object that can be used with commander', () => {
      expect(appInstallStatsCommand).toBeDefined();
      expect(typeof appInstallStatsCommand.parse).toBe('function');
      expect(typeof appInstallStatsCommand.parseAsync).toBe('function');
    });

    it('should parse default numeric options as numbers, not strings', () => {
      appInstallStatsCommand.parseOptions([
        '-o',
        'test-org',
        '-t',
        'test-token',
      ]);
      const opts = appInstallStatsCommand.opts();

      expect(opts.pageSize).toBeTypeOf('number');
      expect(opts.rateLimitCheckInterval).toBeTypeOf('number');
      expect(opts.retryMaxAttempts).toBeTypeOf('number');
      expect(opts.retryInitialDelay).toBeTypeOf('number');
      expect(opts.retryMaxDelay).toBeTypeOf('number');
      expect(opts.retryBackoffFactor).toBeTypeOf('number');
      expect(opts.retrySuccessThreshold).toBeTypeOf('number');
      expect(opts.delayBetweenOrgs).toBeTypeOf('number');

      expect(opts.baseUrl).toBeTypeOf('string');
      expect(opts.outputDir).toBeTypeOf('string');
    });

    it('should parse provided numeric arguments correctly', () => {
      appInstallStatsCommand.parseOptions([
        '-o',
        'test-org',
        '-t',
        'test-token',
        '--page-size',
        '50',
      ]);
      const opts = appInstallStatsCommand.opts();

      expect(opts.pageSize).toBeTypeOf('number');
      expect(opts.pageSize).toBe(50);
    });
  });
});
