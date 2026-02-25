import { describe, it, expect, vi } from 'vitest';
import projectStatsCommand from '../src/commands/project-stats-command.js';

// Mock the projects module functions
vi.mock('../src/projects.js', () => ({
  runProjectStats: vi.fn(),
}));

describe('Commands - project-stats-command', () => {
  describe('project-stats-command', () => {
    it('should be defined with correct name and description', () => {
      expect(projectStatsCommand.name()).toBe('project-stats');
      expect(projectStatsCommand.description()).toContain(
        'Counts unique ProjectsV2',
      );
    });

    it('should have required options defined', () => {
      const options = projectStatsCommand.options;
      const optionNames = options.map((opt) => opt.long);

      expect(optionNames).toContain('--org-name');
      expect(optionNames).toContain('--org-list');
      expect(optionNames).toContain('--access-token');
      expect(optionNames).toContain('--base-url');
      expect(optionNames).toContain('--proxy-url');
      expect(optionNames).toContain('--verbose');
      expect(optionNames).toContain('--app-id');
      expect(optionNames).toContain('--private-key');
      expect(optionNames).toContain('--private-key-file');
      expect(optionNames).toContain('--app-installation-id');
      expect(optionNames).toContain('--page-size');
      expect(optionNames).toContain('--rate-limit-check-interval');
      expect(optionNames).toContain('--retry-max-attempts');
      expect(optionNames).toContain('--retry-initial-delay');
      expect(optionNames).toContain('--retry-max-delay');
      expect(optionNames).toContain('--retry-backoff-factor');
      expect(optionNames).toContain('--retry-success-threshold');
      expect(optionNames).toContain('--resume-from-last-save');
      expect(optionNames).toContain('--force-fresh-start');
      expect(optionNames).toContain('--repo-list');
      expect(optionNames).toContain('--repo-names-file');
      expect(optionNames).toContain('--output-dir');
      expect(optionNames).toContain('--clean-state');
      expect(optionNames).toContain('--delay-between-orgs');
      expect(optionNames).toContain('--continue-on-error');
    });

    it('should have --repo-names-file option with env var mapping', () => {
      const option = projectStatsCommand.options.find(
        (opt) => opt.long === '--repo-names-file',
      );
      expect(option).toBeDefined();
      expect(option?.envVar).toBe('REPO_NAMES_FILE');
      expect(option?.description).toContain('repository names');
    });

    it('should have default values for certain options', () => {
      const baseUrlOption = projectStatsCommand.options.find(
        (opt) => opt.long === '--base-url',
      );
      expect(baseUrlOption?.defaultValue).toBe('https://api.github.com');

      const pageSizeOption = projectStatsCommand.options.find(
        (opt) => opt.long === '--page-size',
      );
      expect(pageSizeOption?.defaultValue).toBe(10);

      const outputDirOption = projectStatsCommand.options.find(
        (opt) => opt.long === '--output-dir',
      );
      expect(outputDirOption?.defaultValue).toBe('output');
    });

    it('should have numeric defaults as numbers not strings', () => {
      const numericOptions = [
        { name: '--page-size', expected: 10 },
        { name: '--rate-limit-check-interval', expected: 60 },
        { name: '--retry-max-attempts', expected: 3 },
        { name: '--retry-initial-delay', expected: 1000 },
        { name: '--retry-max-delay', expected: 30000 },
        { name: '--retry-backoff-factor', expected: 2 },
        { name: '--retry-success-threshold', expected: 5 },
        { name: '--delay-between-orgs', expected: 5 },
      ];

      numericOptions.forEach(({ name, expected }) => {
        const option = projectStatsCommand.options.find(
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
        '--app-id': 'APP_ID',
        '--private-key': 'PRIVATE_KEY',
        '--private-key-file': 'PRIVATE_KEY_FILE',
        '--app-installation-id': 'APP_INSTALLATION_ID',
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
      };

      for (const [optionName, expectedEnv] of Object.entries(envMappings)) {
        const option = projectStatsCommand.options.find(
          (opt) => opt.long === optionName,
        );
        expect(option?.envVar).toBe(expectedEnv);
      }
    });

    it('should have multi-org options properly configured', () => {
      const orgListOption = projectStatsCommand.options.find(
        (opt) => opt.long === '--org-list',
      );
      expect(orgListOption).toBeDefined();
      expect(orgListOption?.description).toContain('list of organizations');
      expect(orgListOption?.envVar).toBe('ORG_LIST');

      const delayOption = projectStatsCommand.options.find(
        (opt) => opt.long === '--delay-between-orgs',
      );
      expect(delayOption).toBeDefined();
      expect(delayOption?.defaultValue).toBe(5);
      expect(delayOption?.envVar).toBe('DELAY_BETWEEN_ORGS');

      const continueOnErrorOption = projectStatsCommand.options.find(
        (opt) => opt.long === '--continue-on-error',
      );
      expect(continueOnErrorOption).toBeDefined();
      expect(continueOnErrorOption?.description).toContain(
        'Continue processing',
      );
      expect(continueOnErrorOption?.envVar).toBe('CONTINUE_ON_ERROR');
    });

    it('should have resume and state options configured', () => {
      const resumeOption = projectStatsCommand.options.find(
        (opt) => opt.long === '--resume-from-last-save',
      );
      expect(resumeOption).toBeDefined();
      expect(resumeOption?.envVar).toBe('RESUME_FROM_LAST_SAVE');

      const cleanStateOption = projectStatsCommand.options.find(
        (opt) => opt.long === '--clean-state',
      );
      expect(cleanStateOption).toBeDefined();
      expect(cleanStateOption?.envVar).toBe('CLEAN_STATE');

      const forceFreshStartOption = projectStatsCommand.options.find(
        (opt) => opt.long === '--force-fresh-start',
      );
      expect(forceFreshStartOption).toBeDefined();
      expect(forceFreshStartOption?.envVar).toBe('FORCE_FRESH_START');
    });
  });

  describe('Integration tests', () => {
    it('should export a command object that can be used with commander', () => {
      expect(projectStatsCommand).toBeDefined();
      expect(typeof projectStatsCommand.parse).toBe('function');
      expect(typeof projectStatsCommand.parseAsync).toBe('function');
    });

    it('should parse default numeric options as numbers, not strings', () => {
      projectStatsCommand.parseOptions(['-o', 'test-org', '-t', 'test-token']);
      const opts = projectStatsCommand.opts();

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
      projectStatsCommand.parseOptions([
        '-o',
        'test-org',
        '-t',
        'test-token',
        '--page-size',
        '50',
      ]);
      const opts = projectStatsCommand.opts();

      expect(opts.pageSize).toBeTypeOf('number');
      expect(opts.pageSize).toBe(50);
    });

    it('should parse --repo-names-file as a string path', () => {
      projectStatsCommand.parseOptions([
        '-o',
        'test-org',
        '-t',
        'test-token',
        '--repo-names-file',
        'input/repo-names.txt',
      ]);
      const opts = projectStatsCommand.opts();

      expect(opts.repoNamesFile).toBe('input/repo-names.txt');
    });
  });
});
