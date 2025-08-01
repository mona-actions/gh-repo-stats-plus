import { describe, it, expect } from 'vitest';
import {
  generateRepoStatsFileName,
  convertKbToMb,
  checkIfHasMigrationIssues,
  formatElapsedTime,
  parseIntOption,
  parseFloatOption,
} from '../src/utils.js';

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
      expect(() => parseIntOption('invalid')).toThrow('Invalid number: invalid');
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
      expect(() => parseFloatOption('invalid')).toThrow('Invalid number: invalid');
      expect(() => parseFloatOption('')).toThrow('Invalid number: ');
      expect(() => parseFloatOption('not-a-number')).toThrow('Invalid number: not-a-number');
    });

    it('should handle edge cases', () => {
      expect(parseFloatOption('  123.45  ')).toBe(123.45); // handles whitespace
      expect(parseFloatOption('123')).toBe(123); // handles integer input
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
});