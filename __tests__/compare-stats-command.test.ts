import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/compare-stats.js', async () => {
  const actual = await vi.importActual<
    typeof import('../src/compare-stats.js')
  >('../src/compare-stats.js');
  return {
    ...actual,
    runCompareStats: vi.fn(),
  };
});

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});

import { existsSync } from 'fs';
import compareStatsCommand, {
  createCompareStatsCommand,
  validate,
} from '../src/commands/compare-stats-command.js';
import type { CompareStatsOptions } from '../src/compare-stats-types.js';

const baseOptions: CompareStatsOptions = {
  sourceFile: 'source.csv',
  targetFile: 'target.csv',
};

describe('Commands - compare-stats-command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
  });

  it('should be defined with correct name and description', () => {
    expect(compareStatsCommand.name()).toBe('compare-stats');
    expect(compareStatsCommand.description()).toContain(
      'Compares two repo-stats CSV files',
    );
  });

  it('should define the expected options', () => {
    const optionNames = createCompareStatsCommand().options.map(
      (opt) => opt.long,
    );

    expect(optionNames).toEqual(
      expect.arrayContaining([
        '--source-file',
        '--target-file',
        '--output-dir',
        '--output-file',
        '--size-tolerance-pct',
        '--fail-on-blocking',
        '--verify-git',
        '--source-org',
        '--target-org',
        '--source-base-url',
        '--target-base-url',
        '--source-token',
        '--target-token',
        '--verbose',
      ]),
    );
  });

  it('should make source and target files mandatory', () => {
    const options = createCompareStatsCommand().options;
    expect(options.find((o) => o.long === '--source-file')?.mandatory).toBe(
      true,
    );
    expect(options.find((o) => o.long === '--target-file')?.mandatory).toBe(
      true,
    );
  });

  it('should default output-dir, size tolerance and source base url', () => {
    const options = createCompareStatsCommand().options;
    expect(options.find((o) => o.long === '--output-dir')?.defaultValue).toBe(
      'output',
    );
    expect(
      options.find((o) => o.long === '--size-tolerance-pct')?.defaultValue,
    ).toBe(10);
    expect(
      options.find((o) => o.long === '--source-base-url')?.defaultValue,
    ).toBe('https://api.github.com');
  });

  describe('validate', () => {
    it('throws when the source file does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      expect(() => validate(baseOptions)).toThrow(
        'Source file not found: source.csv',
      );
    });

    it('throws when the target file does not exist', () => {
      vi.mocked(existsSync).mockImplementation((path) =>
        String(path).includes('source'),
      );
      expect(() => validate(baseOptions)).toThrow(
        'Target file not found: target.csv',
      );
    });

    it('throws when the size tolerance is out of range', () => {
      expect(() => validate({ ...baseOptions, sizeTolerancePct: 120 })).toThrow(
        '--size-tolerance-pct must be between 0 and 100',
      );
    });

    it('throws when --verify-git is missing org names', () => {
      expect(() => validate({ ...baseOptions, verifyGit: true })).toThrow(
        '--verify-git requires both --source-org and --target-org',
      );
    });

    it('throws when the rate limit check interval is not positive', () => {
      expect(() =>
        validate({ ...baseOptions, rateLimitCheckInterval: 0 }),
      ).toThrow('--rate-limit-check-interval must be a positive integer');
    });

    it('accepts a valid set of options', () => {
      expect(() =>
        validate({
          ...baseOptions,
          sizeTolerancePct: 10,
          verifyGit: true,
          sourceOrg: 'src',
          targetOrg: 'tgt',
        }),
      ).not.toThrow();
    });
  });
});
