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
        'Gathers repo-stats for all repositories in an organization',
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
});
