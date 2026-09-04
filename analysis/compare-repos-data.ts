import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'csv-parse/sync';

const AUDIT_HEADERS = [
  'repo_name',
  'source_org',
  'source_url',
  'target_org',
  'migration_status',
  'target_url',
  'created_at_in_target',
  'locked_in_source',
] as const;

const MAPPING_HEADERS = [
  'repo_name',
  'source_org',
  'target_org',
  'source_url',
  'target_url',
  'migration_issue',
  'locked_in_source',
  'created_at_in_target',
] as const;

const FAILURE_HEADERS = [...MAPPING_HEADERS, 'reason'] as const;

const COMPARE_HEADERS = [
  'Repo_Name',
  'Source_Org',
  'Target_Org',
  'Column',
  'Source_Value',
  'Target_Value',
  'Delta',
  'Severity',
  'Status',
] as const;

const OUTCOME_HEADERS = [
  'repo_name',
  'source_org',
  'target_org',
  'locked_in_source',
  'created_at_in_target',
  'outcome',
  'highest_severity',
  'finding_count',
  'blocking_count',
  'warning_count',
  'info_count',
  'raw_diff_file',
  'reason',
] as const;

const RECOMMENDATION_HEADERS = [
  'repo_name',
  'source_org',
  'target_org',
  'original_outcome',
  'content_recommendation',
  'operational_recommendation',
  'fidelity_recommendation',
  'locked_in_source',
  'created_at_in_target',
  'finding_count',
  'blocking_count',
  'warning_count',
  'info_count',
  'negative_content_columns',
  'git_blocking_columns',
  'warning_columns',
  'recommendation_reason',
] as const;

const MIGRATION_COUNT_COLUMNS = new Set([
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
]);

type CsvRow = Record<string, string>;

export interface MappingRow extends CsvRow {
  repo_name: string;
  source_org: string;
  target_org: string;
  source_url: string;
  target_url: string;
  migration_issue: string;
  locked_in_source: string;
  created_at_in_target: string;
}

interface PrepareOptions {
  audit: string;
  runDir: string;
  status: string;
  sourceOrg: string;
  sourceHost: string;
  sourceApiUrl: string;
  targetOrg: string;
  targetHost: string;
  targetApiUrl: string;
  sizeTolerancePct: string;
  chunkSize: number;
  force: boolean;
}

interface PreparationSummary {
  selected: number;
  valid: number;
  missingTarget: number;
  invalid: number;
  unlockedSource: number;
  chunks: number;
}

interface OutcomeRow extends CsvRow {
  repo_name: string;
  source_org: string;
  target_org: string;
  locked_in_source: string;
  created_at_in_target: string;
  outcome: string;
  highest_severity: string;
  finding_count: string;
  blocking_count: string;
  warning_count: string;
  info_count: string;
  raw_diff_file: string;
  reason: string;
}

interface RecommendationRow extends CsvRow {
  repo_name: string;
  source_org: string;
  target_org: string;
  original_outcome: string;
  content_recommendation: string;
  operational_recommendation: string;
  fidelity_recommendation: string;
  locked_in_source: string;
  created_at_in_target: string;
  finding_count: string;
  blocking_count: string;
  warning_count: string;
  info_count: string;
  negative_content_columns: string;
  git_blocking_columns: string;
  warning_columns: string;
  recommendation_reason: string;
}

