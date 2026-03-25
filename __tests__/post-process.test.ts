import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'fs';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    appendFileSync: vi.fn(),
  };
});

vi.mock('csv-parse/sync', () => ({
  parse: vi.fn(),
}));

vi.mock('../src/logger.js', () => ({
  createLogger: vi.fn().mockResolvedValue({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { parse } from 'csv-parse/sync';
import {
  validateRulesConfig,
  getColumnsByRange,
  getColumnsToProcess,
  getIndicatorSourceColumns,
  findRuleForColumn,
  processCell,
  processRow,
  addIndicatorColumns,
  processData,
  generatePostProcessFileName,
  runPostProcess,
} from '../src/post-process.js';
import {
  PostProcessRulesConfig,
  PostProcessRule,
  IndicatorColumnConfig,
} from '../src/types.js';

describe('post-process', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- validateRulesConfig ---

  describe('validateRulesConfig', () => {
    it('should accept a valid configuration', () => {
      const config = {
        rules: [
          {
            columns: ['*'],
            pattern: '(\\d+)',
            fallback: '1+',
            emptyValue: '0',
          },
        ],
      };
      const result = validateRulesConfig(config);
      expect(result.rules).toHaveLength(1);
    });

    it('should accept config with processColumns and indicatorColumns', () => {
      const config = {
        rules: [{ columns: ['col1'] }],
        processColumns: { columns: ['col1'], columnRanges: [{ start: 0 }] },
        indicatorColumns: [
          { name: 'ind1', trueValue: true, falseValue: false },
        ],
      };
      const result = validateRulesConfig(config);
      expect(result.indicatorColumns).toHaveLength(1);
    });

    it('should throw if config is null', () => {
      expect(() => validateRulesConfig(null)).toThrow(
        'must be a non-null object',
      );
    });

    it('should throw if config is not an object', () => {
      expect(() => validateRulesConfig('string')).toThrow(
        'must be a non-null object',
      );
    });

    it('should throw if rules is not an array', () => {
      expect(() => validateRulesConfig({ rules: 'not-array' })).toThrow(
        'must contain a "rules" array',
      );
    });

    it('should throw if rules is missing', () => {
      expect(() => validateRulesConfig({})).toThrow(
        'must contain a "rules" array',
      );
    });

    it('should throw if a rule has no columns', () => {
      expect(() =>
        validateRulesConfig({ rules: [{ pattern: '(\\d+)' }] }),
      ).toThrow('non-empty "columns" array');
    });

    it('should throw if a rule has empty columns array', () => {
      expect(() => validateRulesConfig({ rules: [{ columns: [] }] })).toThrow(
        'non-empty "columns" array',
      );
    });

    it('should throw if a column is not a string', () => {
      expect(() =>
        validateRulesConfig({ rules: [{ columns: [123] }] }),
      ).toThrow('non-string column value');
    });

    it('should throw if indicatorColumns entry is missing name', () => {
      expect(() =>
        validateRulesConfig({
          rules: [{ columns: ['*'] }],
          indicatorColumns: [{ trueValue: true, falseValue: false }],
        }),
      ).toThrow('non-empty "name" string');
    });

    it('should throw if indicatorColumns entry is missing trueValue', () => {
      expect(() =>
        validateRulesConfig({
          rules: [{ columns: ['*'] }],
          indicatorColumns: [{ name: 'ind1', falseValue: false }],
        }),
      ).toThrow('"trueValue" and "falseValue"');
    });
  });

  // --- getColumnsByRange ---

  describe('getColumnsByRange', () => {
    const allColumns = ['A', 'B', 'C', 'D', 'E', 'F'];

    it('should handle a single number (start-only)', () => {
      const result = getColumnsByRange([3], allColumns);
      expect(result).toEqual(['D', 'E', 'F']);
    });

    it('should handle start-only object', () => {
      const result = getColumnsByRange([{ start: 2 }], allColumns);
      expect(result).toEqual(['C', 'D', 'E', 'F']);
    });

    it('should handle full range object', () => {
      const result = getColumnsByRange([{ start: 1, end: 4 }], allColumns);
      expect(result).toEqual(['B', 'C', 'D']);
    });

    it('should handle mixed ranges', () => {
      const result = getColumnsByRange([{ start: 0, end: 2 }, 4], allColumns);
      expect(result).toEqual(['A', 'B', 'E', 'F']);
    });

    it('should handle empty ranges array', () => {
      const result = getColumnsByRange([], allColumns);
      expect(result).toEqual([]);
    });

    it('should handle range with no start or end', () => {
      const result = getColumnsByRange([{}], allColumns);
      expect(result).toEqual(allColumns);
    });
  });

  // --- getColumnsToProcess ---

  describe('getColumnsToProcess', () => {
    const sampleRow = { Org: 'org1', Repo: 'repo1', Size: '100', Count: '5' };

    it('should return all columns when no processColumns config', () => {
      const config: PostProcessRulesConfig = { rules: [] };
      const result = getColumnsToProcess(config, sampleRow);
      expect(result).toEqual(['Org', 'Repo', 'Size', 'Count']);
    });

    it('should return named columns (case-insensitive)', () => {
      const config: PostProcessRulesConfig = {
        rules: [],
        processColumns: { columns: ['org', 'SIZE'] },
      };
      const result = getColumnsToProcess(config, sampleRow);
      expect(result).toEqual(['Org', 'Size']);
    });

    it('should return columns from ranges', () => {
      const config: PostProcessRulesConfig = {
        rules: [],
        processColumns: { columnRanges: [{ start: 2 }] },
      };
      const result = getColumnsToProcess(config, sampleRow);
      expect(result).toEqual(['Size', 'Count']);
    });

    it('should deduplicate columns', () => {
      const config: PostProcessRulesConfig = {
        rules: [],
        processColumns: {
          columns: ['Size'],
          columnRanges: [{ start: 2 }],
        },
      };
      const result = getColumnsToProcess(config, sampleRow);
      expect(result).toEqual(['Size', 'Count']);
    });

    it('should ignore columns not found in sample row', () => {
      const config: PostProcessRulesConfig = {
        rules: [],
        processColumns: { columns: ['NonExistent'] },
      };
      const result = getColumnsToProcess(config, sampleRow);
      expect(result).toEqual([]);
    });
  });

  // --- getIndicatorSourceColumns ---

  describe('getIndicatorSourceColumns', () => {
    const allColumns = ['A', 'B', 'C', 'D'];

    it('should return all columns when no source specified', () => {
      const indicator: IndicatorColumnConfig = {
        name: 'ind',
        trueValue: true,
        falseValue: false,
      };
      const result = getIndicatorSourceColumns(indicator, allColumns);
      expect(result).toEqual(allColumns);
    });

    it('should return named source columns (case-insensitive)', () => {
      const indicator: IndicatorColumnConfig = {
        name: 'ind',
        sourceColumns: ['a', 'C'],
        trueValue: true,
        falseValue: false,
      };
      const result = getIndicatorSourceColumns(indicator, allColumns);
      expect(result).toEqual(['A', 'C']);
    });

    it('should return columns from source ranges', () => {
      const indicator: IndicatorColumnConfig = {
        name: 'ind',
        sourceColumnRanges: [{ start: 2 }],
        trueValue: true,
        falseValue: false,
      };
      const result = getIndicatorSourceColumns(indicator, allColumns);
      expect(result).toEqual(['C', 'D']);
    });

    it('should combine source columns and ranges', () => {
      const indicator: IndicatorColumnConfig = {
        name: 'ind',
        sourceColumns: ['A'],
        sourceColumnRanges: [{ start: 3 }],
        trueValue: true,
        falseValue: false,
      };
      const result = getIndicatorSourceColumns(indicator, allColumns);
      expect(result).toEqual(['A', 'D']);
    });
  });

  // --- findRuleForColumn ---

  describe('findRuleForColumn', () => {
    it('should return defaults when no rules match', () => {
      const rules: PostProcessRule[] = [
        { columns: ['other'], pattern: '(\\d+)' },
      ];
      const result = findRuleForColumn('myColumn', rules);
      expect(result.pattern).toBeNull();
      expect(result.fallback).toBe('1+');
      expect(result.emptyValue).toBe('0');
      expect(result.replacement).toBe('$0');
    });

    it('should match direct column name (case-insensitive)', () => {
      const rules: PostProcessRule[] = [
        { columns: ['MyColumn'], pattern: '(\\d+)', fallback: 'no-match' },
      ];
      const result = findRuleForColumn('mycolumn', rules);
      expect(result.pattern).toBeInstanceOf(RegExp);
      expect(result.fallback).toBe('no-match');
    });

    it('should use wildcard as fallback', () => {
      const rules: PostProcessRule[] = [
        { columns: ['*'], pattern: '(\\d+)', fallback: 'wildcard' },
      ];
      const result = findRuleForColumn('anyColumn', rules);
      expect(result.fallback).toBe('wildcard');
    });

    it('should give precedence to last matching rule', () => {
      const rules: PostProcessRule[] = [
        { columns: ['col1'], fallback: 'first' },
        { columns: ['col1'], fallback: 'second' },
      ];
      const result = findRuleForColumn('col1', rules);
      expect(result.fallback).toBe('second');
    });

    it('should prefer direct match over wildcard', () => {
      const rules: PostProcessRule[] = [
        { columns: ['*'], fallback: 'wildcard' },
        { columns: ['specific'], fallback: 'specific-match' },
      ];
      const result = findRuleForColumn('specific', rules);
      expect(result.fallback).toBe('specific-match');
    });

    it('should handle boolean fallback values', () => {
      const rules: PostProcessRule[] = [
        { columns: ['bool-col'], fallback: true, emptyValue: false },
      ];
      const result = findRuleForColumn('bool-col', rules);
      expect(result.fallback).toBe(true);
      expect(result.emptyValue).toBe(false);
    });
  });

  // --- processCell ---

  describe('processCell', () => {
    it('should return emptyValue for undefined', () => {
      const rule = findRuleForColumn('col', [
        { columns: ['col'], emptyValue: '0' },
      ]);
      expect(processCell(undefined, rule)).toBe('0');
    });

    it('should return emptyValue for null', () => {
      const rule = findRuleForColumn('col', [
        { columns: ['col'], emptyValue: 'N/A' },
      ]);
      expect(processCell(null, rule)).toBe('N/A');
    });

    it('should return emptyValue for empty string', () => {
      const rule = findRuleForColumn('col', [
        { columns: ['col'], emptyValue: '0' },
      ]);
      expect(processCell('', rule)).toBe('0');
    });

    it('should return emptyValue for whitespace-only string', () => {
      const rule = findRuleForColumn('col', [
        { columns: ['col'], emptyValue: '0' },
      ]);
      expect(processCell('   ', rule)).toBe('0');
    });

    it('should match pattern and apply replacement', () => {
      const rule = findRuleForColumn('col', [
        {
          columns: ['col'],
          pattern: '(\\d+)',
          replacement: '$1',
          fallback: '1+',
        },
      ]);
      expect(processCell('abc 42 xyz', rule)).toBe('42');
    });

    it('should return fallback when pattern does not match', () => {
      const rule = findRuleForColumn('col', [
        {
          columns: ['col'],
          pattern: '(\\d+)',
          fallback: '1+',
        },
      ]);
      expect(processCell('no numbers here', rule)).toBe('1+');
    });

    it('should return fallback when no pattern is defined', () => {
      const rule = findRuleForColumn('col', [
        { columns: ['col'], fallback: 'default-fallback' },
      ]);
      expect(processCell('some value', rule)).toBe('default-fallback');
    });

    it('should handle boolean emptyValue', () => {
      const rule = findRuleForColumn('col', [
        { columns: ['col'], emptyValue: false },
      ]);
      expect(processCell('', rule)).toBe(false);
    });

    it('should use $0 for full match in replacement', () => {
      const rule = findRuleForColumn('col', [
        { columns: ['col'], pattern: '\\d+\\.\\d+' },
      ]);
      // default replacement is $0 = full match
      expect(processCell('version 1.5 release', rule)).toBe('1.5');
    });

    it('should handle multiple capture groups', () => {
      const rule = findRuleForColumn('col', [
        {
          columns: ['col'],
          pattern: '(\\d+)\\s+(\\w+)',
          replacement: '$2=$1',
        },
      ]);
      expect(processCell('42 items', rule)).toBe('items=42');
    });
  });

  // --- processRow ---

  describe('processRow', () => {
    it('should only process specified columns', () => {
      const row = { A: '10', B: '20', C: 'text' };
      const rules: PostProcessRule[] = [
        {
          columns: ['*'],
          pattern: '(\\d+)',
          replacement: '$1',
          fallback: '1+',
          emptyValue: '0',
        },
      ];
      const result = processRow(row, ['A', 'B'], rules);

      expect(result.A).toBe('10');
      expect(result.B).toBe('20');
      expect(result.C).toBe('text'); // Not processed
    });

    it('should apply different rules to different columns', () => {
      const row = { Size: '100 MB', HasLFS: '', Count: '5' };
      const rules: PostProcessRule[] = [
        {
          columns: ['*'],
          pattern: '(\\d+)',
          replacement: '$1',
          fallback: '1+',
          emptyValue: '0',
        },
        { columns: ['HasLFS'], fallback: true, emptyValue: false },
      ];
      const result = processRow(row, ['Size', 'HasLFS', 'Count'], rules);

      expect(result.Size).toBe('100');
      expect(result.HasLFS).toBe('false'); // emptyValue = false, stringified
      expect(result.Count).toBe('5');
    });
  });

  // --- addIndicatorColumns ---

  describe('addIndicatorColumns', () => {
    it('should return data unchanged when no indicator columns configured', () => {
      const data = [{ A: '1', B: '2' }];
      const config: PostProcessRulesConfig = { rules: [] };
      const result = addIndicatorColumns(data, config);
      expect(result).toEqual(data);
    });

    it('should add indicator column with trueValue when non-empty values exist', () => {
      const data = [{ A: '1', B: '0' }];
      const config: PostProcessRulesConfig = {
        rules: [{ columns: ['*'], emptyValue: '0' }],
        indicatorColumns: [
          {
            name: 'has_data',
            sourceColumns: ['A', 'B'],
            trueValue: true,
            falseValue: false,
          },
        ],
      };
      const result = addIndicatorColumns(data, config);
      expect(result[0].has_data).toBe('true');
    });

    it('should add indicator column with falseValue when all values are empty', () => {
      const data = [{ A: '0', B: '0' }];
      const config: PostProcessRulesConfig = {
        rules: [{ columns: ['*'], emptyValue: '0' }],
        indicatorColumns: [
          {
            name: 'has_data',
            sourceColumns: ['A', 'B'],
            trueValue: true,
            falseValue: false,
          },
        ],
      };
      const result = addIndicatorColumns(data, config);
      expect(result[0].has_data).toBe('false');
    });

    it('should use sourceColumnRanges when specified', () => {
      const data = [{ A: '0', B: '0', C: '5' }];
      const config: PostProcessRulesConfig = {
        rules: [{ columns: ['*'], emptyValue: '0' }],
        indicatorColumns: [
          {
            name: 'has_c',
            sourceColumnRanges: [{ start: 2 }],
            trueValue: 'YES',
            falseValue: 'NO',
          },
        ],
      };
      const result = addIndicatorColumns(data, config);
      expect(result[0].has_c).toBe('YES');
    });

    it('should check all columns when no source specified', () => {
      const data = [{ A: '0', B: '0' }];
      const config: PostProcessRulesConfig = {
        rules: [{ columns: ['*'], emptyValue: '0' }],
        indicatorColumns: [
          {
            name: 'has_any',
            trueValue: true,
            falseValue: false,
          },
        ],
      };
      const result = addIndicatorColumns(data, config);
      expect(result[0].has_any).toBe('false');
    });
  });

  // --- processData ---

  describe('processData', () => {
    it('should return empty array for empty input', () => {
      const config: PostProcessRulesConfig = {
        rules: [{ columns: ['*'], emptyValue: '0' }],
      };
      const result = processData([], config);
      expect(result).toEqual([]);
    });

    it('should process rows and add indicator columns end-to-end', () => {
      const data = [
        { Org: 'org1', Repo: 'repo1', Issues: '42', LFS: '' },
        { Org: 'org2', Repo: 'repo2', Issues: '', LFS: 'true' },
      ];
      const config: PostProcessRulesConfig = {
        rules: [
          {
            columns: ['*'],
            pattern: '(\\d+)',
            replacement: '$1',
            fallback: '1+',
            emptyValue: '0',
          },
          {
            columns: ['LFS'],
            fallback: true,
            emptyValue: false,
          },
        ],
        processColumns: { columnRanges: [{ start: 2 }] },
        indicatorColumns: [
          {
            name: 'has_issues_or_lfs',
            sourceColumnRanges: [{ start: 2 }],
            trueValue: true,
            falseValue: false,
          },
        ],
      };

      const result = processData(data, config);

      expect(result).toHaveLength(2);

      // Row 1: Issues=42 matched pattern, LFS='' → emptyValue=false
      expect(result[0].Issues).toBe('42');
      expect(result[0].LFS).toBe('false');
      // Indicator: 42 is non-empty/non-zero → true
      expect(result[0].has_issues_or_lfs).toBe('true');

      // Row 2: Issues='' → emptyValue=0, LFS='true' → fallback=true
      expect(result[1].Issues).toBe('0');
      expect(result[1].LFS).toBe('true');
      expect(result[1].has_issues_or_lfs).toBe('true');

      // Org and Repo should be unchanged (not in processColumns range)
      expect(result[0].Org).toBe('org1');
      expect(result[1].Repo).toBe('repo2');
    });
  });

  // --- generatePostProcessFileName ---

  describe('generatePostProcessFileName', () => {
    it('should generate a filename with timestamp pattern', () => {
      const fileName = generatePostProcessFileName();
      expect(fileName).toMatch(/^post-processed-\d{12}_ts\.csv$/);
    });
  });

  // --- runPostProcess ---

  describe('runPostProcess', () => {
    it('should throw if input file does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      await expect(
        runPostProcess({
          input: 'missing.csv',
          rulesFile: 'rules.json',
          outputDir: 'output',
        }),
      ).rejects.toThrow('Input CSV file not found');
    });

    it('should throw if rules file does not exist', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        return String(path).endsWith('.csv');
      });

      await expect(
        runPostProcess({
          input: 'input.csv',
          rulesFile: 'missing-rules.json',
          outputDir: 'output',
        }),
      ).rejects.toThrow('Rules file not found');
    });

    it('should throw if rules file is invalid JSON', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('not valid json');

      await expect(
        runPostProcess({
          input: 'input.csv',
          rulesFile: 'rules.json',
          outputDir: 'output',
        }),
      ).rejects.toThrow('Invalid JSON in rules file');
    });

    it('should process CSV data and write output', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const rulesJson = JSON.stringify({
        rules: [
          {
            columns: ['*'],
            pattern: '(\\d+)',
            replacement: '$1',
            fallback: '1+',
            emptyValue: '0',
          },
        ],
      });

      // readFileSync is called for: rules file, then CSV file (via readCsvFile)
      vi.mocked(readFileSync)
        .mockReturnValueOnce(rulesJson) // rules file
        .mockReturnValueOnce('csv-content'); // CSV file content

      const csvData = [
        { Org: 'org1', Repo: 'repo1', Count: '42' },
        { Org: 'org2', Repo: 'repo2', Count: '' },
      ];
      vi.mocked(parse).mockReturnValue(csvData);

      // Mock mkdir
      vi.mock('fs/promises', async () => {
        const actual =
          await vi.importActual<typeof import('fs/promises')>('fs/promises');
        return {
          ...actual,
          mkdir: vi.fn().mockResolvedValue(undefined),
        };
      });

      const outputPath = await runPostProcess({
        input: 'input.csv',
        rulesFile: 'rules.json',
        outputDir: 'output',
        outputFileName: 'result.csv',
      });

      expect(writeFileSync).toHaveBeenCalled();
      const [filePath, content] = vi.mocked(writeFileSync).mock.calls[0];
      expect(String(filePath)).toContain('result.csv');
      expect(String(content)).toContain('Org,Repo,Count');
      expect(outputPath).toContain('result.csv');
    });

    it('should handle empty CSV gracefully', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const rulesJson = JSON.stringify({
        rules: [{ columns: ['*'], emptyValue: '0' }],
      });

      vi.mocked(readFileSync)
        .mockReturnValueOnce(rulesJson)
        .mockReturnValueOnce('');

      vi.mocked(parse).mockReturnValue([]);

      vi.mock('fs/promises', async () => {
        const actual =
          await vi.importActual<typeof import('fs/promises')>('fs/promises');
        return {
          ...actual,
          mkdir: vi.fn().mockResolvedValue(undefined),
        };
      });

      const outputPath = await runPostProcess({
        input: 'empty.csv',
        rulesFile: 'rules.json',
        outputDir: 'output',
      });

      expect(writeFileSync).toHaveBeenCalled();
      expect(outputPath).toContain('output');
    });
  });
});
