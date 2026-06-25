import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'fs';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

vi.mock('fs/promises', async () => {
  const actual =
    await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    mkdir: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../src/logger.js', () => ({
  createLogger: vi.fn().mockResolvedValue({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import {
  addMarkdownTitle,
  csvToMarkdownTable,
  csvToVerticalMarkdown,
  generateCsvToMarkdownFileName,
  runCsvToMarkdown,
} from '../src/csv-to-markdown.js';
import { withMockedDate } from './test-utils.js';

describe('csv-to-markdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('csvToMarkdownTable', () => {
    it('renders a standard markdown table for all rows', () => {
      const markdown = csvToMarkdownTable([
        ['type', 'message'],
        ['large_files', 'Found 5 large files'],
        ['git_lfs', 'Has 3 LFS objects'],
      ]);

      expect(markdown).toBe(
        '| type | message |\n' +
          '| --- | --- |\n' +
          '| large_files | Found 5 large files |\n' +
          '| git_lfs | Has 3 LFS objects |',
      );
    });

    it('escapes markdown-sensitive characters in cells', () => {
      const markdown = csvToMarkdownTable([
        ['type', 'message'],
        ['check|warning', 'first line\nsecond line'],
      ]);

      expect(markdown).toContain('check\\|warning');
      expect(markdown).toContain('first line<br>second line');
    });
  });

  describe('csvToVerticalMarkdown', () => {
    it('renders the last CSV row as metric/value markdown', () => {
      const markdown = csvToVerticalMarkdown([
        ['Org_Name', 'Repo_Name', 'Record_Count'],
        ['mona-actions', 'gh-repo-stats-plus', '10'],
        ['mona-actions', 'gh-repo-stats-plus', '25'],
      ]);

      expect(markdown).toBe(
        '| Metric | Value |\n' +
          '| --- | --- |\n' +
          '| Org_Name | mona-actions |\n' +
          '| Repo_Name | gh-repo-stats-plus |\n' +
          '| Record_Count | 25 |',
      );
    });

    it('throws when the CSV does not have a data row', () => {
      expect(() => csvToVerticalMarkdown([['Metric', 'Value']])).toThrow(
        'Vertical markdown format requires at least one data row in the CSV file',
      );
    });
  });

  describe('addMarkdownTitle', () => {
    it('prepends a level-two heading when a title is provided', () => {
      expect(addMarkdownTitle('| A | B |', '📊 Repository Statistics')).toBe(
        '## 📊 Repository Statistics\n\n| A | B |',
      );
    });
  });

  describe('generateCsvToMarkdownFileName', () => {
    it('generates a timestamped markdown file name', () => {
      withMockedDate(new Date('2026-06-25T00:00:00.000Z'), () => {
        expect(generateCsvToMarkdownFileName()).toBe(
          'csv-to-markdown-202606250000_ts.md',
        );
      });
    });
  });

  describe('runCsvToMarkdown', () => {
    it('writes vertical markdown output with a title', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        'Org_Name,Repo_Name,Record_Count\nmona-actions,gh-repo-stats-plus,25\n',
      );

      const outputPath = await runCsvToMarkdown({
        input: '/tmp/stats.csv',
        format: 'vertical',
        title: '📊 Repository Statistics',
        outputDir: 'output',
        outputFileName: 'stats.md',
      });

      expect(outputPath).toMatch(/output\/stats\.md$/);
      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/output\/stats\.md$/),
        '## 📊 Repository Statistics\n\n' +
          '| Metric | Value |\n' +
          '| --- | --- |\n' +
          '| Org_Name | mona-actions |\n' +
          '| Repo_Name | gh-repo-stats-plus |\n' +
          '| Record_Count | 25 |\n',
      );
    });

    it('writes table markdown output for multi-row CSV input', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        'type,message\nlarge_files,Found 5 large files\ngit_lfs,Has 3 LFS objects\n',
      );

      const outputPath = await runCsvToMarkdown({
        input: '/tmp/audit.csv',
        format: 'table',
        title: '🔍 Migration Audit Results',
        outputDir: 'output',
        outputFileName: 'audit.md',
      });

      expect(outputPath).toMatch(/output\/audit\.md$/);
      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/output\/audit\.md$/),
        '## 🔍 Migration Audit Results\n\n' +
          '| type | message |\n' +
          '| --- | --- |\n' +
          '| large_files | Found 5 large files |\n' +
          '| git_lfs | Has 3 LFS objects |\n',
      );
    });

    it('throws when the input CSV file does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      await expect(
        runCsvToMarkdown({
          input: '/tmp/missing.csv',
        }),
      ).rejects.toThrow('CSV file not found: /tmp/missing.csv');
    });
  });
});
