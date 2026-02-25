import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'fs';

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

import { parse } from 'csv-parse/sync';
import {
  escapeCsvField,
  initializeCsvFile,
  appendCsvRow,
  readCsvFile,
  writeCsvFile,
  REPO_STATS_COLUMNS,
  PROJECT_STATS_COLUMNS,
  DEFAULT_MATCH_COLUMNS,
} from '../src/csv.js';
import { createMockLogger } from './test-utils.js';

describe('csv', () => {
  const mockLogger = createMockLogger();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('escapeCsvField', () => {
    it('should return empty string for null/undefined', () => {
      expect(escapeCsvField(null)).toBe('');
      expect(escapeCsvField(undefined)).toBe('');
    });

    it('should return plain string as-is', () => {
      expect(escapeCsvField('hello')).toBe('hello');
    });

    it('should wrap in quotes if value contains comma', () => {
      expect(escapeCsvField('hello, world')).toBe('"hello, world"');
    });

    it('should wrap in quotes and double internal quotes', () => {
      expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    });

    it('should wrap in quotes if value contains newline', () => {
      expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    });

    it('should wrap in quotes if value contains carriage return', () => {
      expect(escapeCsvField('line1\rline2')).toBe('"line1\rline2"');
    });

    it('should convert numbers to strings', () => {
      expect(escapeCsvField(42)).toBe('42');
    });

    it('should convert booleans to strings', () => {
      expect(escapeCsvField(true)).toBe('true');
    });
  });

  describe('initializeCsvFile', () => {
    it('should create a new CSV file with headers when file does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      initializeCsvFile('/tmp/test.csv', ['Col_A', 'Col_B'], mockLogger);

      expect(writeFileSync).toHaveBeenCalledWith(
        '/tmp/test.csv',
        'Col_A,Col_B\n',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Creating new CSV file'),
      );
    });

    it('should not overwrite an existing CSV file', () => {
      vi.mocked(existsSync).mockReturnValue(true);

      initializeCsvFile('/tmp/test.csv', ['Col_A', 'Col_B'], mockLogger);

      expect(writeFileSync).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Using existing CSV file'),
      );
    });

    it('should work with REPO_STATS_COLUMNS', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      initializeCsvFile('/tmp/repo.csv', REPO_STATS_COLUMNS, mockLogger);

      const writtenContent = vi.mocked(writeFileSync).mock.calls[0][1];
      expect(writtenContent).toContain('Org_Name,Repo_Name');
      expect(writtenContent).toContain('Migration_Issue,Created\n');
    });

    it('should work with PROJECT_STATS_COLUMNS', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      initializeCsvFile('/tmp/proj.csv', PROJECT_STATS_COLUMNS, mockLogger);

      expect(writeFileSync).toHaveBeenCalledWith(
        '/tmp/proj.csv',
        'Org_Name,Repo_Name,Issues_Linked_To_Projects,Unique_Projects_Linked_By_Issues,Projects_Linked_To_Repo\n',
      );
    });
  });

  describe('appendCsvRow', () => {
    it('should escape all values and append a row', () => {
      appendCsvRow('/tmp/test.csv', ['org1', 'repo1', 42], mockLogger);

      expect(appendFileSync).toHaveBeenCalledWith(
        '/tmp/test.csv',
        'org1,repo1,42\n',
      );
    });

    it('should escape values containing commas', () => {
      appendCsvRow('/tmp/test.csv', ['org1', 'repo, name', 'desc'], mockLogger);

      expect(appendFileSync).toHaveBeenCalledWith(
        '/tmp/test.csv',
        'org1,"repo, name",desc\n',
      );
    });

    it('should throw and log error on write failure', () => {
      const error = new Error('Write failed');
      vi.mocked(appendFileSync).mockImplementation(() => {
        throw error;
      });

      expect(() => appendCsvRow('/tmp/test.csv', ['val'], mockLogger)).toThrow(
        'Write failed',
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to append CSV row'),
      );
    });
  });

  describe('readCsvFile', () => {
    it('should read and parse a CSV file', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        'Org_Name,Repo_Name\norg1,repo1\norg2,repo2',
      );
      vi.mocked(parse).mockReturnValue([
        { Org_Name: 'org1', Repo_Name: 'repo1' },
        { Org_Name: 'org2', Repo_Name: 'repo2' },
      ]);

      const result = readCsvFile('/tmp/test.csv');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ Org_Name: 'org1', Repo_Name: 'repo1' });
      expect(parse).toHaveBeenCalledWith(expect.any(String), {
        columns: true,
        skip_empty_lines: true,
      });
    });

    it('should throw if file does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      expect(() => readCsvFile('/tmp/missing.csv')).toThrow(
        'CSV file not found: /tmp/missing.csv',
      );
    });
  });

  describe('writeCsvFile', () => {
    it('should write headers and data rows', () => {
      const headers = ['Org_Name', 'Repo_Name', 'Count'];
      const rows = [
        { Org_Name: 'org1', Repo_Name: 'repo1', Count: '5' },
        { Org_Name: 'org2', Repo_Name: 'repo2', Count: '10' },
      ];

      writeCsvFile('/tmp/output.csv', headers, rows);

      expect(writeFileSync).toHaveBeenCalledWith(
        '/tmp/output.csv',
        'Org_Name,Repo_Name,Count\norg1,repo1,5\norg2,repo2,10\n',
      );
    });

    it('should write only headers when there are no rows', () => {
      writeCsvFile('/tmp/output.csv', ['Col_A', 'Col_B'], []);

      expect(writeFileSync).toHaveBeenCalledWith(
        '/tmp/output.csv',
        'Col_A,Col_B\n',
      );
    });

    it('should escape values containing special characters', () => {
      const headers = ['Name', 'Description'];
      const rows = [{ Name: 'test', Description: 'has, commas' }];

      writeCsvFile('/tmp/output.csv', headers, rows);

      expect(writeFileSync).toHaveBeenCalledWith(
        '/tmp/output.csv',
        'Name,Description\ntest,"has, commas"\n',
      );
    });

    it('should fill missing columns with empty string', () => {
      const headers = ['A', 'B', 'C'];
      const rows = [{ A: '1', B: '2' }]; // missing C

      writeCsvFile('/tmp/output.csv', headers, rows);

      expect(writeFileSync).toHaveBeenCalledWith(
        '/tmp/output.csv',
        'A,B,C\n1,2,\n',
      );
    });
  });

  describe('column constants', () => {
    it('should have Org_Name and Repo_Name as first two REPO_STATS_COLUMNS', () => {
      expect(REPO_STATS_COLUMNS[0]).toBe('Org_Name');
      expect(REPO_STATS_COLUMNS[1]).toBe('Repo_Name');
    });

    it('should have Org_Name and Repo_Name as first two PROJECT_STATS_COLUMNS', () => {
      expect(PROJECT_STATS_COLUMNS[0]).toBe('Org_Name');
      expect(PROJECT_STATS_COLUMNS[1]).toBe('Repo_Name');
    });

    it('should have default match columns', () => {
      expect(DEFAULT_MATCH_COLUMNS).toEqual(['Org_Name', 'Repo_Name']);
    });

    it('should have expected repo stats column count', () => {
      expect(REPO_STATS_COLUMNS).toHaveLength(46);
    });

    it('should have expected project stats column count', () => {
      expect(PROJECT_STATS_COLUMNS).toHaveLength(5);
    });
  });
});
