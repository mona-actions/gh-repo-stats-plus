import { summarizeFindings } from './compare-stats-summary.js';
import type {
  CompareConfig,
  CompareFinding,
  CompareResult,
  CompareSeverity,
  CompareStatus,
  JoinResult,
  MatchedRepo,
} from './compare-stats-types.js';

export const DEFAULT_SIZE_TOLERANCE_PCT = 10;

export const BLOCKING_NUMERIC_COLUMNS = [
  'Issue_Count',
  'PR_Count',
  'Record_Count',
  'Branch_Count',
  'Tag_Count',
  'Release_Count',
  'Issue_Comment_Count',
  'Issue_Event_Count',
  'PR_Review_Count',
  'PR_Review_Comment_Count',
  'Commit_Comment_Count',
  'Milestone_Count',
  'Discussion_Count',
];

export const EXPECTED_TO_DIFFER_NUMERIC_COLUMNS = [
  'Protected_Branch_Count',
  'Ruleset_Count',
  'Collaborator_Count',
  'Project_Count',
  'Star_Count',
  'Fork_Count',
  'Watcher_Count',
  'Repo_Size_mb',
];

export const SETTINGS_COLUMNS = [
  'Default_Branch',
  'Visibility',
  'Has_Wiki',
  'Has_LFS',
  'isArchived',
  'isTemplate',
  'isFork',
  'Is_Empty',
  'Description',
  'Homepage_URL',
  'Topics',
  'License',
  'Primary_Language',
  'Auto_Merge_Allowed',
  'Delete_Branch_On_Merge',
  'Merge_Commit_Allowed',
  'Squash_Merge_Allowed',
  'Rebase_Merge_Allowed',
];

export const EXCLUDED_COLUMNS = [
  'Org_Name',
  'Full_URL',
  'Created',
  'Last_Push',
  'Last_Update',
  'Migration_Issue',
];

export const REPO_LEVEL_COLUMN = 'Repo';

const BOOLEAN_COLUMNS = new Set([
  'Has_Wiki',
  'Has_LFS',
  'isArchived',
  'isTemplate',
  'isFork',
  'Is_Empty',
  'Auto_Merge_Allowed',
  'Delete_Branch_On_Merge',
  'Merge_Commit_Allowed',
  'Squash_Merge_Allowed',
  'Rebase_Merge_Allowed',
]);

export function normalizeRepoKey(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function normalizeBooleanValue(value: string | undefined): string {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'true' || normalized === 'yes' || normalized === '1') {
    return 'true';
  }
  if (
    normalized === 'false' ||
    normalized === 'no' ||
    normalized === '0' ||
    normalized === ''
  ) {
    return 'false';
  }
  return normalized;
}

