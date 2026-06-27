import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as commander from 'commander';
import csvToMarkdownCommand, {
  createCsvToMarkdownCommand,
} from '../src/commands/csv-to-markdown-command.js';

vi.mock('../src/csv-to-markdown.js', () => ({
  runCsvToMarkdown: vi.fn(),
}));

describe('Commands - csv-to-markdown-command', () => {
  describe('csv-to-markdown-command', () => {
    it('should be defined with correct name and description', () => {
      expect(csvToMarkdownCommand.name()).toBe('csv-to-markdown');
      expect(csvToMarkdownCommand.description()).toContain(
        'Converts a CSV file into markdown',
      );
    });

    it('should have expected options defined', () => {
      const options = csvToMarkdownCommand.options;
      const optionNames = options.map((opt) => opt.long);

      expect(optionNames).toContain('--input');
      expect(optionNames).toContain('--format');
      expect(optionNames).toContain('--title');
      expect(optionNames).toContain('--output-file-name');
      expect(optionNames).toContain('--output-dir');
      expect(optionNames).toContain('--verbose');
    });

    it('should default to table output in the output directory', () => {
      const formatOption = csvToMarkdownCommand.options.find(
        (opt) => opt.long === '--format',
      );
      expect(formatOption?.defaultValue).toBe('table');

      const outputDirOption = csvToMarkdownCommand.options.find(
        (opt) => opt.long === '--output-dir',
      );
      expect(outputDirOption?.defaultValue).toBe('output');
    });

    it('should have environment variable mappings', () => {
      const envMappings: Record<string, string> = {
        '--input': 'CSV_TO_MARKDOWN_INPUT',
        '--format': 'CSV_TO_MARKDOWN_FORMAT',
        '--title': 'CSV_TO_MARKDOWN_TITLE',
        '--output-file-name': 'CSV_TO_MARKDOWN_OUTPUT_FILE',
        '--output-dir': 'OUTPUT_DIR',
        '--verbose': 'VERBOSE',
      };

      for (const [optionName, expectedEnv] of Object.entries(envMappings)) {
        const option = csvToMarkdownCommand.options.find(
          (opt) => opt.long === optionName,
        );
        expect(option?.envVar).toBe(expectedEnv);
      }
    });
  });

  describe('Integration tests', () => {
    let cmd: commander.Command;

    beforeEach(() => {
      cmd = createCsvToMarkdownCommand();
    });

    it('should export a command object that can be used with commander', () => {
      expect(cmd).toBeDefined();
      expect(typeof cmd.parse).toBe('function');
      expect(typeof cmd.parseAsync).toBe('function');
    });

    it('should parse options correctly', () => {
      cmd.parseOptions([
        '--input',
        'stats.csv',
        '--format',
        'vertical',
        '--title',
        'Repository Statistics',
        '--output-file-name',
        'stats.md',
      ]);
      const opts = cmd.opts();

      expect(opts.input).toBe('stats.csv');
      expect(opts.format).toBe('vertical');
      expect(opts.title).toBe('Repository Statistics');
      expect(opts.outputFileName).toBe('stats.md');
    });
  });
});
