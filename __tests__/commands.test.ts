import { describe, it, expect, vi } from 'vitest';
import repoStatsCommand from '../src/commands/repo-stats-command.js';
import missingReposCommand from '../src/commands/missing-repos-command.js';

// Mock the main module functions
vi.mock('../src/main.js', () => ({
  run: vi.fn(),
  checkForMissingRepos: vi.fn(),
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
      expect(pageSizeOption?.defaultValue).toBe('10');

      const extraPageSizeOption = repoStatsCommand.options.find(
        (opt) => opt.long === '--extra-page-size',
      );
      expect(extraPageSizeOption?.defaultValue).toBe('25');

      const outputDirOption = repoStatsCommand.options.find(
        (opt) => opt.long === '--output-dir',
      );
      expect(outputDirOption?.defaultValue).toBe('output');
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
      expect(delayOption?.defaultValue).toBe('5');
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
  });

  describe('Command line integration - multi-org options', () => {
    it('should parse --delay-between-orgs from command line', () => {
      const option = repoStatsCommand.options.find(
        (opt) => opt.long === '--delay-between-orgs',
      );

      expect(option).toBeDefined();
      expect(option?.description).toContain('Delay between processing');
      expect(option?.defaultValue).toBe('5');
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
  });
});