export function parseNumericValue(value: string | undefined): number {
  const parsed = Number((value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDelta(delta: number): string {
  const rounded = Math.round(delta * 1000) / 1000;
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

export function joinRepoStats(
  sourceRows: Record<string, string>[],
  targetRows: Record<string, string>[],
): JoinResult {
  validateUniqueRepoNames(sourceRows, 'source');
  validateUniqueRepoNames(targetRows, 'target');

  const targetIndex = new Map<string, Record<string, string>>();
  for (const row of targetRows) {
    const key = normalizeRepoKey(row.Repo_Name);
    if (key !== '') {
      targetIndex.set(key, row);
    }
  }

  const matched: MatchedRepo[] = [];
  const missingInTarget: Record<string, string>[] = [];
  const consumed = new Set<string>();

  for (const sourceRow of sourceRows) {
    const key = normalizeRepoKey(sourceRow.Repo_Name);
    if (key === '') {
      continue;
    }

    const targetRow = targetIndex.get(key);
    if (targetRow) {
      matched.push({
        repoName: key,
        sourceOrg: (sourceRow.Org_Name ?? '').trim(),
        targetOrg: (targetRow.Org_Name ?? '').trim(),
        source: sourceRow,
        target: targetRow,
      });
      consumed.add(key);
    } else {
      missingInTarget.push(sourceRow);
    }
  }

  const extraInTarget = targetRows.filter((row) => {
    const key = normalizeRepoKey(row.Repo_Name);
    return key !== '' && !consumed.has(key);
  });

  return { matched, missingInTarget, extraInTarget };
}

function validateUniqueRepoNames(
  rows: Record<string, string>[],
  label: string,
): void {
  const repoNames = new Set<string>();

  for (const row of rows) {
    const key = normalizeRepoKey(row.Repo_Name);
    if (key === '') {
      continue;
    }
    if (repoNames.has(key)) {
      throw new Error(
        `Duplicate normalized Repo_Name "${key}" found in ${label} rows.`,
      );
    }
    repoNames.add(key);
  }
}

export function compareNumericColumn(
  repo: MatchedRepo,
  column: string,
  severity: CompareSeverity,
  config: CompareConfig,
): CompareFinding | null {
  const sourceValue = parseNumericValue(repo.source[column]);
  const targetValue = parseNumericValue(repo.target[column]);
  const delta = targetValue - sourceValue;

  if (delta === 0) {
    return null;
  }

  if (column === 'Repo_Size_mb') {
    const tolerance = Math.abs(sourceValue) * (config.sizeTolerancePct / 100);
    if (Math.abs(delta) <= tolerance) {
      return null;
    }
  }

  return buildFinding(repo, {
    column,
    sourceValue: repo.source[column] ?? '',
    targetValue: repo.target[column] ?? '',
    delta: formatDelta(delta),
    severity: severity === 'blocking' && delta > 0 ? 'warning' : severity,
    status: 'matched',
  });
}

export function compareSettingsColumn(
  repo: MatchedRepo,
  column: string,
): CompareFinding | null {
  const rawSource = repo.source[column] ?? '';
  const rawTarget = repo.target[column] ?? '';

  const normalize = (value: string): string =>
    BOOLEAN_COLUMNS.has(column)
      ? normalizeBooleanValue(value)
      : value.trim().toLowerCase();

  if (normalize(rawSource) === normalize(rawTarget)) {
    return null;
  }

  return buildFinding(repo, {
    column,
    sourceValue: rawSource,
    targetValue: rawTarget,
    delta: '',
    severity: 'warning',
    status: 'matched',
  });
}

function buildFinding(
  repo: MatchedRepo,
  finding: {
    column: string;
    sourceValue: string;
    targetValue: string;
    delta: string;
    severity: CompareSeverity;
    status: CompareStatus;
  },
): CompareFinding {
  return {
    Repo_Name: repo.repoName,
    Source_Org: repo.sourceOrg,
    Target_Org: repo.targetOrg,
    Column: finding.column,
    Source_Value: finding.sourceValue,
    Target_Value: finding.targetValue,
    Delta: finding.delta,
    Severity: finding.severity,
    Status: finding.status,
  };
}

export function compareMatchedRepo(
  repo: MatchedRepo,
  config: CompareConfig,
): CompareFinding[] {
  const findings: CompareFinding[] = [];

  for (const column of BLOCKING_NUMERIC_COLUMNS) {
    const finding = compareNumericColumn(repo, column, 'blocking', config);
    if (finding) {
      findings.push(finding);
    }
  }

  for (const column of EXPECTED_TO_DIFFER_NUMERIC_COLUMNS) {
    const finding = compareNumericColumn(repo, column, 'info', config);
    if (finding) {
      findings.push(finding);
    }
  }

  for (const column of SETTINGS_COLUMNS) {
    const finding = compareSettingsColumn(repo, column);
    if (finding) {
      findings.push(finding);
    }
  }

  return findings;
}

export function compareRepoStats(
  sourceRows: Record<string, string>[],
  targetRows: Record<string, string>[],
  config: CompareConfig = { sizeTolerancePct: DEFAULT_SIZE_TOLERANCE_PCT },
): CompareResult {
  const joinResult = joinRepoStats(sourceRows, targetRows);
  const findings = [...generateRepoStatsFindings(joinResult, config)];

  return {
    findings,
    matched: joinResult.matched,
    summary: summarizeFindings(findings, {
      sourceRepoCount: sourceRows.length,
      targetRepoCount: targetRows.length,
      matchedRepoCount: joinResult.matched.length,
    }),
  };
}

export function* generateRepoStatsFindings(
  joinResult: JoinResult,
  config: CompareConfig,
): Generator<CompareFinding, void, unknown> {
  for (const repo of joinResult.matched) {
    yield* compareMatchedRepo(repo, config);
  }

  for (const row of joinResult.missingInTarget) {
    yield {
      Repo_Name: normalizeRepoKey(row.Repo_Name),
      Source_Org: (row.Org_Name ?? '').trim(),
      Target_Org: '',
      Column: REPO_LEVEL_COLUMN,
      Source_Value: 'present',
      Target_Value: 'absent',
      Delta: '',
      Severity: 'blocking',
      Status: 'missing_in_target',
    };
  }

  for (const row of joinResult.extraInTarget) {
    yield {
      Repo_Name: normalizeRepoKey(row.Repo_Name),
      Source_Org: '',
      Target_Org: (row.Org_Name ?? '').trim(),
      Column: REPO_LEVEL_COLUMN,
      Source_Value: 'absent',
      Target_Value: 'present',
      Delta: '',
      Severity: 'warning',
      Status: 'extra_in_target',
    };
  }
}
