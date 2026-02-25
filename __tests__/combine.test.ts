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
  buildKey,
  mergeTwo,
  combineFiles,
  runCombineStats,
  CombineStatsOptions,
} from '../src/combine.js';

describe('combine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildKey', () => {
    it('should build a composite key from match columns', () => {
      const row = { Org_Name: 'MyOrg', Repo_Name: 'MyRepo', Count: '5' };
      const key = buildKey(row, ['Org_Name', 'Repo_Name']);
      expect(key).toBe('myorg\0myrepo');
    });

    it('should be case-insensitive', () => {
      const row1 = { Org_Name: 'MyOrg', Repo_Name: 'MyRepo' };
      const row2 = { Org_Name: 'myorg', Repo_Name: 'myrepo' };
      expect(buildKey(row1, ['Org_Name', 'Repo_Name'])).toBe(
        buildKey(row2, ['Org_Name', 'Repo_Name']),
      );
    });

    it('should trim whitespace', () => {
      const row = { Org_Name: '  MyOrg  ', Repo_Name: ' MyRepo ' };
      const key = buildKey(row, ['Org_Name', 'Repo_Name']);
      expect(key).toBe('myorg\0myrepo');
    });

    it('should handle missing columns gracefully', () => {
      const row = { Org_Name: 'MyOrg' };
      const key = buildKey(row, ['Org_Name', 'Repo_Name']);
      expect(key).toBe('myorg\0');
    });

    it('should handle single match column', () => {
      const row = { Name: 'Test' };
      const key = buildKey(row, ['Name']);
      expect(key).toBe('test');
    });
  });

  describe('mergeTwo', () => {
    const matchColumns = ['Org_Name', 'Repo_Name'];

    it('should merge matching rows correctly', () => {
      const base = [
        { Org_Name: 'org1', Repo_Name: 'repo1', Size: '100' },
        { Org_Name: 'org1', Repo_Name: 'repo2', Size: '200' },
      ];
      const additional = [
        { Org_Name: 'org1', Repo_Name: 'repo1', Projects: '3' },
        { Org_Name: 'org1', Repo_Name: 'repo2', Projects: '5' },
      ];

      const result = mergeTwo(base, additional, matchColumns);

      expect(result.headers).toEqual([
        'Org_Name',
        'Repo_Name',
        'Size',
        'Projects',
      ]);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual({
        Org_Name: 'org1',
        Repo_Name: 'repo1',
        Size: '100',
        Projects: '3',
      });
      expect(result.rows[1]).toEqual({
        Org_Name: 'org1',
        Repo_Name: 'repo2',
        Size: '200',
        Projects: '5',
      });
    });

    it('should not duplicate match columns', () => {
      const base = [{ Org_Name: 'org1', Repo_Name: 'repo1', A: '1' }];
      const additional = [{ Org_Name: 'org1', Repo_Name: 'repo1', B: '2' }];

      const result = mergeTwo(base, additional, matchColumns);

      // Org_Name and Repo_Name should appear only once
      const orgCount = result.headers.filter((h) => h === 'Org_Name').length;
      expect(orgCount).toBe(1);
      expect(result.headers).toEqual(['Org_Name', 'Repo_Name', 'A', 'B']);
    });

    it('should preserve base-only rows with empty additional columns', () => {
      const base = [
        { Org_Name: 'org1', Repo_Name: 'repo1', Size: '100' },
        { Org_Name: 'org1', Repo_Name: 'repo-only-base', Size: '50' },
      ];
      const additional = [
        { Org_Name: 'org1', Repo_Name: 'repo1', Projects: '3' },
      ];

      const result = mergeTwo(base, additional, matchColumns);

      expect(result.rows).toHaveLength(2);
      expect(result.rows[1]).toEqual({
        Org_Name: 'org1',
        Repo_Name: 'repo-only-base',
        Size: '50',
        Projects: '',
      });
    });

    it('should preserve additional-only rows with empty base columns (full outer join)', () => {
      const base = [{ Org_Name: 'org1', Repo_Name: 'repo1', Size: '100' }];
      const additional = [
        { Org_Name: 'org1', Repo_Name: 'repo1', Projects: '3' },
        {
          Org_Name: 'org1',
          Repo_Name: 'repo-only-additional',
          Projects: '7',
        },
      ];

      const result = mergeTwo(base, additional, matchColumns);

      expect(result.rows).toHaveLength(2);
      // The additional-only row should have empty base columns
      expect(result.rows[1]).toEqual({
        Org_Name: 'org1',
        Repo_Name: 'repo-only-additional',
        Size: '',
        Projects: '7',
      });
    });

    it('should match case-insensitively', () => {
      const base = [{ Org_Name: 'MyOrg', Repo_Name: 'MyRepo', A: '1' }];
      const additional = [{ Org_Name: 'myorg', Repo_Name: 'myrepo', B: '2' }];

      const result = mergeTwo(base, additional, matchColumns);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].A).toBe('1');
      expect(result.rows[0].B).toBe('2');
    });

    it('should handle empty base', () => {
      const base: Record<string, string>[] = [];
      const additional = [
        { Org_Name: 'org1', Repo_Name: 'repo1', Projects: '3' },
      ];

      const result = mergeTwo(base, additional, matchColumns);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].Org_Name).toBe('org1');
      expect(result.rows[0].Projects).toBe('3');
    });

    it('should handle empty additional', () => {
      const base = [{ Org_Name: 'org1', Repo_Name: 'repo1', Size: '100' }];
      const additional: Record<string, string>[] = [];

      const result = mergeTwo(base, additional, matchColumns);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({
        Org_Name: 'org1',
        Repo_Name: 'repo1',
        Size: '100',
      });
    });

    it('should handle both empty', () => {
      const result = mergeTwo([], [], matchColumns);
      expect(result.rows).toHaveLength(0);
      expect(result.headers).toEqual(['Org_Name', 'Repo_Name']);
    });

    it('should handle duplicate columns in additional that also exist in base', () => {
      const base = [
        { Org_Name: 'org1', Repo_Name: 'repo1', Shared: 'base-val' },
      ];
      const additional = [
        { Org_Name: 'org1', Repo_Name: 'repo1', Shared: 'add-val' },
      ];

      const result = mergeTwo(base, additional, matchColumns);

      // Shared column should not be duplicated in headers
      const sharedCount = result.headers.filter((h) => h === 'Shared').length;
      expect(sharedCount).toBe(1);
    });
  });

  describe('combineFiles', () => {
    it('should throw if fewer than 2 files provided', () => {
      expect(() => combineFiles(['single.csv'], ['Org_Name'])).toThrow(
        'At least 2 files are required',
      );
    });

    it('should combine 2 files', () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const file1Data = [{ Org_Name: 'org1', Repo_Name: 'repo1', Size: '100' }];
      const file2Data = [
        { Org_Name: 'org1', Repo_Name: 'repo1', Projects: '3' },
      ];

      vi.mocked(readFileSync)
        .mockReturnValueOnce('csv-content-1')
        .mockReturnValueOnce('csv-content-2');
      vi.mocked(parse)
        .mockReturnValueOnce(file1Data)
        .mockReturnValueOnce(file2Data);

      const result = combineFiles(
        ['file1.csv', 'file2.csv'],
        ['Org_Name', 'Repo_Name'],
      );

      expect(result.headers).toEqual([
        'Org_Name',
        'Repo_Name',
        'Size',
        'Projects',
      ]);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({
        Org_Name: 'org1',
        Repo_Name: 'repo1',
        Size: '100',
        Projects: '3',
      });
    });

    it('should combine 3 files iteratively', () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const file1Data = [{ Org_Name: 'org1', Repo_Name: 'repo1', A: '1' }];
      const file2Data = [{ Org_Name: 'org1', Repo_Name: 'repo1', B: '2' }];
      const file3Data = [{ Org_Name: 'org1', Repo_Name: 'repo1', C: '3' }];

      vi.mocked(readFileSync)
        .mockReturnValueOnce('csv1')
        .mockReturnValueOnce('csv2')
        .mockReturnValueOnce('csv3');
      vi.mocked(parse)
        .mockReturnValueOnce(file1Data)
        .mockReturnValueOnce(file2Data)
        .mockReturnValueOnce(file3Data);

      const result = combineFiles(
        ['f1.csv', 'f2.csv', 'f3.csv'],
        ['Org_Name', 'Repo_Name'],
      );

      expect(result.headers).toEqual(['Org_Name', 'Repo_Name', 'A', 'B', 'C']);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({
        Org_Name: 'org1',
        Repo_Name: 'repo1',
        A: '1',
        B: '2',
        C: '3',
      });
    });

    it('should handle rows from different files with different repos', () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const file1Data = [
        { Org_Name: 'org1', Repo_Name: 'repo1', A: '1' },
        { Org_Name: 'org1', Repo_Name: 'repo2', A: '2' },
      ];
      const file2Data = [
        { Org_Name: 'org1', Repo_Name: 'repo2', B: '20' },
        { Org_Name: 'org1', Repo_Name: 'repo3', B: '30' },
      ];

      vi.mocked(readFileSync)
        .mockReturnValueOnce('csv1')
        .mockReturnValueOnce('csv2');
      vi.mocked(parse)
        .mockReturnValueOnce(file1Data)
        .mockReturnValueOnce(file2Data);

      const result = combineFiles(
        ['f1.csv', 'f2.csv'],
        ['Org_Name', 'Repo_Name'],
      );

      // Full outer join: 3 rows total
      expect(result.rows).toHaveLength(3);
      // repo1: only in file1
      expect(result.rows[0]).toEqual({
        Org_Name: 'org1',
        Repo_Name: 'repo1',
        A: '1',
        B: '',
      });
      // repo2: in both
      expect(result.rows[1]).toEqual({
        Org_Name: 'org1',
        Repo_Name: 'repo2',
        A: '2',
        B: '20',
      });
      // repo3: only in file2
      expect(result.rows[2]).toEqual({
        Org_Name: 'org1',
        Repo_Name: 'repo3',
        A: '',
        B: '30',
      });
    });
  });

  describe('runCombineStats', () => {
    it('should throw if a file does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const options: CombineStatsOptions = {
        files: ['missing.csv', 'also-missing.csv'],
        matchColumns: ['Org_Name', 'Repo_Name'],
        outputDir: 'output',
      };

      await expect(runCombineStats(options)).rejects.toThrow(
        'File not found: missing.csv',
      );
    });

    it('should combine files and write output', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const file1Data = [{ Org_Name: 'org1', Repo_Name: 'repo1', Size: '100' }];
      const file2Data = [
        { Org_Name: 'org1', Repo_Name: 'repo1', Projects: '3' },
      ];

      vi.mocked(readFileSync)
        .mockReturnValueOnce('csv1')
        .mockReturnValueOnce('csv2');
      vi.mocked(parse)
        .mockReturnValueOnce(file1Data)
        .mockReturnValueOnce(file2Data);

      // Mock mkdir
      vi.mock('fs/promises', async () => {
        const actual =
          await vi.importActual<typeof import('fs/promises')>('fs/promises');
        return {
          ...actual,
          mkdir: vi.fn().mockResolvedValue(undefined),
        };
      });

      const options: CombineStatsOptions = {
        files: ['file1.csv', 'file2.csv'],
        matchColumns: ['Org_Name', 'Repo_Name'],
        outputDir: 'output',
        outputFileName: 'combined.csv',
      };

      await runCombineStats(options);

      expect(writeFileSync).toHaveBeenCalled();
      const [filePath, content] = vi.mocked(writeFileSync).mock.calls[0];
      expect(String(filePath)).toContain('combined.csv');
      expect(String(content)).toContain('Org_Name,Repo_Name,Size,Projects');
    });
  });
});
