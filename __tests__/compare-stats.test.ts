import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { appendFileSync, existsSync, readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { REPO_STATS_COLUMNS } from '../src/csv.js';
import {
  compareMatchedRepo,
  compareNumericColumn,
  compareRepoStats,
  compareSettingsColumn,
  DEFAULT_SIZE_TOLERANCE_PCT,
  joinRepoStats,
  normalizeBooleanValue,
  normalizeRepoKey,
  parseNumericValue,
} from '../src/compare-stats-core.js';
import {
  readStatsCsv,
  sanitizeSpreadsheetCell,
  validateStatsHeaders,
  writeCompareFinding,
} from '../src/compare-stats-csv.js';
import { resolveComparisonToken } from '../src/compare-stats-git.js';
import { rankWorstOffenders } from '../src/compare-stats-summary.js';
import { runCompareStats } from '../src/compare-stats.js';
import type { MatchedRepo } from '../src/compare-stats-types.js';

const config = { sizeTolerancePct: DEFAULT_SIZE_TOLERANCE_PCT };

function buildRow(overrides: Record<string, string>): Record<string, string> {
  const row: Record<string, string> = {};
  for (const column of REPO_STATS_COLUMNS) {
    row[column] = '0';
  }
  return { ...row, ...overrides };
}

function buildMatchedRepo(
  source: Record<string, string>,
  target: Record<string, string>,
): MatchedRepo {
  return {
    repoName: normalizeRepoKey(source.Repo_Name),
    sourceOrg: source.Org_Name,
    targetOrg: target.Org_Name,
    source,
    target,
  };
}

describe('compare-stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('normalizeRepoKey', () => {
    it('lowercases and trims values', () => {
      expect(normalizeRepoKey('  My-Repo ')).toBe('my-repo');
    });

    it('returns empty string for undefined', () => {
      expect(normalizeRepoKey(undefined)).toBe('');
    });
  });

  describe('normalizeBooleanValue', () => {
    it('normalizes uppercase TRUE/FALSE written by writeResultToCsv', () => {
      expect(normalizeBooleanValue('TRUE')).toBe('true');
      expect(normalizeBooleanValue('FALSE')).toBe('false');
    });

    it('treats blank values as false', () => {
      expect(normalizeBooleanValue('')).toBe('false');
      expect(normalizeBooleanValue(undefined)).toBe('false');
    });

    it('passes through unknown values lowercased', () => {
      expect(normalizeBooleanValue('Maybe')).toBe('maybe');
    });
  });

  describe('parseNumericValue', () => {
    it('parses numbers and defaults non-numeric values to 0', () => {
      expect(parseNumericValue('12')).toBe(12);
      expect(parseNumericValue('')).toBe(0);
      expect(parseNumericValue('n/a')).toBe(0);
    });

    describe('sanitizeSpreadsheetCell', () => {
      it.each([
        [
          '=WEBSERVICE("https://example.test")',
          '\'=WEBSERVICE("https://example.test")',
        ],
        ['+cmd|payload', "'+cmd|payload"],
        ['-cmd|payload', "'-cmd|payload"],
        ['@SUM(A1:A2)', "'@SUM(A1:A2)"],
        ['  =1+1', "'  =1+1"],
        ['\t=1+1', "'\t=1+1"],
        ['\r@SUM(A1:A2)', "'\r@SUM(A1:A2)"],
        ['\u0000=1+1', "'\u0000=1+1"],
      ])('neutralizes spreadsheet formula value %j', (value, expected) => {
        expect(sanitizeSpreadsheetCell(value)).toBe(expected);
      });

      it.each(['-3', '+3', '  -3.5 ', '.25', 'plain text'])(
        'preserves non-formula value %j',
        (value) => {
          expect(sanitizeSpreadsheetCell(value)).toBe(value);
        },
      );
    });
  });

  describe('joinRepoStats', () => {
    it('joins on Repo_Name ignoring case and whitespace', () => {
      const source = [buildRow({ Org_Name: 'src', Repo_Name: ' Repo-A ' })];
      const target = [buildRow({ Org_Name: 'tgt', Repo_Name: 'repo-a' })];

      const result = joinRepoStats(source, target);

      expect(result.matched).toHaveLength(1);
      expect(result.matched[0].repoName).toBe('repo-a');
      expect(result.matched[0].sourceOrg).toBe('src');
      expect(result.matched[0].targetOrg).toBe('tgt');
      expect(result.missingInTarget).toHaveLength(0);
      expect(result.extraInTarget).toHaveLength(0);
    });

    it('does not use Org_Name as part of the join key', () => {
      const source = [buildRow({ Org_Name: 'source-org', Repo_Name: 'repo' })];
      const target = [buildRow({ Org_Name: 'target-org', Repo_Name: 'repo' })];

      expect(joinRepoStats(source, target).matched).toHaveLength(1);
    });

    it('detects repositories missing in target and extra in target', () => {
      const source = [
        buildRow({ Repo_Name: 'repo-a' }),
        buildRow({ Repo_Name: 'repo-missing' }),
      ];
      const target = [
        buildRow({ Repo_Name: 'repo-a' }),
        buildRow({ Repo_Name: 'repo-extra' }),
      ];

      const result = joinRepoStats(source, target);

      expect(result.matched.map((m) => m.repoName)).toEqual(['repo-a']);
      expect(result.missingInTarget[0].Repo_Name).toBe('repo-missing');
      expect(result.extraInTarget[0].Repo_Name).toBe('repo-extra');
    });

    it('skips rows without a repo name', () => {
      const result = joinRepoStats(
        [buildRow({ Repo_Name: '  ' })],
        [buildRow({ Repo_Name: '' })],
      );

      expect(result.matched).toHaveLength(0);
      expect(result.missingInTarget).toHaveLength(0);
      expect(result.extraInTarget).toHaveLength(0);
    });

    it.each(['source', 'target'])(
      'rejects duplicate normalized repo names in the %s rows',
      (side) => {
        const duplicateRows = [
          buildRow({ Repo_Name: ' Repo-A ' }),
          buildRow({ Repo_Name: 'repo-a' }),
        ];

        expect(() =>
          joinRepoStats(
            side === 'source' ? duplicateRows : [],
            side === 'target' ? duplicateRows : [],
          ),
        ).toThrow(
          `Duplicate normalized Repo_Name "repo-a" found in ${side} rows.`,
        );
      },
    );
  });

  describe('compareNumericColumn', () => {
    it('returns null when values match', () => {
      const repo = buildMatchedRepo(
        buildRow({ Repo_Name: 'repo', Issue_Count: '5' }),
        buildRow({ Repo_Name: 'repo', Issue_Count: '5' }),
      );

      expect(
        compareNumericColumn(repo, 'Issue_Count', 'blocking', config),
      ).toBeNull();
    });

    it('reports a signed delta for differing values', () => {
      const repo = buildMatchedRepo(
        buildRow({ Repo_Name: 'repo', Issue_Count: '10' }),
        buildRow({ Repo_Name: 'repo', Issue_Count: '7' }),
      );

      const finding = compareNumericColumn(
        repo,
        'Issue_Count',
        'blocking',
        config,
      );

      expect(finding).toMatchObject({
        Column: 'Issue_Count',
        Source_Value: '10',
        Target_Value: '7',
        Delta: '-3',
        Severity: 'blocking',
        Status: 'matched',
      });
    });

    it('formats positive deltas with a leading plus', () => {
      const repo = buildMatchedRepo(
        buildRow({ Repo_Name: 'repo', PR_Count: '1' }),
        buildRow({ Repo_Name: 'repo', PR_Count: '4' }),
      );

      expect(
        compareNumericColumn(repo, 'PR_Count', 'blocking', config),
      ).toMatchObject({
        Delta: '+3',
        Severity: 'warning',
      });
    });

    it('ignores Repo_Size_mb differences within the configured tolerance', () => {
      const repo = buildMatchedRepo(
        buildRow({ Repo_Name: 'repo', Repo_Size_mb: '100' }),
        buildRow({ Repo_Name: 'repo', Repo_Size_mb: '105' }),
      );

      expect(
        compareNumericColumn(repo, 'Repo_Size_mb', 'info', config),
      ).toBeNull();
    });

    it('reports Repo_Size_mb differences beyond the configured tolerance', () => {
      const repo = buildMatchedRepo(
        buildRow({ Repo_Name: 'repo', Repo_Size_mb: '100' }),
        buildRow({ Repo_Name: 'repo', Repo_Size_mb: '80' }),
      );

      expect(
        compareNumericColumn(repo, 'Repo_Size_mb', 'info', config),
      ).toMatchObject({ Delta: '-20', Severity: 'info' });
    });

    it('honours a custom size tolerance', () => {
      const repo = buildMatchedRepo(
        buildRow({ Repo_Name: 'repo', Repo_Size_mb: '100' }),
        buildRow({ Repo_Name: 'repo', Repo_Size_mb: '105' }),
      );

      expect(
        compareNumericColumn(repo, 'Repo_Size_mb', 'info', {
          sizeTolerancePct: 1,
        }),
      ).not.toBeNull();
    });
  });

  describe('compareSettingsColumn', () => {
    it('treats TRUE and true as equal for boolean columns', () => {
      const repo = buildMatchedRepo(
        buildRow({ Repo_Name: 'repo', Has_Wiki: 'TRUE' }),
        buildRow({ Repo_Name: 'repo', Has_Wiki: 'true' }),
      );

      expect(compareSettingsColumn(repo, 'Has_Wiki')).toBeNull();
    });

    it('treats blank and FALSE as equal for boolean columns', () => {
      const repo = buildMatchedRepo(
        buildRow({ Repo_Name: 'repo', Has_LFS: '' }),
        buildRow({ Repo_Name: 'repo', Has_LFS: 'FALSE' }),
      );

      expect(compareSettingsColumn(repo, 'Has_LFS')).toBeNull();
    });

    it('reports mismatched settings as warnings', () => {
      const repo = buildMatchedRepo(
        buildRow({ Repo_Name: 'repo', Visibility: 'PRIVATE' }),
        buildRow({ Repo_Name: 'repo', Visibility: 'INTERNAL' }),
      );

      expect(compareSettingsColumn(repo, 'Visibility')).toMatchObject({
        Column: 'Visibility',
        Severity: 'warning',
        Delta: '',
      });
    });

    it('treats non-boolean settings as case-sensitive', () => {
      const repo = buildMatchedRepo(
        buildRow({ Repo_Name: 'repo', Default_Branch: 'Main' }),
        buildRow({ Repo_Name: 'repo', Default_Branch: 'main' }),
      );

      expect(compareSettingsColumn(repo, 'Default_Branch')).toMatchObject({
        Column: 'Default_Branch',
        Source_Value: 'Main',
        Target_Value: 'main',
        Severity: 'warning',
      });
    });

    it('trims surrounding whitespace for non-boolean settings', () => {
      const repo = buildMatchedRepo(
        buildRow({ Repo_Name: 'repo', Description: ' description ' }),
        buildRow({ Repo_Name: 'repo', Description: 'description' }),
      );

      expect(compareSettingsColumn(repo, 'Description')).toBeNull();
    });
  });

  describe('compareMatchedRepo', () => {
    it('classifies blocking, info and warning findings', () => {
      const repo = buildMatchedRepo(
        buildRow({
          Repo_Name: 'repo',
          Issue_Count: '10',
          Protected_Branch_Count: '3',
          Visibility: 'PRIVATE',
          Languages: 'TypeScript:90,JavaScript:10',
        }),
        buildRow({
          Repo_Name: 'repo',
          Issue_Count: '9',
          Protected_Branch_Count: '0',
          Visibility: 'INTERNAL',
          Languages: 'TypeScript:100',
        }),
      );

      const findings = compareMatchedRepo(repo, config);
      const bySeverity = Object.fromEntries(
        findings.map((f) => [f.Column, f.Severity]),
      );

      expect(bySeverity.Issue_Count).toBe('blocking');
      expect(bySeverity.Protected_Branch_Count).toBe('info');
      expect(bySeverity.Visibility).toBe('warning');
      expect(bySeverity.Languages).toBe('warning');
    });

    it('excludes columns that always differ', () => {
      const repo = buildMatchedRepo(
        buildRow({
          Repo_Name: 'repo',
          Org_Name: 'source-org',
          Full_URL: 'https://github.com/source-org/repo',
          Created: '2020-01-01',
          Last_Push: '2020-01-02',
          Last_Update: '2020-01-03',
          Migration_Issue: 'TRUE',
        }),
        buildRow({
          Repo_Name: 'repo',
          Org_Name: 'target-org',
          Full_URL: 'https://api.tenant.ghe.com/target-org/repo',
          Created: '2024-01-01',
          Last_Push: '2024-01-02',
          Last_Update: '2024-01-03',
          Migration_Issue: 'FALSE',
        }),
      );

      expect(compareMatchedRepo(repo, config)).toHaveLength(0);
    });
  });

  describe('compareRepoStats', () => {
    it('summarizes matched, missing and extra repositories', () => {
      const source = [
        buildRow({ Org_Name: 'src', Repo_Name: 'repo-a', Issue_Count: '10' }),
        buildRow({ Org_Name: 'src', Repo_Name: 'repo-clean' }),
        buildRow({ Org_Name: 'src', Repo_Name: 'repo-missing' }),
      ];
      const target = [
        buildRow({ Org_Name: 'tgt', Repo_Name: 'repo-a', Issue_Count: '9' }),
        buildRow({ Org_Name: 'tgt', Repo_Name: 'repo-clean' }),
        buildRow({ Org_Name: 'tgt', Repo_Name: 'repo-extra' }),
      ];

      const { findings, summary } = compareRepoStats(source, target, config);

      expect(summary).toMatchObject({
        sourceRepoCount: 3,
        targetRepoCount: 3,
        matchedRepoCount: 2,
        cleanRepoCount: 1,
        reposWithBlockingDiffs: 1,
        missingInTargetCount: 1,
        extraInTargetCount: 1,
      });

      const missing = findings.find((f) => f.Status === 'missing_in_target');
      expect(missing).toMatchObject({
        Repo_Name: 'repo-missing',
        Source_Org: 'src',
        Target_Org: '',
        Severity: 'blocking',
      });

      const extra = findings.find((f) => f.Status === 'extra_in_target');
      expect(extra).toMatchObject({
        Repo_Name: 'repo-extra',
        Source_Org: '',
        Target_Org: 'tgt',
        Severity: 'warning',
      });
    });

    it('excludes blank repository names from summary counts', () => {
      const source = [
        buildRow({ Repo_Name: 'repo-a' }),
        buildRow({ Repo_Name: ' ' }),
      ];
      const target = [
        buildRow({ Repo_Name: 'repo-a' }),
        buildRow({ Repo_Name: '' }),
      ];

      expect(compareRepoStats(source, target, config).summary).toMatchObject({
        sourceRepoCount: 1,
        targetRepoCount: 1,
        matchedRepoCount: 1,
      });
    });
  });

  describe('rankWorstOffenders', () => {
    it('ranks repositories by blocking finding count', () => {
      const findings = [
        { Repo_Name: 'a', Severity: 'blocking' },
        { Repo_Name: 'a', Severity: 'blocking' },
        { Repo_Name: 'b', Severity: 'blocking' },
        { Repo_Name: 'c', Severity: 'warning' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any;

      expect(rankWorstOffenders(findings)).toEqual([
        { repoName: 'a', count: 2 },
        { repoName: 'b', count: 1 },
      ]);
    });

    it('respects the limit', () => {
      const findings = [
        { Repo_Name: 'a', Severity: 'blocking' },
        { Repo_Name: 'b', Severity: 'blocking' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any;

      expect(rankWorstOffenders(findings, 1)).toHaveLength(1);
    });
  });

  describe('validateStatsHeaders', () => {
    it('accepts a full repo-stats header', () => {
      expect(() =>
        validateStatsHeaders([...REPO_STATS_COLUMNS], 'Source'),
      ).not.toThrow();
    });

    it('throws listing every missing column', () => {
      const headers = REPO_STATS_COLUMNS.filter(
        (c) => c !== 'Issue_Count' && c !== 'PR_Count',
      );

      expect(() =>
        validateStatsHeaders(headers, 'Target', '/tmp/t.csv'),
      ).toThrow(
        /Target file is missing required repo-stats column\(s\) \(\/tmp\/t.csv\): Issue_Count, PR_Count/,
      );
    });
  });

  describe('readStatsCsv', () => {
    it('throws when the file is empty', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('' as never);
      vi.mocked(parse).mockReturnValue([]);

      expect(() => readStatsCsv('/tmp/source.csv', 'Source')).toThrow(
        'Source file is empty: /tmp/source.csv',
      );
    });

    describe('writeCompareFinding', () => {
      it('neutralizes untrusted fields before appending the CSV row', () => {
        writeCompareFinding(
          '/tmp/report.csv',
          {
            Repo_Name: '=repo',
            Source_Org: '@source',
            Target_Org: 'target',
            Column: 'Description',
            Source_Value: ' =WEBSERVICE("https://example.test")',
            Target_Value: '-cmd|payload',
            Delta: '-3',
            Severity: 'warning',
            Status: 'matched',
          },
          {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
          },
        );

        expect(appendFileSync).toHaveBeenCalledWith(
          '/tmp/report.csv',
          '\'=repo,\'@source,target,Description,"\' =WEBSERVICE(""https://example.test"")",\'-cmd|payload,-3,warning,matched\n',
        );
      });
    });

    it('maps rows onto the header row', () => {
      const headerRow = [...REPO_STATS_COLUMNS];
      const dataRow = REPO_STATS_COLUMNS.map((column) =>
        column === 'Repo_Name' ? 'repo-a' : '1',
      );

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('csv' as never);
      vi.mocked(parse).mockReturnValue([headerRow, dataRow]);

      const { rows } = readStatsCsv('/tmp/source.csv', 'Source');

      expect(rows).toHaveLength(1);
      expect(rows[0].Repo_Name).toBe('repo-a');
      expect(rows[0].Issue_Count).toBe('1');
    });
  });

  describe('resolveComparisonToken', () => {
    it('prefers the explicit token', () => {
      expect(resolveComparisonToken('explicit', 'source')).toBe('explicit');
    });

    it('falls back to ACCESS_TOKEN', () => {
      vi.stubEnv('ACCESS_TOKEN', 'from-env');
      expect(resolveComparisonToken(undefined, 'target')).toBe('from-env');
      vi.unstubAllEnvs();
    });

    it('falls back to GITHUB_TOKEN', () => {
      vi.stubEnv('ACCESS_TOKEN', '');
      vi.stubEnv('GH_TOKEN', '');
      vi.stubEnv('GITHUB_TOKEN', 'github-token');
      expect(resolveComparisonToken(undefined, 'source')).toBe('github-token');
      vi.unstubAllEnvs();
    });

    it('throws when no token is available', () => {
      vi.stubEnv('ACCESS_TOKEN', '');
      vi.stubEnv('GH_TOKEN', '');
      vi.stubEnv('GITHUB_TOKEN', '');
      expect(() => resolveComparisonToken(undefined, 'source')).toThrow(
        'A source token is required for --verify-git. Provide --source-token or set ACCESS_TOKEN / GH_TOKEN / GITHUB_TOKEN.',
      );
      vi.unstubAllEnvs();
    });
  });

  describe('runCompareStats', () => {
    it('writes a report and returns the summary', async () => {
      const headerRow = [...REPO_STATS_COLUMNS];
      const buildCells = (repoName: string, issueCount: string): string[] =>
        REPO_STATS_COLUMNS.map((column) => {
          if (column === 'Repo_Name') return repoName;
          if (column === 'Issue_Count') return issueCount;
          return '0';
        });

      vi.mocked(existsSync).mockImplementation(
        (path) =>
          String(path).endsWith('source.csv') ||
          String(path).endsWith('target.csv'),
      );
      vi.mocked(readFileSync).mockReturnValue('csv' as never);
      vi.mocked(parse)
        .mockReturnValueOnce([
          headerRow,
          buildCells('repo-a', '10'),
          buildCells('', '0'),
        ])
        .mockReturnValueOnce([
          headerRow,
          buildCells('repo-a', '9'),
          buildCells(' ', '0'),
        ]);

      const result = await runCompareStats({
        sourceFile: '/tmp/source.csv',
        targetFile: '/tmp/target.csv',
        outputDir: '/tmp/out',
        outputFile: 'report.csv',
      });

      expect(result.outputPath).toContain('report.csv');
      expect(result.summary.matchedRepoCount).toBe(1);
      expect(result.summary.sourceRepoCount).toBe(1);
      expect(result.summary.targetRepoCount).toBe(1);
      expect(result.summary.blockingFindingCount).toBeGreaterThan(0);
    });
  });
});
