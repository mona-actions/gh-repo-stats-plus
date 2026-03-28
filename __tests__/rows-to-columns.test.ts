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
  rowsToColumns,
  determineHeaders,
  generateRowsToColumnsFileName,
  runRowsToColumns,
} from '../src/rows-to-columns.js';

describe('rows-to-columns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rowsToColumns', () => {
    it('should convert matching rows into columns', () => {
      const baseCsv = [
        { Org_Name: 'myorg', Repo_Name: 'repo1', Size: '100' },
        { Org_Name: 'myorg', Repo_Name: 'repo2', Size: '200' },
      ];

      const additionalCsv = [
        {
          owner: 'myorg',
          name: 'repo1',
          type: 'large_files',
          message: 'Found 5 large files',
        },
        {
          owner: 'myorg',
          name: 'repo1',
          type: 'git_lfs',
          message: 'Has 3 LFS objects',
        },
        {
          owner: 'myorg',
          name: 'repo2',
          type: 'large_files',
          message: 'Found 10 large files',
        },
      ];

      const { combinedData, headerTypes } = rowsToColumns(
        baseCsv,
        additionalCsv,
        ['Org_Name', 'Repo_Name'],
        ['owner', 'name'],
        'type',
        'message',
      );

      expect(headerTypes.size).toBe(2);
      expect(headerTypes.has('large_files')).toBe(true);
      expect(headerTypes.has('git_lfs')).toBe(true);

      // repo1 has both types
      expect(combinedData[0]['large_files']).toBe('5');
      expect(combinedData[0]['git_lfs']).toBe('3');
      expect(combinedData[0]['Has_Unmigratable']).toBe('TRUE');

      // repo2 has large_files but not git_lfs
      expect(combinedData[1]['large_files']).toBe('10');
      expect(combinedData[1]['git_lfs']).toBe('0');
      expect(combinedData[1]['Has_Unmigratable']).toBe('TRUE');
    });

    it('should set Has_Unmigratable to FALSE when no matches', () => {
      const baseCsv = [{ Org_Name: 'myorg', Repo_Name: 'repo1' }];

      const additionalCsv = [
        {
          owner: 'otherorg',
          name: 'repo2',
          type: 'large_files',
          message: '5 files',
        },
      ];

      const { combinedData } = rowsToColumns(
        baseCsv,
        additionalCsv,
        ['Org_Name', 'Repo_Name'],
        ['owner', 'name'],
        'type',
        'message',
      );

      expect(combinedData[0]['Has_Unmigratable']).toBe('FALSE');
      expect(combinedData[0]['large_files']).toBe('0');
    });

    it('should handle case-insensitive matching', () => {
      const baseCsv = [{ Org_Name: 'MyOrg', Repo_Name: 'MyRepo' }];

      const additionalCsv = [
        {
          owner: 'myorg',
          name: 'myrepo',
          type: 'warning',
          message: '42 issues',
        },
      ];

      const { combinedData } = rowsToColumns(
        baseCsv,
        additionalCsv,
        ['Org_Name', 'Repo_Name'],
        ['owner', 'name'],
        'type',
        'message',
      );

      expect(combinedData[0]['warning']).toBe('42');
      expect(combinedData[0]['Has_Unmigratable']).toBe('TRUE');
    });

    it('should use "1+" when value has no digits', () => {
      const baseCsv = [{ Org_Name: 'myorg', Repo_Name: 'repo1' }];

      const additionalCsv = [
        {
          owner: 'myorg',
          name: 'repo1',
          type: 'issue',
          message: 'no numbers here',
        },
      ];

      const { combinedData } = rowsToColumns(
        baseCsv,
        additionalCsv,
        ['Org_Name', 'Repo_Name'],
        ['owner', 'name'],
        'type',
        'message',
      );

      expect(combinedData[0]['issue']).toBe('1+');
    });

    it('should extract first digit sequence from values', () => {
      const baseCsv = [{ Org_Name: 'myorg', Repo_Name: 'repo1' }];

      const additionalCsv = [
        {
          owner: 'myorg',
          name: 'repo1',
          type: 'large_files',
          message: 'Found 123 large files over 100MB',
        },
      ];

      const { combinedData } = rowsToColumns(
        baseCsv,
        additionalCsv,
        ['Org_Name', 'Repo_Name'],
        ['owner', 'name'],
        'type',
        'message',
      );

      expect(combinedData[0]['large_files']).toBe('123');
    });

    it('should preserve base row data', () => {
      const baseCsv = [
        {
          Org_Name: 'myorg',
          Repo_Name: 'repo1',
          Size: '100',
          Language: 'TypeScript',
        },
      ];

      const additionalCsv = [
        { owner: 'myorg', name: 'repo1', type: 'check', message: '1 issue' },
      ];

      const { combinedData } = rowsToColumns(
        baseCsv,
        additionalCsv,
        ['Org_Name', 'Repo_Name'],
        ['owner', 'name'],
        'type',
        'message',
      );

      expect(combinedData[0]['Org_Name']).toBe('myorg');
      expect(combinedData[0]['Repo_Name']).toBe('repo1');
      expect(combinedData[0]['Size']).toBe('100');
      expect(combinedData[0]['Language']).toBe('TypeScript');
    });

    it('should handle empty additional CSV', () => {
      const baseCsv = [{ Org_Name: 'myorg', Repo_Name: 'repo1' }];

      const { combinedData, headerTypes } = rowsToColumns(
        baseCsv,
        [],
        ['Org_Name', 'Repo_Name'],
        ['owner', 'name'],
        'type',
        'message',
      );

      expect(headerTypes.size).toBe(0);
      expect(combinedData.length).toBe(1);
      expect(combinedData[0]['Has_Unmigratable']).toBe('FALSE');
    });

    it('should handle empty base CSV', () => {
      const additionalCsv = [
        { owner: 'myorg', name: 'repo1', type: 'check', message: '5 issues' },
      ];

      const { combinedData, headerTypes } = rowsToColumns(
        [],
        additionalCsv,
        ['Org_Name', 'Repo_Name'],
        ['owner', 'name'],
        'type',
        'message',
      );

      expect(headerTypes.size).toBe(1);
      expect(combinedData.length).toBe(0);
    });

    it('should handle multiple matching rows with same type (last wins)', () => {
      const baseCsv = [{ Org_Name: 'myorg', Repo_Name: 'repo1' }];

      const additionalCsv = [
        {
          owner: 'myorg',
          name: 'repo1',
          type: 'large_files',
          message: '5 files',
        },
        {
          owner: 'myorg',
          name: 'repo1',
          type: 'large_files',
          message: '10 files',
        },
      ];

      const { combinedData } = rowsToColumns(
        baseCsv,
        additionalCsv,
        ['Org_Name', 'Repo_Name'],
        ['owner', 'name'],
        'type',
        'message',
      );

      // Last matching row with same key overwrites
      expect(combinedData[0]['large_files']).toBe('10');
    });
  });

  describe('determineHeaders', () => {
    it('should combine base headers with header types and Has_Unmigratable', () => {
      const baseCsv = [{ Org_Name: 'myorg', Repo_Name: 'repo1', Size: '100' }];
      const headerTypes = new Set(['large_files', 'git_lfs']);

      const headers = determineHeaders(baseCsv, headerTypes);

      expect(headers).toEqual([
        'Org_Name',
        'Repo_Name',
        'Size',
        'large_files',
        'git_lfs',
        'Has_Unmigratable',
      ]);
    });

    it('should handle empty base CSV', () => {
      const headerTypes = new Set(['type1']);
      const headers = determineHeaders([], headerTypes);

      expect(headers).toEqual(['type1', 'Has_Unmigratable']);
    });

    it('should handle empty header types', () => {
      const baseCsv = [{ Org_Name: 'myorg', Repo_Name: 'repo1' }];
      const headers = determineHeaders(baseCsv, new Set());

      expect(headers).toEqual(['Org_Name', 'Repo_Name', 'Has_Unmigratable']);
    });
  });

  describe('generateRowsToColumnsFileName', () => {
    it('should generate a filename with timestamp', () => {
      const fileName = generateRowsToColumnsFileName();
      expect(fileName).toMatch(/^rows-to-columns-\d{12}_ts\.csv$/);
    });
  });

  describe('runRowsToColumns', () => {
    const baseCsvContent = 'Org_Name,Repo_Name\nmyorg,repo1\nmyorg,repo2';
    const additionalCsvContent =
      'owner,name,type,message\nmyorg,repo1,large_files,Found 5 files';

    beforeEach(() => {
      vi.mocked(existsSync).mockReturnValue(true);
    });

    it('should throw if base CSV file does not exist', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        if (String(path).includes('base.csv')) return false;
        return true;
      });

      await expect(
        runRowsToColumns({
          baseCsvFile: 'base.csv',
          additionalCsvFile: 'additional.csv',
          headerColumnKeys: 'type',
          headerColumnValues: 'message',
          baseCsvColumns: ['Org_Name', 'Repo_Name'],
          additionalCsvColumns: ['owner', 'name'],
        }),
      ).rejects.toThrow('Base CSV file not found');
    });

    it('should throw if additional CSV file does not exist', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        if (String(path).includes('additional.csv')) return false;
        return true;
      });

      await expect(
        runRowsToColumns({
          baseCsvFile: 'base.csv',
          additionalCsvFile: 'additional.csv',
          headerColumnKeys: 'type',
          headerColumnValues: 'message',
          baseCsvColumns: ['Org_Name', 'Repo_Name'],
          additionalCsvColumns: ['owner', 'name'],
        }),
      ).rejects.toThrow('Additional CSV file not found');
    });

    it('should read CSV files, process, and write output', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(baseCsvContent);

      const baseParsed = [
        { Org_Name: 'myorg', Repo_Name: 'repo1' },
        { Org_Name: 'myorg', Repo_Name: 'repo2' },
      ];
      const additionalParsed = [
        {
          owner: 'myorg',
          name: 'repo1',
          type: 'large_files',
          message: 'Found 5 files',
        },
      ];

      vi.mocked(parse)
        .mockReturnValueOnce(baseParsed)
        .mockReturnValueOnce(additionalParsed);

      const outputPath = await runRowsToColumns({
        baseCsvFile: 'base.csv',
        additionalCsvFile: 'additional.csv',
        headerColumnKeys: 'type',
        headerColumnValues: 'message',
        baseCsvColumns: ['Org_Name', 'Repo_Name'],
        additionalCsvColumns: ['owner', 'name'],
        outputDir: 'output',
      });

      expect(outputPath).toContain('rows-to-columns-');
      expect(writeFileSync).toHaveBeenCalled();
    });

    it('should use custom output file name when provided', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(baseCsvContent);
      vi.mocked(parse).mockReturnValue([]);

      const outputPath = await runRowsToColumns({
        baseCsvFile: 'base.csv',
        additionalCsvFile: 'additional.csv',
        headerColumnKeys: 'type',
        headerColumnValues: 'message',
        baseCsvColumns: ['Org_Name', 'Repo_Name'],
        additionalCsvColumns: ['owner', 'name'],
        outputFileName: 'my-output.csv',
        outputDir: 'output',
      });

      expect(outputPath).toContain('my-output.csv');
    });
  });
});
