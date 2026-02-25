import { describe, it, expect, vi, beforeEach } from 'vitest';
import combineStatsCommand, {
  createCombineStatsCommand,
} from '../src/commands/combine-stats-command.js';
import * as commander from 'commander';

// Mock the combine module
vi.mock('../src/combine.js', () => ({
  runCombineStats: vi.fn(),
}));

describe('Commands - combine-stats-command', () => {
  describe('combine-stats-command', () => {
    it('should be defined with correct name and description', () => {
      expect(combineStatsCommand.name()).toBe('combine-stats');
      expect(combineStatsCommand.description()).toContain(
        'Combines multiple CSV stat files',
      );
    });

    it('should have required options defined', () => {
      const options = combineStatsCommand.options;
      const optionNames = options.map((opt) => opt.long);

      expect(optionNames).toContain('--files');
      expect(optionNames).toContain('--match-columns');
      expect(optionNames).toContain('--output-file');
      expect(optionNames).toContain('--output-dir');
      expect(optionNames).toContain('--verbose');
    });

    it('should have --files option as mandatory', () => {
      const filesOption = combineStatsCommand.options.find(
        (opt) => opt.long === '--files',
      );
      expect(filesOption).toBeDefined();
      expect(filesOption?.mandatory).toBe(true);
    });

    it('should have default value for --match-columns', () => {
      const matchColumnsOption = combineStatsCommand.options.find(
        (opt) => opt.long === '--match-columns',
      );
      expect(matchColumnsOption).toBeDefined();
      expect(matchColumnsOption?.defaultValue).toBe('Org_Name,Repo_Name');
    });

    it('should have default value for --output-dir', () => {
      const outputDirOption = combineStatsCommand.options.find(
        (opt) => opt.long === '--output-dir',
      );
      expect(outputDirOption).toBeDefined();
      expect(outputDirOption?.defaultValue).toBe('output');
    });

    it('should have environment variable mappings', () => {
      const envMappings: Record<string, string> = {
        '--match-columns': 'MATCH_COLUMNS',
        '--output-file': 'COMBINE_OUTPUT_FILE',
        '--output-dir': 'OUTPUT_DIR',
        '--verbose': 'VERBOSE',
      };

      for (const [optionName, expectedEnv] of Object.entries(envMappings)) {
        const option = combineStatsCommand.options.find(
          (opt) => opt.long === optionName,
        );
        expect(option?.envVar).toBe(expectedEnv);
      }
    });

    it('should have --files option that accepts variadic arguments', () => {
      const filesOption = combineStatsCommand.options.find(
        (opt) => opt.long === '--files',
      );
      expect(filesOption).toBeDefined();
      expect(filesOption?.description).toContain('Two or more CSV files');
    });
  });

  describe('Integration tests', () => {
    let cmd: commander.Command;

    beforeEach(() => {
      cmd = createCombineStatsCommand();
    });

    it('should export a command object that can be used with commander', () => {
      expect(cmd).toBeDefined();
      expect(typeof cmd.parse).toBe('function');
      expect(typeof cmd.parseAsync).toBe('function');
    });

    it('should parse default options correctly', () => {
      cmd.parseOptions(['--files', 'file1.csv', 'file2.csv']);
      const opts = cmd.opts();

      expect(opts.files).toEqual(['file1.csv', 'file2.csv']);
      expect(opts.outputDir).toBe('output');
      expect(opts.matchColumns).toBe('Org_Name,Repo_Name');
    });

    it('should parse custom match columns', () => {
      cmd.parseOptions([
        '--files',
        'f1.csv',
        'f2.csv',
        '--match-columns',
        'Name,Owner',
      ]);
      const opts = cmd.opts();

      expect(opts.matchColumns).toEqual(['Name', 'Owner']);
    });

    it('should parse custom output file and directory', () => {
      cmd.parseOptions([
        '--files',
        'f1.csv',
        'f2.csv',
        '--output-file',
        'my-output.csv',
        '--output-dir',
        'reports',
      ]);
      const opts = cmd.opts();

      expect(opts.outputFile).toBe('my-output.csv');
      expect(opts.outputDir).toBe('reports');
    });

    it('should parse three files', () => {
      cmd.parseOptions(['--files', 'a.csv', 'b.csv', 'c.csv']);
      const opts = cmd.opts();

      expect(opts.files).toEqual(['a.csv', 'b.csv', 'c.csv']);
    });
  });
});
