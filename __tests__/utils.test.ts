import { describe, it, expect } from 'vitest';
import {
  generateRepoStatsFileName,
  convertKbToMb,
  checkIfHasMigrationIssues,
  formatElapsedTime,
} from '../src/utils.js';

describe('Utils', () => {
  describe('generateRepoStatsFileName', () => {
    it('should generate a filename with the org name and current date', () => {
      const orgName = 'testorg';
      const filename = generateRepoStatsFileName(orgName);

      // Test that the filename follows the expected pattern
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

  describe('formatElapsedTime', () => {
    it('should format elapsed time correctly', () => {
      const start = new Date('2023-01-01T00:00:00Z');
      const end = new Date('2023-01-01T00:01:30Z'); // 1 minute 30 seconds later

      const formattedTime = formatElapsedTime(start, end);
      expect(formattedTime).toBe('0h 1m 30s');
    });
  });
});
