import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateRepoStatsFileName,
  convertKbToMb,
  checkIfHasMigrationIssues,
  formatElapsedTime,
  parseIntOption,
  parseFloatOption,
  parseBooleanOption,
  parseCommaSeparatedOption,
  parseNewlineSeparatedOption,
  parseFileAsNewlineSeparatedOption,
} from '../src/utils.js';
import { existsSync, readFileSync } from 'fs';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

describe('Utils', () => {
  describe('generateRepoStatsFileName', () => {
    it('should generate a filename with the org name and current date', () => {
      const orgName = 'testorg';
      const filename = generateRepoStatsFileName(orgName);

      // Test that the filename follows the expected pattern
      expect(filename).toMatch(/^testorg-all_repos-\d{12}_ts\.csv$/);
    });

    it('should convert org name to lowercase', () => {
      const orgName = 'TESTORG';
      const filename = generateRepoStatsFileName(orgName);

      expect(filename).toMatch(/^testorg-all_repos-\d{12}_ts\.csv$/);
    });
  });

  describe('convertKbToMb', () => {
    it.each([
      { input: 1024, expected: 1, description: '1024 KB to 1 MB' },
      { input: 2048, expected: 2, description: '2048 KB to 2 MB' },
      { input: 512, expected: 0.5, description: '512 KB to 0.5 MB' },
      { input: 0, expected: 0, description: '0 KB to 0 MB' },
      { input: null, expected: 0, description: 'null to 0 MB' },
      { input: undefined, expected: 0, description: 'undefined to 0 MB' },
    ])('should convert $description', ({ input, expected }) => {
      expect(convertKbToMb(input)).toBe(expected);
    });
  });

  describe('checkIfHasMigrationIssues', () => {
    it.each([
      {
        repoSizeMb: 1501,
        totalRecordCount: 100,
        expected: true,
        description: 'very large repository (>1500MB)',
      },
      {
        repoSizeMb: 100,
        totalRecordCount: 60001,
        expected: true,
        description: 'repository with extremely high record count (>60000)',
      },
      {
        repoSizeMb: 1500,
        totalRecordCount: 59999,
        expected: false,
        description: 'repository at the threshold limits',
      },
      {
        repoSizeMb: 100,
        totalRecordCount: 100,
        expected: false,
        description: 'small repository',
      },
      {
        repoSizeMb: 0,
        totalRecordCount: 0,
        expected: false,
        description: 'empty repository',
      },
    ])(
      'should return $expected for $description',
      ({ repoSizeMb, totalRecordCount, expected }) => {
        expect(
          checkIfHasMigrationIssues({ repoSizeMb, totalRecordCount }),
        ).toBe(expected);
      },
    );
  });

  describe('parseIntOption', () => {
    it('should parse valid integers', () => {
      expect(parseIntOption('123')).toBe(123);
      expect(parseIntOption('0')).toBe(0);
      expect(parseIntOption('-456')).toBe(-456);
    });

    it('should return default value for invalid input when provided', () => {
      expect(parseIntOption('invalid', 100)).toBe(100);
      expect(parseIntOption('', 50)).toBe(50);
      expect(parseIntOption('not-a-number', 0)).toBe(0);
    });

    it('should throw error for invalid input when no default provided', () => {
      expect(() => parseIntOption('invalid')).toThrow(
        'Invalid number: invalid',
      );
      expect(() => parseIntOption('')).toThrow('Invalid number: ');
    });

    it('should handle edge cases', () => {
      expect(parseIntOption('12.34')).toBe(12); // parseInt truncates
      expect(parseIntOption('  123  ')).toBe(123); // handles whitespace
    });
  });

  describe('parseFloatOption', () => {
    it('should parse valid floats', () => {
      expect(parseFloatOption('123.45')).toBe(123.45);
      expect(parseFloatOption('0')).toBe(0);
      expect(parseFloatOption('-456.78')).toBe(-456.78);
      expect(parseFloatOption('0.5')).toBe(0.5);
    });

    it('should return default value for invalid input when provided', () => {
      expect(parseFloatOption('invalid', 100.5)).toBe(100.5);
      expect(parseFloatOption('', 50.25)).toBe(50.25);
      expect(parseFloatOption('not-a-number', 0.0)).toBe(0.0);
    });

    it('should throw error for invalid input when no default provided', () => {
      expect(() => parseFloatOption('invalid')).toThrow(
        'Invalid number: invalid',
      );
      expect(() => parseFloatOption('')).toThrow('Invalid number: ');
      expect(() => parseFloatOption('not-a-number')).toThrow(
        'Invalid number: not-a-number',
      );
    });

    it('should handle edge cases', () => {
      expect(parseFloatOption('  123.45  ')).toBe(123.45); // handles whitespace
      expect(parseFloatOption('123')).toBe(123); // handles integer input
    });
  });

  describe('parseBooleanOption', () => {
    it('should parse "true" values correctly', () => {
      expect(parseBooleanOption('true')).toBe(true);
      expect(parseBooleanOption('TRUE')).toBe(true);
      expect(parseBooleanOption('True')).toBe(true);
      expect(parseBooleanOption('1')).toBe(true);
      expect(parseBooleanOption('yes')).toBe(true);
      expect(parseBooleanOption('YES')).toBe(true);
    });

    it('should parse "false" values correctly', () => {
      expect(parseBooleanOption('false')).toBe(false);
      expect(parseBooleanOption('FALSE')).toBe(false);
      expect(parseBooleanOption('False')).toBe(false);
      expect(parseBooleanOption('0')).toBe(false);
      expect(parseBooleanOption('no')).toBe(false);
      expect(parseBooleanOption('NO')).toBe(false);
    });

    it('should handle whitespace', () => {
      expect(parseBooleanOption('  true  ')).toBe(true);
      expect(parseBooleanOption('  false  ')).toBe(false);
      expect(parseBooleanOption('  1  ')).toBe(true);
      expect(parseBooleanOption('  0  ')).toBe(false);
    });

    it('should handle undefined and empty values', () => {
      expect(parseBooleanOption(undefined)).toBe(false);
      expect(parseBooleanOption('')).toBe(false);
    });

    it('should throw error for invalid values', () => {
      expect(() => parseBooleanOption('invalid')).toThrow(
        'Invalid boolean value: invalid',
      );
      expect(() => parseBooleanOption('maybe')).toThrow(
        'Invalid boolean value: maybe',
      );
      expect(() => parseBooleanOption('2')).toThrow('Invalid boolean value: 2');
    });
  });

  describe('formatElapsedTime', () => {
    it('should format elapsed time correctly', () => {
      const start = new Date('2023-01-01T00:00:00Z');
      const end = new Date('2023-01-01T00:01:30Z'); // 1 minute 30 seconds later

      const formattedTime = formatElapsedTime(start, end);
      expect(formattedTime).toBe('0h 1m 30s');
    });

    it('should format hours correctly', () => {
      const start = new Date('2023-01-01T00:00:00Z');
      const end = new Date('2023-01-01T02:15:45Z'); // 2 hours 15 minutes 45 seconds later

      const formattedTime = formatElapsedTime(start, end);
      expect(formattedTime).toBe('2h 15m 45s');
    });

    it('should handle zero elapsed time', () => {
      const start = new Date('2023-01-01T00:00:00Z');
      const end = new Date('2023-01-01T00:00:00Z');

      const formattedTime = formatElapsedTime(start, end);
      expect(formattedTime).toBe('0h 0m 0s');
    });

    it('should handle large time differences', () => {
      const start = new Date('2023-01-01T00:00:00Z');
      const end = new Date('2023-01-02T01:30:15Z'); // 25 hours 30 minutes 15 seconds later

      const formattedTime = formatElapsedTime(start, end);
      expect(formattedTime).toBe('25h 30m 15s');
    });
  });

  describe('parseCommaSeparatedOption', () => {
    it('should parse comma-separated values into an array', () => {
      expect(parseCommaSeparatedOption('foo,bar,baz')).toEqual([
        'foo',
        'bar',
        'baz',
      ]);
      expect(parseCommaSeparatedOption('a, b, c')).toEqual(['a', 'b', 'c']);
    });

    it('should trim whitespace from values', () => {
      expect(parseCommaSeparatedOption('  foo  ,  bar  ,  baz  ')).toEqual([
        'foo',
        'bar',
        'baz',
      ]);
      expect(parseCommaSeparatedOption('item1 , item2')).toEqual([
        'item1',
        'item2',
      ]);
    });

    it('should handle single value', () => {
      expect(parseCommaSeparatedOption('single')).toEqual(['single']);
    });

    it('should return empty array for empty or undefined input', () => {
      expect(parseCommaSeparatedOption('')).toEqual([]);
      expect(parseCommaSeparatedOption(undefined as unknown as string)).toEqual(
        [],
      );
      expect(parseCommaSeparatedOption(null as unknown as string)).toEqual([]);
    });

    it('should filter out empty values', () => {
      expect(parseCommaSeparatedOption('foo,,bar')).toEqual(['foo', 'bar']);
      expect(parseCommaSeparatedOption(',foo,bar,')).toEqual(['foo', 'bar']);
      expect(parseCommaSeparatedOption('a, , b, , c')).toEqual(['a', 'b', 'c']);
    });

    it('should support Commander.js accumulator pattern with previous values', () => {
      // Simulates: --repos repo1,repo2 --repos repo3
      expect(parseCommaSeparatedOption('repo3', ['repo1', 'repo2'])).toEqual([
        'repo1',
        'repo2',
        'repo3',
      ]);
      expect(parseCommaSeparatedOption('d,e', ['a', 'b', 'c'])).toEqual([
        'a',
        'b',
        'c',
        'd',
        'e',
      ]);
    });

    it('should return previous values when value is empty', () => {
      expect(parseCommaSeparatedOption('', ['existing', 'values'])).toEqual([
        'existing',
        'values',
      ]);
    });

    it('should handle previous as undefined', () => {
      expect(parseCommaSeparatedOption('foo,bar', undefined)).toEqual([
        'foo',
        'bar',
      ]);
    });
  });

  describe('parseNewlineSeparatedOption', () => {
    it('should parse newline-separated values into an array', () => {
      expect(parseNewlineSeparatedOption('foo\nbar\nbaz')).toEqual([
        'foo',
        'bar',
        'baz',
      ]);
      expect(parseNewlineSeparatedOption('a\nb\nc')).toEqual(['a', 'b', 'c']);
    });

    it('should handle Windows line endings (CRLF)', () => {
      expect(parseNewlineSeparatedOption('foo\r\nbar\r\nbaz')).toEqual([
        'foo',
        'bar',
        'baz',
      ]);
    });

    it('should handle mixed line endings', () => {
      expect(parseNewlineSeparatedOption('foo\nbar\r\nbaz')).toEqual([
        'foo',
        'bar',
        'baz',
      ]);
    });

    it('should trim whitespace from values', () => {
      expect(parseNewlineSeparatedOption('  foo  \n  bar  \n  baz  ')).toEqual([
        'foo',
        'bar',
        'baz',
      ]);
    });

    it('should handle single value', () => {
      expect(parseNewlineSeparatedOption('single')).toEqual(['single']);
    });

    it('should return empty array for empty or undefined input', () => {
      expect(parseNewlineSeparatedOption('')).toEqual([]);
      expect(
        parseNewlineSeparatedOption(undefined as unknown as string),
      ).toEqual([]);
      expect(parseNewlineSeparatedOption(null as unknown as string)).toEqual(
        [],
      );
    });

    it('should filter out empty lines', () => {
      expect(parseNewlineSeparatedOption('foo\n\nbar')).toEqual(['foo', 'bar']);
      expect(parseNewlineSeparatedOption('\nfoo\nbar\n')).toEqual([
        'foo',
        'bar',
      ]);
      expect(parseNewlineSeparatedOption('a\n\nb\n\nc')).toEqual([
        'a',
        'b',
        'c',
      ]);
    });

    it('should filter out comment lines starting with #', () => {
      expect(
        parseNewlineSeparatedOption('foo\n# this is a comment\nbar'),
      ).toEqual(['foo', 'bar']);
      expect(
        parseNewlineSeparatedOption('# comment at start\nfoo\nbar'),
      ).toEqual(['foo', 'bar']);
      expect(parseNewlineSeparatedOption('foo\nbar\n# comment at end')).toEqual(
        ['foo', 'bar'],
      );
    });

    it('should support Commander.js accumulator pattern with previous values', () => {
      expect(parseNewlineSeparatedOption('org3', ['org1', 'org2'])).toEqual([
        'org1',
        'org2',
        'org3',
      ]);
      expect(parseNewlineSeparatedOption('d\ne', ['a', 'b', 'c'])).toEqual([
        'a',
        'b',
        'c',
        'd',
        'e',
      ]);
    });

    it('should return previous values when value is empty', () => {
      expect(parseNewlineSeparatedOption('', ['existing', 'values'])).toEqual([
        'existing',
        'values',
      ]);
    });

    it('should handle previous as undefined', () => {
      expect(parseNewlineSeparatedOption('foo\nbar', undefined)).toEqual([
        'foo',
        'bar',
      ]);
    });
  });

  describe('parseFileAsNewlineSeparatedOption', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should read file and parse newline-separated values', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('org1\norg2\norg3');

      expect(parseFileAsNewlineSeparatedOption('orgs.txt')).toEqual([
        'org1',
        'org2',
        'org3',
      ]);
    });

    it('should filter comments and empty lines from file', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('org1\n# comment\n\norg2');

      expect(parseFileAsNewlineSeparatedOption('orgs.txt')).toEqual([
        'org1',
        'org2',
      ]);
    });

    it('should throw error if file does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      expect(() =>
        parseFileAsNewlineSeparatedOption('nonexistent.txt'),
      ).toThrow('File not found: nonexistent.txt');
    });

    it('should return empty array for empty filePath', () => {
      expect(parseFileAsNewlineSeparatedOption('')).toEqual([]);
    });

    it('should return previous values for empty filePath', () => {
      expect(parseFileAsNewlineSeparatedOption('', ['existing'])).toEqual([
        'existing',
      ]);
    });

    it('should support accumulator pattern with previous values', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('org3\norg4');

      expect(
        parseFileAsNewlineSeparatedOption('orgs.txt', ['org1', 'org2']),
      ).toEqual(['org1', 'org2', 'org3', 'org4']);
    });
  });
});
