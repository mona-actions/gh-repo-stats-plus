import { describe, it, expect, vi, beforeEach } from 'vitest';
import postProcessCommand, {
  createPostProcessCommand,
} from '../src/commands/post-process-command.js';
import * as commander from 'commander';

// Mock the post-process module
vi.mock('../src/post-process.js', () => ({
  runPostProcess: vi.fn(),
}));

describe('Commands - post-process-command', () => {
  describe('post-process-command', () => {
    it('should be defined with correct name and description', () => {
      expect(postProcessCommand.name()).toBe('post-process');
      expect(postProcessCommand.description()).toContain(
        'Transforms CSV data using configurable rules',
      );
    });

    it('should have required options defined', () => {
      const options = postProcessCommand.options;
      const optionNames = options.map((opt) => opt.long);

      expect(optionNames).toContain('--input');
      expect(optionNames).toContain('--rules-file');
      expect(optionNames).toContain('--output-file-name');
      expect(optionNames).toContain('--output-dir');
      expect(optionNames).toContain('--verbose');
    });

    it('should have --input option as mandatory', () => {
      const inputOption = postProcessCommand.options.find(
        (opt) => opt.long === '--input',
      );
      expect(inputOption).toBeDefined();
      expect(inputOption?.mandatory).toBe(true);
    });

    it('should have --rules-file option as mandatory', () => {
      const rulesOption = postProcessCommand.options.find(
        (opt) => opt.long === '--rules-file',
      );
      expect(rulesOption).toBeDefined();
      expect(rulesOption?.mandatory).toBe(true);
    });

    it('should have default value for --output-dir', () => {
      const outputDirOption = postProcessCommand.options.find(
        (opt) => opt.long === '--output-dir',
      );
      expect(outputDirOption).toBeDefined();
      expect(outputDirOption?.defaultValue).toBe('output');
    });

    it('should have environment variable mappings', () => {
      const envMappings: Record<string, string> = {
        '--input': 'POST_PROCESS_INPUT',
        '--rules-file': 'POST_PROCESS_RULES_FILE',
        '--output-file-name': 'POST_PROCESS_OUTPUT_FILE',
        '--output-dir': 'OUTPUT_DIR',
        '--verbose': 'VERBOSE',
      };

      for (const [optionName, expectedEnv] of Object.entries(envMappings)) {
        const option = postProcessCommand.options.find(
          (opt) => opt.long === optionName,
        );
        expect(option?.envVar).toBe(expectedEnv);
      }
    });
  });

  describe('Integration tests', () => {
    let cmd: commander.Command;

    beforeEach(() => {
      cmd = createPostProcessCommand();
    });

    it('should export a command object that can be used with commander', () => {
      expect(cmd).toBeDefined();
      expect(typeof cmd.parse).toBe('function');
      expect(typeof cmd.parseAsync).toBe('function');
    });

    it('should parse required options correctly', () => {
      cmd.parseOptions(['--input', 'data.csv', '--rules-file', 'rules.json']);
      const opts = cmd.opts();

      expect(opts.input).toBe('data.csv');
      expect(opts.rulesFile).toBe('rules.json');
      expect(opts.outputDir).toBe('output');
    });

    it('should parse custom output options', () => {
      cmd.parseOptions([
        '--input',
        'data.csv',
        '--rules-file',
        'rules.json',
        '--output-file-name',
        'final-report.csv',
        '--output-dir',
        'reports',
      ]);
      const opts = cmd.opts();

      expect(opts.outputFileName).toBe('final-report.csv');
      expect(opts.outputDir).toBe('reports');
    });

    it('should parse verbose flag', () => {
      cmd.parseOptions([
        '--input',
        'data.csv',
        '--rules-file',
        'rules.json',
        '--verbose',
      ]);
      const opts = cmd.opts();

      expect(opts.verbose).toBe(true);
    });
  });
});
