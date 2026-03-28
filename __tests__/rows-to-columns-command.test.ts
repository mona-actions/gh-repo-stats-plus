import { describe, it, expect, vi, beforeEach } from 'vitest';
import rowsToColumnsCommand, {
  createRowsToColumnsCommand,
} from '../src/commands/rows-to-columns-command.js';
import * as commander from 'commander';

// Mock the rows-to-columns module
vi.mock('../src/rows-to-columns.js', () => ({
  runRowsToColumns: vi.fn(),
}));

describe('Commands - rows-to-columns-command', () => {
  describe('rows-to-columns-command', () => {
    it('should be defined with correct name and description', () => {
      expect(rowsToColumnsCommand.name()).toBe('rows-to-columns');
      expect(rowsToColumnsCommand.description()).toContain(
        'Converts rows from an additional CSV into new columns',
      );
    });

    it('should have required options defined', () => {
      const options = rowsToColumnsCommand.options;
      const optionNames = options.map((opt) => opt.long);

      expect(optionNames).toContain('--base-csv-file');
      expect(optionNames).toContain('--additional-csv-file');
      expect(optionNames).toContain('--header-column-keys');
      expect(optionNames).toContain('--header-column-values');
      expect(optionNames).toContain('--base-csv-columns');
      expect(optionNames).toContain('--additional-csv-columns');
      expect(optionNames).toContain('--output-file-name');
      expect(optionNames).toContain('--output-dir');
      expect(optionNames).toContain('--verbose');
    });

    it('should have --base-csv-file option as mandatory', () => {
      const option = rowsToColumnsCommand.options.find(
        (opt) => opt.long === '--base-csv-file',
      );
      expect(option).toBeDefined();
      expect(option?.mandatory).toBe(true);
    });

    it('should have --additional-csv-file option as mandatory', () => {
      const option = rowsToColumnsCommand.options.find(
        (opt) => opt.long === '--additional-csv-file',
      );
      expect(option).toBeDefined();
      expect(option?.mandatory).toBe(true);
    });

    it('should have --header-column-keys option as mandatory', () => {
      const option = rowsToColumnsCommand.options.find(
        (opt) => opt.long === '--header-column-keys',
      );
      expect(option).toBeDefined();
      expect(option?.mandatory).toBe(true);
    });

    it('should have --header-column-values option as mandatory', () => {
      const option = rowsToColumnsCommand.options.find(
        (opt) => opt.long === '--header-column-values',
      );
      expect(option).toBeDefined();
      expect(option?.mandatory).toBe(true);
    });

    it('should have default value for --base-csv-columns', () => {
      const option = rowsToColumnsCommand.options.find(
        (opt) => opt.long === '--base-csv-columns',
      );
      expect(option).toBeDefined();
      expect(option?.defaultValue).toEqual(['Org_Name', 'Repo_Name']);
    });

    it('should have default value for --additional-csv-columns', () => {
      const option = rowsToColumnsCommand.options.find(
        (opt) => opt.long === '--additional-csv-columns',
      );
      expect(option).toBeDefined();
      expect(option?.defaultValue).toEqual(['owner', 'name']);
    });

    it('should have default value for --output-dir', () => {
      const option = rowsToColumnsCommand.options.find(
        (opt) => opt.long === '--output-dir',
      );
      expect(option).toBeDefined();
      expect(option?.defaultValue).toBe('output');
    });

    it('should have environment variable mappings', () => {
      const envMappings: Record<string, string> = {
        '--base-csv-file': 'BASE_CSV_FILE',
        '--additional-csv-file': 'ADDITIONAL_CSV_FILE',
        '--header-column-keys': 'HEADER_COLUMN_KEYS',
        '--header-column-values': 'HEADER_COLUMN_VALUES',
        '--base-csv-columns': 'BASE_CSV_COLUMNS',
        '--additional-csv-columns': 'ADDITIONAL_CSV_COLUMNS',
        '--output-file-name': 'ROWS_TO_COLUMNS_OUTPUT_FILE',
        '--output-dir': 'OUTPUT_DIR',
        '--verbose': 'VERBOSE',
      };

      for (const [optionName, expectedEnv] of Object.entries(envMappings)) {
        const option = rowsToColumnsCommand.options.find(
          (opt) => opt.long === optionName,
        );
        expect(option?.envVar).toBe(expectedEnv);
      }
    });
  });

  describe('Integration tests', () => {
    let cmd: commander.Command;

    beforeEach(() => {
      cmd = createRowsToColumnsCommand();
    });

    it('should export a command object that can be used with commander', () => {
      expect(cmd).toBeDefined();
      expect(typeof cmd.parse).toBe('function');
      expect(typeof cmd.parseAsync).toBe('function');
    });

    it('should parse required options correctly', () => {
      cmd.parseOptions([
        '--base-csv-file',
        'base.csv',
        '--additional-csv-file',
        'additional.csv',
        '--header-column-keys',
        'type',
        '--header-column-values',
        'message',
      ]);
      const opts = cmd.opts();

      expect(opts.baseCsvFile).toBe('base.csv');
      expect(opts.additionalCsvFile).toBe('additional.csv');
      expect(opts.headerColumnKeys).toBe('type');
      expect(opts.headerColumnValues).toBe('message');
      expect(opts.outputDir).toBe('output');
      expect(opts.baseCsvColumns).toEqual(['Org_Name', 'Repo_Name']);
      expect(opts.additionalCsvColumns).toEqual(['owner', 'name']);
    });

    it('should parse custom column mappings', () => {
      cmd.parseOptions([
        '--base-csv-file',
        'base.csv',
        '--additional-csv-file',
        'additional.csv',
        '--header-column-keys',
        'type',
        '--header-column-values',
        'message',
        '--base-csv-columns',
        'Org_Name,Repo_Name',
        '--additional-csv-columns',
        'owner,name',
      ]);
      const opts = cmd.opts();

      expect(opts.baseCsvColumns).toEqual(['Org_Name', 'Repo_Name']);
      expect(opts.additionalCsvColumns).toEqual(['owner', 'name']);
    });

    it('should parse custom output options', () => {
      cmd.parseOptions([
        '--base-csv-file',
        'base.csv',
        '--additional-csv-file',
        'additional.csv',
        '--header-column-keys',
        'type',
        '--header-column-values',
        'message',
        '--output-file-name',
        'combined.csv',
        '--output-dir',
        'reports',
      ]);
      const opts = cmd.opts();

      expect(opts.outputFileName).toBe('combined.csv');
      expect(opts.outputDir).toBe('reports');
    });

    it('should parse verbose flag', () => {
      cmd.parseOptions([
        '--base-csv-file',
        'base.csv',
        '--additional-csv-file',
        'additional.csv',
        '--header-column-keys',
        'type',
        '--header-column-values',
        'message',
        '--verbose',
      ]);
      const opts = cmd.opts();

      expect(opts.verbose).toBe(true);
    });
  });
});
