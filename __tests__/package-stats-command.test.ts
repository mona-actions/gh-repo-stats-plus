import { describe, it, expect, vi } from 'vitest';
import packageStatsCommand from '../src/commands/package-stats-command.js';

// Mock the packages module functions
vi.mock('../src/packages.js', () => ({
  runPackageStats: vi.fn(),
}));

describe('Commands - package-stats-command', () => {
  describe('package-stats-command', () => {
    it('should be defined with correct name and description', () => {
      expect(packageStatsCommand.name()).toBe('package-stats');
      expect(packageStatsCommand.description()).toContain('package statistics');
      expect(packageStatsCommand.description()).toContain('Maven');
    });

    it('should have required options defined', () => {
      const options = packageStatsCommand.options;
      const optionNames = options.map((opt) => opt.long);

      expect(optionNames).toContain('--org-name');
      expect(optionNames).toContain('--org-list');
      expect(optionNames).toContain('--access-token');
      expect(optionNames).toContain('--app-id');
      expect(optionNames).toContain('--private-key');
      expect(optionNames).toContain('--private-key-file');
      expect(optionNames).toContain('--app-installation-id');
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
      expect(optionNames).toContain('--package-type');
    });

    it('should have default values for certain options', () => {
      const baseUrlOption = packageStatsCommand.options.find(
        (opt) => opt.long === '--base-url',
      );
      expect(baseUrlOption?.defaultValue).toBe('https://api.github.com');

      const pageSizeOption = packageStatsCommand.options.find(
        (opt) => opt.long === '--page-size',
      );
      expect(pageSizeOption?.defaultValue).toBe(100);

      const outputDirOption = packageStatsCommand.options.find(
        (opt) => opt.long === '--output-dir',
      );
      expect(outputDirOption?.defaultValue).toBe('output');

      const packageTypeOption = packageStatsCommand.options.find(
        (opt) => opt.long === '--package-type',
      );
      expect(packageTypeOption?.defaultValue).toBe('maven');
    });

    it('should have numeric defaults as numbers not strings', () => {
      const numericOptions = [
        { name: '--page-size', expected: 100 },
        { name: '--rate-limit-check-interval', expected: 60 },
        { name: '--retry-max-attempts', expected: 3 },
        { name: '--retry-initial-delay', expected: 1000 },
        { name: '--retry-max-delay', expected: 30000 },
        { name: '--retry-backoff-factor', expected: 2 },
        { name: '--retry-success-threshold', expected: 5 },
        { name: '--delay-between-orgs', expected: 5 },
      ];

      numericOptions.forEach(({ name, expected }) => {
        const option = packageStatsCommand.options.find(
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
        '--app-id': 'APP_ID',
        '--private-key': 'PRIVATE_KEY',
        '--private-key-file': 'PRIVATE_KEY_FILE',
        '--app-installation-id': 'APP_INSTALLATION_ID',
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
        '--package-type': 'PACKAGE_TYPE',
      };

      for (const [optionName, expectedEnv] of Object.entries(envMappings)) {
        const option = packageStatsCommand.options.find(
          (opt) => opt.long === optionName,
        );
        expect(option?.envVar).toBe(expectedEnv);
      }
    });

    it('should have multi-org options properly configured', () => {
      const orgListOption = packageStatsCommand.options.find(
        (opt) => opt.long === '--org-list',
      );
      expect(orgListOption).toBeDefined();
      expect(orgListOption?.description).toContain('list of organizations');
      expect(orgListOption?.envVar).toBe('ORG_LIST');

      const delayOption = packageStatsCommand.options.find(
        (opt) => opt.long === '--delay-between-orgs',
      );
      expect(delayOption).toBeDefined();
      expect(delayOption?.defaultValue).toBe(5);
      expect(delayOption?.envVar).toBe('DELAY_BETWEEN_ORGS');

      const continueOnErrorOption = packageStatsCommand.options.find(
        (opt) => opt.long === '--continue-on-error',
      );
      expect(continueOnErrorOption).toBeDefined();
      expect(continueOnErrorOption?.description).toContain(
        'Continue processing',
      );
      expect(continueOnErrorOption?.envVar).toBe('CONTINUE_ON_ERROR');
    });

    it('should have resume and state options configured', () => {
      const resumeOption = packageStatsCommand.options.find(
        (opt) => opt.long === '--resume-from-last-save',
      );
      expect(resumeOption).toBeDefined();
      expect(resumeOption?.envVar).toBe('RESUME_FROM_LAST_SAVE');

      const cleanStateOption = packageStatsCommand.options.find(
        (opt) => opt.long === '--clean-state',
      );
      expect(cleanStateOption).toBeDefined();
      expect(cleanStateOption?.envVar).toBe('CLEAN_STATE');

      const forceFreshStartOption = packageStatsCommand.options.find(
        (opt) => opt.long === '--force-fresh-start',
      );
      expect(forceFreshStartOption).toBeDefined();
      expect(forceFreshStartOption?.envVar).toBe('FORCE_FRESH_START');
    });

    it('should have package-type option with maven default', () => {
      const packageTypeOption = packageStatsCommand.options.find(
        (opt) => opt.long === '--package-type',
      );
      expect(packageTypeOption).toBeDefined();
      expect(packageTypeOption?.defaultValue).toBe('maven');
      expect(packageTypeOption?.envVar).toBe('PACKAGE_TYPE');
      expect(packageTypeOption?.description).toContain('maven');
      expect(packageTypeOption?.description).toContain('npm');
    });

    it('should have GitHub App auth options', () => {
      const options = packageStatsCommand.options;
      const optionNames = options.map((opt) => opt.long);

      expect(optionNames).toContain('--app-id');
      expect(optionNames).toContain('--private-key');
      expect(optionNames).toContain('--private-key-file');
      expect(optionNames).toContain('--app-installation-id');
    });
  });
});