function parseArgs(args: string[]): Map<string, string | boolean> {
  const parsed = new Map<string, string | boolean>();
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (!argument.startsWith('--')) {
      throw new Error(`Unexpected argument: ${argument}`);
    }
    if (argument === '--force') {
      parsed.set(argument, true);
      continue;
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for ${argument}`);
    }
    parsed.set(argument, value);
    index++;
  }
  return parsed;
}

function requiredArg(
  args: Map<string, string | boolean>,
  name: string,
): string {
  const value = args.get(name);
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function readCsv(path: string): { headers: string[]; rows: CsvRow[] } {
  if (!existsSync(path)) {
    throw new Error(`CSV file not found: ${path}`);
  }
  const content = readFileSync(path, 'utf8');
  const matrix = parse(content, {
    bom: true,
    relax_column_count: false,
    skip_empty_lines: true,
  }) as string[][];
  if (matrix.length === 0) {
    throw new Error(`CSV file is empty: ${path}`);
  }

  const headers = matrix[0].map((header) => header.trim());
  const rows = matrix
    .slice(1)
    .map((cells) =>
      Object.fromEntries(
        headers.map((header, index) => [header, cells[index] ?? '']),
      ),
    );
  return { headers, rows };
}

function validateHeaders(
  headers: string[],
  required: readonly string[],
  label: string,
): void {
  const present = new Set(headers);
  const missing = required.filter((header) => !present.has(header));
  if (missing.length > 0) {
    throw new Error(
      `${label} is missing required columns: ${missing.join(', ')}`,
    );
  }
}

function escapeCsv(value: string): string {
  const safeValue =
    /^[=+\-@]/.test(value.trim()) && !/^[+-]?\d+(?:\.\d+)?$/.test(value.trim())
      ? `'${value}`
      : value;
  return /[",\r\n]/.test(safeValue)
    ? `"${safeValue.replace(/"/g, '""')}"`
    : safeValue;
}

function serializeCsv(
  headers: readonly string[],
  rows: CsvRow[],
  protectSpreadsheet = true,
): string {
  const escape = protectSpreadsheet
    ? escapeCsv
    : (value: string) =>
        /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  return (
    [
      headers.map(escape).join(','),
      ...rows.map((row) =>
        headers.map((header) => escape(row[header] ?? '')).join(','),
      ),
    ].join('\n') + '\n'
  );
}

function writeCsv(
  path: string,
  headers: readonly string[],
  rows: CsvRow[],
  protectSpreadsheet = true,
): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeCsv(headers, rows, protectSpreadsheet));
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeRepoKey(value: string): string {
  const trimmed = value.trim();
  const rawValue = /^'[=+\-@]/.test(trimmed) ? trimmed.slice(1) : trimmed;
  return normalize(rawValue);
}

function mappingFromAudit(row: CsvRow): MappingRow {
  return {
    repo_name: row.repo_name.trim(),
    source_org: row.source_org.trim(),
    target_org: row.target_org.trim(),
    source_url: row.source_url.trim(),
    target_url: row.target_url.trim(),
    migration_issue: row.migration_issue?.trim() ?? '',
    locked_in_source: row.locked_in_source.trim(),
    created_at_in_target: row.created_at_in_target.trim(),
  };
}

function mappingFailure(row: MappingRow, reason: string): CsvRow {
  return { ...row, reason };
}

function validateUrl(
  rawUrl: string,
  expectedHost: string,
  expectedOrg: string,
  expectedRepo: string,
): string | undefined {
  try {
    const url = new URL(rawUrl);
    const segments = url.pathname.split('/').filter(Boolean);
    if (normalize(url.hostname) !== normalize(expectedHost)) {
      return `URL host ${url.hostname} does not match ${expectedHost}`;
    }
    if (normalize(segments[0] ?? '') !== normalize(expectedOrg)) {
      return `URL organization ${segments[0] ?? ''} does not match ${expectedOrg}`;
    }
    if (normalize(segments[1] ?? '') !== normalize(expectedRepo)) {
      return `URL repository ${segments[1] ?? ''} does not match ${expectedRepo}`;
    }
    return undefined;
  } catch {
    return `Invalid URL: ${rawUrl}`;
  }
}

function validateMapping(
  mapping: MappingRow,
  options: PrepareOptions,
): string | undefined {
  if (!mapping.repo_name || mapping.repo_name.includes('/')) {
    return 'Repository name is empty or contains a slash';
  }
  if (normalize(mapping.source_org) !== normalize(options.sourceOrg)) {
    return `Source organization ${mapping.source_org} does not match ${options.sourceOrg}`;
  }
  if (normalize(mapping.target_org) !== normalize(options.targetOrg)) {
    return `Target organization ${mapping.target_org} does not match ${options.targetOrg}`;
  }

  return (
    validateUrl(
      mapping.source_url,
      options.sourceHost,
      options.sourceOrg,
      mapping.repo_name,
    ) ??
    validateUrl(
      mapping.target_url,
      options.targetHost,
      options.targetOrg,
      mapping.repo_name,
    )
  );
}

export function prepareAudit(options: PrepareOptions): PreparationSummary {
  if (!Number.isInteger(options.chunkSize) || options.chunkSize <= 0) {
    throw new Error('Chunk size must be a positive integer');
  }
  const { headers, rows } = readCsv(options.audit);
  validateHeaders(headers, AUDIT_HEADERS, 'Audit CSV');

  const selectedRows = rows.filter(
    (row) => row.migration_status.trim() === options.status,
  );
  const duplicateCounts = new Map<string, number>();
  for (const row of selectedRows) {
    const key = `${normalize(row.source_org)}/${normalizeRepoKey(row.repo_name)}`;
    duplicateCounts.set(key, (duplicateCounts.get(key) ?? 0) + 1);
  }

  const valid: MappingRow[] = [];
  const missingTarget: CsvRow[] = [];
  const invalid: CsvRow[] = [];

  for (const row of selectedRows) {
    const mapping = mappingFromAudit(row);
    const key = `${normalize(mapping.source_org)}/${normalizeRepoKey(
      mapping.repo_name,
    )}`;
    if (
      !mapping.target_org ||
      normalize(mapping.target_org) === 'none' ||
      !mapping.target_url
    ) {
      missingTarget.push(mappingFailure(mapping, 'No usable target mapping'));
      continue;
    }
    if ((duplicateCounts.get(key) ?? 0) > 1) {
      invalid.push(
        mappingFailure(mapping, 'Duplicate normalized source repository'),
      );
      continue;
    }
    const reason = validateMapping(mapping, options);
    if (reason) {
      invalid.push(mappingFailure(mapping, reason));
      continue;
    }
    valid.push(mapping);
  }

  valid.sort((left, right) =>
    normalizeRepoKey(left.repo_name).localeCompare(
      normalizeRepoKey(right.repo_name),
    ),
  );

  const snapshotPath = join(options.runDir, 'selection.csv');
  const snapshot = serializeCsv(MAPPING_HEADERS, valid, false);
  const configPath = join(options.runDir, 'selection-config.json');
  const config = `${JSON.stringify(
    {
      status: options.status,
      sourceOrg: options.sourceOrg,
      sourceHost: options.sourceHost,
      sourceApiUrl: options.sourceApiUrl,
      targetOrg: options.targetOrg,
      targetHost: options.targetHost,
      targetApiUrl: options.targetApiUrl,
      sizeTolerancePct: options.sizeTolerancePct,
      chunkSize: options.chunkSize,
    },
    null,
    2,
  )}\n`;
  if (
    ((existsSync(snapshotPath) &&
      readFileSync(snapshotPath, 'utf8') !== snapshot) ||
      (existsSync(configPath) && readFileSync(configPath, 'utf8') !== config) ||
      existsSync(snapshotPath) !== existsSync(configPath)) &&
    !options.force
  ) {
    throw new Error(
      'Audit selection or comparison configuration changed since the previous run. Use --force-fresh.',
    );
  }

  mkdirSync(join(options.runDir, 'chunks'), { recursive: true });
  writeFileSync(snapshotPath, snapshot);
  writeFileSync(configPath, config);
  writeCsv(
    join(options.runDir, 'skipped-missing-target.csv'),
    FAILURE_HEADERS,
    missingTarget,
  );
  writeCsv(
    join(options.runDir, 'audit-validation-failures.csv'),
    FAILURE_HEADERS,
    invalid,
  );

  const chunkCount = Math.ceil(valid.length / options.chunkSize);
  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
    const chunkName = `chunk-${chunkIndex.toString().padStart(3, '0')}`;
    const chunkDir = join(options.runDir, 'chunks', chunkName);
    const mappings = valid.slice(
      chunkIndex * options.chunkSize,
      (chunkIndex + 1) * options.chunkSize,
    );
    mkdirSync(chunkDir, { recursive: true });
    writeCsv(join(chunkDir, 'mapping.csv'), MAPPING_HEADERS, mappings, false);
    writeFileSync(
      join(chunkDir, 'source-repos.txt'),
      mappings.map((row) => `${row.source_org}/${row.repo_name}`).join('\n') +
        '\n',
    );
    writeFileSync(
      join(chunkDir, 'target-repos.txt'),
      mappings.map((row) => `${row.target_org}/${row.repo_name}`).join('\n') +
        '\n',
    );
  }

  const summary: PreparationSummary = {
    selected: selectedRows.length,
    valid: valid.length,
    missingTarget: missingTarget.length,
    invalid: invalid.length,
    unlockedSource: selectedRows.filter(
      (row) => normalize(row.locked_in_source) !== 'true',
    ).length,
    chunks: chunkCount,
  };
  writeFileSync(
    join(options.runDir, 'preparation-summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  writeFileSync(join(options.runDir, 'chunk-count.txt'), `${chunkCount}\n`);
  return summary;
}

function indexStatsRows(
  rows: CsvRow[],
  expectedOrg: string,
  label: string,
): Map<string, CsvRow> {
  const indexed = new Map<string, CsvRow>();
  for (const row of rows) {
    if (normalize(row.Org_Name) !== normalize(expectedOrg)) {
      throw new Error(
        `${label} row organization ${row.Org_Name} does not match ${expectedOrg}`,
      );
    }
    const key = normalizeRepoKey(row.Repo_Name);
    if (!key) {
      throw new Error(`${label} contains a blank Repo_Name`);
    }
    if (indexed.has(key)) {
      throw new Error(
        `${label} contains duplicate repository ${row.Repo_Name}`,
      );
    }
    indexed.set(key, row);
  }
  return indexed;
}

export function reconcileChunk(
  chunkDir: string,
  sourceStatsPath: string,
  targetStatsPath: string,
): number {
  const mappingsCsv = readCsv(join(chunkDir, 'mapping.csv'));
  validateHeaders(mappingsCsv.headers, MAPPING_HEADERS, 'Chunk mapping');
  const mappings = mappingsCsv.rows as MappingRow[];
  const sourceCsv = readCsv(sourceStatsPath);
  const targetCsv = readCsv(targetStatsPath);
  validateHeaders(sourceCsv.headers, ['Org_Name', 'Repo_Name'], 'Source stats');
  validateHeaders(targetCsv.headers, ['Org_Name', 'Repo_Name'], 'Target stats');

  const sourceOrg = mappings[0]?.source_org ?? '';
  const targetOrg = mappings[0]?.target_org ?? '';
  const sourceRows = indexStatsRows(sourceCsv.rows, sourceOrg, 'Source stats');
  const targetRows = indexStatsRows(targetCsv.rows, targetOrg, 'Target stats');
  const comparableSource: CsvRow[] = [];
  const comparableTarget: CsvRow[] = [];
  const failures: CsvRow[] = [];

  for (const mapping of mappings) {
    const key = normalizeRepoKey(mapping.repo_name);
    const source = sourceRows.get(key);
    const target = targetRows.get(key);
    if (!source) {
      failures.push(mappingFailure(mapping, 'source-collection-failed'));
    }
    if (!target) {
      failures.push(mappingFailure(mapping, 'target-collection-failed'));
    }
    if (source && target) {
      comparableSource.push(source);
      comparableTarget.push(target);
    }
  }

  writeCsv(
    join(chunkDir, 'source', 'comparable-stats.csv'),
    sourceCsv.headers,
    comparableSource,
    false,
  );
  writeCsv(
    join(chunkDir, 'target', 'comparable-stats.csv'),
    targetCsv.headers,
    comparableTarget,
    false,
  );
  writeCsv(
    join(chunkDir, 'collection-failures.csv'),
    FAILURE_HEADERS,
    failures,
    false,
  );
  writeFileSync(
    join(chunkDir, 'comparable-count.txt'),
    `${comparableSource.length}\n`,
  );
  return comparableSource.length;
}

export function validateDiff(path: string): void {
  const { headers } = readCsv(path);
  validateHeaders(headers, COMPARE_HEADERS, 'Comparison diff');
}

function findingCounts(rows: CsvRow[]): {
  blocking: number;
  warning: number;
  info: number;
} {
  return {
    blocking: rows.filter((row) => row.Severity === 'blocking').length,
    warning: rows.filter((row) => row.Severity === 'warning').length,
    info: rows.filter((row) => row.Severity === 'info').length,
  };
}

function outcomeFromFindings(
  mapping: MappingRow,
  findings: CsvRow[],
  diffPath: string,
): OutcomeRow {
  const counts = findingCounts(findings);
  let outcome = 'clean';
  let highestSeverity = '';
  if (findings.some((row) => row.Status === 'missing_in_target')) {
    outcome = 'missing-in-target';
    highestSeverity = 'blocking';
  } else if (findings.some((row) => row.Status === 'extra_in_target')) {
    outcome = 'extra-in-target';
    highestSeverity = 'warning';
  } else if (counts.blocking > 0) {
    outcome = 'blocking';
    highestSeverity = 'blocking';
  } else if (findings.length > 0) {
    outcome = 'warning-only';
    highestSeverity = counts.warning > 0 ? 'warning' : 'info';
  }

  return {
    repo_name: mapping.repo_name,
    source_org: mapping.source_org,
    target_org: mapping.target_org,
    locked_in_source: mapping.locked_in_source,
    created_at_in_target: mapping.created_at_in_target,
    outcome,
    highest_severity: highestSeverity,
    finding_count: String(findings.length),
    blocking_count: String(counts.blocking),
    warning_count: String(counts.warning),
    info_count: String(counts.info),
    raw_diff_file: diffPath,
    reason: '',
  };
}

function failedOutcome(mapping: MappingRow, reason: string): OutcomeRow {
  return {
    repo_name: mapping.repo_name,
    source_org: mapping.source_org,
    target_org: mapping.target_org,
    locked_in_source: mapping.locked_in_source,
    created_at_in_target: mapping.created_at_in_target,
    outcome: 'failed-or-skipped',
    highest_severity: '',
    finding_count: '0',
    blocking_count: '0',
    warning_count: '0',
    info_count: '0',
    raw_diff_file: '',
    reason,
  };
}

function readOptionalRows(path: string): CsvRow[] {
  return existsSync(path) ? readCsv(path).rows : [];
}

function parseDelta(value: string): number | undefined {
  const parsed = Number(value.trim().replace(/^[+]/, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function recommendationFromOutcome(
  outcome: OutcomeRow,
  findings: CsvRow[],
): RecommendationRow {
  const negativeContentColumns = findings
    .filter((finding) => {
      const delta = parseDelta(finding.Delta ?? '');
      return (
        MIGRATION_COUNT_COLUMNS.has(finding.Column ?? '') &&
        delta !== undefined &&
        delta < 0
      );
    })
    .map((finding) => finding.Column);
  const gitBlockingColumns = findings
    .filter(
      (finding) =>
        finding.Severity === 'blocking' &&
        ((finding.Column ?? '').startsWith('git_') ||
          (finding.Column ?? '').startsWith('git_ref:')),
    )
    .map((finding) => finding.Column);
  const warningColumns = findings
    .filter((finding) => finding.Severity === 'warning')
    .map((finding) => finding.Column);

  let contentRecommendation = 'migrated';
  let operationalRecommendation = 'move-on';
  let fidelityRecommendation = 'full-fidelity';
  let recommendationReason = 'Target counts meet or exceed source counts.';

  if (outcome.outcome === 'missing-in-target') {
    contentRecommendation = 'missing';
    operationalRecommendation = 'not-migrated';
    fidelityRecommendation = 'missing';
    recommendationReason =
      'Repository is present in the source but absent in the target.';
  } else if (outcome.outcome === 'failed-or-skipped') {
    contentRecommendation = 'unable-to-assess';
    operationalRecommendation = 'investigate-content-loss';
    fidelityRecommendation = 'unable-to-assess';
    recommendationReason =
      outcome.reason || 'Collection or comparison did not complete.';
  } else if (negativeContentColumns.length > 0) {
    contentRecommendation = 'review';
    operationalRecommendation = 'investigate-content-loss';
    fidelityRecommendation = 'blocked';
    recommendationReason = `Target is lower than source for: ${negativeContentColumns.join(', ')}.`;
  } else if (gitBlockingColumns.length > 0) {
    fidelityRecommendation = 'blocked';
    recommendationReason = `Content counts pass, but Git verification reported: ${gitBlockingColumns.join(', ')}.`;
  } else if (findings.length > 0) {
    fidelityRecommendation = 'review';
    recommendationReason =
      'Content counts pass; remaining differences are warnings or informational.';
  }

  if (outcome.outcome === 'extra-in-target') {
    contentRecommendation = 'unable-to-assess';
    operationalRecommendation = 'investigate-content-loss';
    fidelityRecommendation = 'unable-to-assess';
    recommendationReason =
      'Target repository has no source baseline in this run.';
  }

  return {
    repo_name: outcome.repo_name,
    source_org: outcome.source_org,
    target_org: outcome.target_org,
    original_outcome: outcome.outcome,
    content_recommendation: contentRecommendation,
    operational_recommendation: operationalRecommendation,
    fidelity_recommendation: fidelityRecommendation,
    locked_in_source: outcome.locked_in_source,
    created_at_in_target: outcome.created_at_in_target,
    finding_count: outcome.finding_count,
    blocking_count: outcome.blocking_count,
    warning_count: outcome.warning_count,
    info_count: outcome.info_count,
    negative_content_columns: [...new Set(negativeContentColumns)].join(';'),
    git_blocking_columns: [...new Set(gitBlockingColumns)].join(';'),
    warning_columns: [...new Set(warningColumns)].join(';'),
    recommendation_reason: recommendationReason,
  };
}

export function generateRecommendations(
  runDir: string,
): Record<string, number> {
  const reportsDir = join(runDir, 'reports');
  const outcomes = [
    'clean',
    'blocking',
    'warning-only',
    'missing-in-target',
    'extra-in-target',
    'failed-or-skipped',
  ].flatMap((name) =>
    readOptionalRows(join(reportsDir, `${name}.csv`)),
  ) as OutcomeRow[];
  const diffs = readOptionalRows(join(reportsDir, 'diff-all.csv'));
  const findingsByRepo = new Map<string, CsvRow[]>();
  for (const finding of diffs) {
    const key = normalizeRepoKey(finding.Repo_Name ?? '');
    const existing = findingsByRepo.get(key) ?? [];
    existing.push(finding);
    findingsByRepo.set(key, existing);
  }

  const skipped = [
    ...readOptionalRows(join(runDir, 'skipped-missing-target.csv')),
    ...readOptionalRows(join(runDir, 'audit-validation-failures.csv')),
  ];
  const recommendationRows = [
    ...outcomes.map((outcome) =>
      recommendationFromOutcome(
        outcome,
        findingsByRepo.get(normalizeRepoKey(outcome.repo_name)) ?? [],
      ),
    ),
    ...skipped.map((row) =>
      recommendationFromOutcome(
        {
          ...row,
          outcome:
            row.reason === 'No usable target mapping'
              ? 'missing-in-target'
              : 'failed-or-skipped',
          finding_count: '0',
          blocking_count: row.reason === 'No usable target mapping' ? '0' : '0',
          warning_count: '0',
          info_count: '0',
          highest_severity: '',
          raw_diff_file: '',
        } as OutcomeRow,
        [],
      ),
    ),
  ].sort((left, right) =>
    normalizeRepoKey(left.repo_name).localeCompare(
      normalizeRepoKey(right.repo_name),
    ),
  );

  writeCsv(
    join(reportsDir, 'migration-recommendations.csv'),
    RECOMMENDATION_HEADERS,
    recommendationRows,
  );

  return recommendationRows.reduce<Record<string, number>>((counts, row) => {
    counts[row.operational_recommendation] =
      (counts[row.operational_recommendation] ?? 0) + 1;
    return counts;
  }, {});
}

export function aggregateReports(runDir: string): Record<string, number> {
  const preparation = JSON.parse(
    readFileSync(join(runDir, 'preparation-summary.json'), 'utf8'),
  ) as PreparationSummary;
  const chunkCount = Number(
    readFileSync(join(runDir, 'chunk-count.txt'), 'utf8'),
  );
  const outcomes: OutcomeRow[] = [];
  const combinedDiffs: CsvRow[] = [];
  let completedChunks = 0;
  let failedChunks = 0;

  for (let index = 0; index < chunkCount; index++) {
    const chunkName = `chunk-${index.toString().padStart(3, '0')}`;
    const chunkDir = join(runDir, 'chunks', chunkName);
    const mappings = readCsv(join(chunkDir, 'mapping.csv'))
      .rows as MappingRow[];
    const failureRows = readOptionalRows(
      join(chunkDir, 'collection-failures.csv'),
    );
    const failures = new Map(
      failureRows.map((row) => [normalizeRepoKey(row.repo_name), row.reason]),
    );
    const complete = existsSync(join(chunkDir, 'comparison.complete'));
    const statusPath = join(chunkDir, 'operational-status.txt');
    const operationalStatus = existsSync(statusPath)
      ? readFileSync(statusPath, 'utf8').trim()
      : 'incomplete';

    if (!complete) {
      failedChunks++;
      for (const mapping of mappings) {
        outcomes.push(
          failedOutcome(
            mapping,
            failures.get(normalize(mapping.repo_name)) ?? operationalStatus,
          ),
        );
      }
      continue;
    }

    completedChunks++;
    const diffPath = join(chunkDir, 'diff.csv');
    const diffRows = readCsv(diffPath).rows;
    combinedDiffs.push(...diffRows);
    const findingsByRepo = new Map<string, CsvRow[]>();
    for (const finding of diffRows) {
      const key = normalizeRepoKey(finding.Repo_Name);
      const existing = findingsByRepo.get(key) ?? [];
      existing.push(finding);
      findingsByRepo.set(key, existing);
    }

    for (const mapping of mappings) {
      const key = normalizeRepoKey(mapping.repo_name);
      const failure = failures.get(key);
      outcomes.push(
        failure
          ? failedOutcome(mapping, failure)
          : outcomeFromFindings(
              mapping,
              findingsByRepo.get(key) ?? [],
              diffPath,
            ),
      );
    }
  }

  const auditFailures = readOptionalRows(
    join(runDir, 'audit-validation-failures.csv'),
  ) as MappingRow[];
  outcomes.push(
    ...auditFailures.map((row) =>
      failedOutcome(row, row.reason || 'audit-validation-failed'),
    ),
  );

  const reportsDir = join(runDir, 'reports');
  mkdirSync(reportsDir, { recursive: true });
  writeCsv(join(reportsDir, 'diff-all.csv'), COMPARE_HEADERS, combinedDiffs);

  const reportNames = [
    'clean',
    'blocking',
    'warning-only',
    'missing-in-target',
    'extra-in-target',
    'failed-or-skipped',
  ];
  const counts: Record<string, number> = {};
  for (const reportName of reportNames) {
    const rows = outcomes.filter((row) => row.outcome === reportName);
    counts[reportName] = rows.length;
    writeCsv(join(reportsDir, `${reportName}.csv`), OUTCOME_HEADERS, rows);
  }

  const sourceTimes: string[] = [];
  const targetTimes: string[] = [];
  for (let index = 0; index < chunkCount; index++) {
    const chunkName = `chunk-${index.toString().padStart(3, '0')}`;
    for (const [side, times] of [
      ['source', sourceTimes],
      ['target', targetTimes],
    ] as const) {
      const timestampPath = join(
        runDir,
        'chunks',
        chunkName,
        side,
        'collected-at.txt',
      );
      if (existsSync(timestampPath)) {
        times.push(readFileSync(timestampPath, 'utf8').trim());
      }
    }
  }

  const summaryRows: CsvRow[] = [
    { metric: 'selected', value: String(preparation.selected) },
    { metric: 'valid', value: String(preparation.valid) },
    { metric: 'missing_target', value: String(preparation.missingTarget) },
    { metric: 'audit_invalid', value: String(preparation.invalid) },
    { metric: 'unlocked_source', value: String(preparation.unlockedSource) },
    { metric: 'chunks', value: String(preparation.chunks) },
    { metric: 'completed_chunks', value: String(completedChunks) },
    { metric: 'failed_chunks', value: String(failedChunks) },
    ...Object.entries(counts).map(([metric, value]) => ({
      metric,
      value: String(value),
    })),
    {
      metric: 'source_collection_completed_at',
      value: sourceTimes.sort().at(-1) ?? '',
    },
    {
      metric: 'target_collection_completed_at',
      value: targetTimes.sort().at(-1) ?? '',
    },
  ];
  writeCsv(join(reportsDir, 'summary.csv'), ['metric', 'value'], summaryRows);

  const classifiedValid =
    counts.clean +
    counts.blocking +
    counts['warning-only'] +
    counts['missing-in-target'] +
    counts['extra-in-target'] +
    counts['failed-or-skipped'] -
    preparation.invalid;
  if (classifiedValid !== preparation.valid) {
    throw new Error(
      `Outcome totals do not reconcile: ${classifiedValid} classified vs ${preparation.valid} valid`,
    );
  }
  if (
    preparation.valid + preparation.missingTarget + preparation.invalid !==
    preparation.selected
  ) {
    throw new Error('Audit selection totals do not reconcile');
  }

  return counts;
}

function printSummary(summary: PreparationSummary): void {
  console.log(`selected=${summary.selected}`);
  console.log(`valid=${summary.valid}`);
  console.log(`missing_target=${summary.missingTarget}`);
  console.log(`invalid=${summary.invalid}`);
  console.log(`unlocked_source=${summary.unlockedSource}`);
  console.log(`chunks=${summary.chunks}`);
}

function main(argv: string[]): void {
  const [command, ...rest] = argv;
  const args = parseArgs(rest);
  switch (command) {
    case 'prepare': {
      const summary = prepareAudit({
        audit: requiredArg(args, '--audit'),
        runDir: requiredArg(args, '--run-dir'),
        status: requiredArg(args, '--status'),
        sourceOrg: requiredArg(args, '--source-org'),
        sourceHost: requiredArg(args, '--source-host'),
        sourceApiUrl: requiredArg(args, '--source-api-url'),
        targetOrg: requiredArg(args, '--target-org'),
        targetHost: requiredArg(args, '--target-host'),
        targetApiUrl: requiredArg(args, '--target-api-url'),
        sizeTolerancePct: requiredArg(args, '--size-tolerance-pct'),
        chunkSize: Number(requiredArg(args, '--chunk-size')),
        force: args.get('--force') === true,
      });
      printSummary(summary);
      break;
    }
    case 'reconcile': {
      const count = reconcileChunk(
        requiredArg(args, '--chunk-dir'),
        requiredArg(args, '--source-stats'),
        requiredArg(args, '--target-stats'),
      );
      console.log(`comparable=${count}`);
      break;
    }
    case 'validate-diff':
      validateDiff(requiredArg(args, '--diff'));
      break;
    case 'empty-diff':
      writeCsv(requiredArg(args, '--diff'), COMPARE_HEADERS, []);
      break;
    case 'aggregate': {
      const counts = aggregateReports(requiredArg(args, '--run-dir'));
      for (const [outcome, count] of Object.entries(counts)) {
        console.log(`${outcome}=${count}`);
      }
      break;
    }
    case 'recommend': {
      const counts = generateRecommendations(requiredArg(args, '--run-dir'));
      for (const [recommendation, count] of Object.entries(counts)) {
        console.log(`${recommendation}=${count}`);
      }
      break;
    }
    default:
      throw new Error(`Unknown command: ${command ?? ''}`);
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (invokedPath === import.meta.url) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
