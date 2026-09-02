import {
  appendCsvRow,
  COMPARE_STATS_COLUMNS,
  initializeCsvFile,
  readCsvMatrix,
  REPO_STATS_COLUMNS,
} from './csv.js';
import { createLogger } from './logger.js';
import { loadCaCertificate } from './tls.js';
import { Logger } from './types.js';
import { generateCompareStatsFileName, resolveOutputPath } from './utils.js';
import { createComparisonClient, verifyGitRefs } from './compare-stats-git.js';

// --- Types ---

export type CompareSeverity = 'blocking' | 'warning' | 'info';

export type CompareStatus = 'matched' | 'missing_in_target' | 'extra_in_target';

export interface CompareFinding {
  Repo_Name: string;
  Source_Org: string;
  Target_Org: string;
  Column: string;
  Source_Value: string;
  Target_Value: string;
  Delta: string;
  Severity: CompareSeverity;
  Status: CompareStatus;
}

export interface CompareSummary {
  sourceRepoCount: number;
  targetRepoCount: number;
  matchedRepoCount: number;
  cleanRepoCount: number;
  reposWithBlockingDiffs: number;
  missingInTargetCount: number;
  extraInTargetCount: number;
  blockingFindingCount: number;
  warningFindingCount: number;
  infoFindingCount: number;
}

interface CompareSummaryAccumulator {
  base: Pick<
    CompareSummary,
    'sourceRepoCount' | 'targetRepoCount' | 'matchedRepoCount'
  >;
  missingInTarget: Set<string>;
  extraInTarget: Set<string>;
  blockingRepos: Set<string>;
  matchedReposWithFindings: Set<string>;
  blockingFindingCounts: Map<string, number>;
  blockingFindingCount: number;
  warningFindingCount: number;
  infoFindingCount: number;
}

interface WorstOffender {
  repoName: string;
  count: number;
}

export interface CompareResult {
  findings: CompareFinding[];
  summary: CompareSummary;
  /** Repositories present in both files, exposed for the optional git check. */
  matched: MatchedRepo[];
}

export interface MatchedRepo {
  repoName: string;
  sourceOrg: string;
  targetOrg: string;
  source: Record<string, string>;
  target: Record<string, string>;
}

export interface CompareConfig {
  /**
   * Percentage tolerance applied to `Repo_Size_mb` before reporting a
   * difference. Repacking on the target can legitimately change repo size.
   */
  sizeTolerancePct: number;
}

export const DEFAULT_SIZE_TOLERANCE_PCT = 10;

// --- Column classification ---

/**
 * Numeric columns where any non-zero delta indicates data loss.
 */
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

/**
 * Numeric columns that GEI does not migrate. Differences are reported as
 * informational rather than failures.
 */
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

/**
 * Settings / boolean / string columns compared for equality. Mismatches are
 * reported as warnings.
 */
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

/**
 * Columns that always differ between source and target and carry no signal.
 */
export const EXCLUDED_COLUMNS = [
  'Org_Name',
  'Full_URL',
  'Created',
  'Last_Push',
  'Last_Update',
  'Migration_Issue',
];

/** Column value used for repo-level (rather than column-level) findings. */
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

// --- Normalization helpers ---

/**
 * Normalizes a repo name for joining. Values written by `writeResultToCsv` are
 * already lowercased, but normalize defensively on both sides.
 */
export function normalizeRepoKey(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Normalizes a boolean-ish CSV value. Booleans are written as uppercase
 * `TRUE`/`FALSE` strings by `writeResultToCsv`.
 */
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

/**
 * Parses a numeric CSV value, returning 0 for blank/non-numeric values.
 */
export function parseNumericValue(value: string | undefined): number {
  const parsed = Number((value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDelta(delta: number): string {
  const rounded = Math.round(delta * 1000) / 1000;
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

// --- CSV reading / header validation ---

export interface StatsCsvFile {
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * Reads a repo-stats CSV file and validates that every column required for the
 * comparison is present.
 *
 * @param filePath - Path to a CSV produced by a repo-stats run
 * @param label - Human-readable label (e.g. `source`) used in error messages
 */
export function readStatsCsv(filePath: string, label: string): StatsCsvFile {
  const matrix = readCsvMatrix(filePath);
  if (matrix.length === 0) {
    throw new Error(`${label} file is empty: ${filePath}`);
  }

  const headers = matrix[0].map((h) => h.trim());
  validateStatsHeaders(headers, label, filePath);

  const rows = matrix.slice(1).map((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? '';
    });
    return row;
  });

  return { headers, rows };
}

/**
 * Throws a descriptive error when any `REPO_STATS_COLUMNS` header is missing.
 */
export function validateStatsHeaders(
  headers: string[],
  label: string,
  filePath?: string,
): void {
  const present = new Set(headers.map((h) => h.trim()));
  const missing = REPO_STATS_COLUMNS.filter((column) => !present.has(column));

  if (missing.length > 0) {
    const location = filePath ? ` (${filePath})` : '';
    throw new Error(
      `${label} file is missing required repo-stats column(s)${location}: ${missing.join(', ')}`,
    );
  }
}

// --- Join ---

export interface JoinResult {
  matched: MatchedRepo[];
  missingInTarget: Record<string, string>[];
  extraInTarget: Record<string, string>[];
}

/**
 * Joins source and target rows on `Repo_Name` only. `Org_Name` intentionally is
 * not part of the join key because it typically differs between source and
 * target tenants.
 */
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

// --- Column comparison ---

/**
 * Compares a single numeric column for a matched repo.
 * Returns `null` when the values match (or fall within tolerance).
 */
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

/**
 * Compares a single settings/boolean/string column for a matched repo.
 * Returns `null` when the normalized values are equal.
 */
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

/**
 * Produces all findings for a single matched repository.
 */
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

// --- Full comparison ---

/**
 * Compares two sets of repo-stats rows and produces findings plus a summary.
 */
export function compareRepoStats(
  sourceRows: Record<string, string>[],
  targetRows: Record<string, string>[],
  config: CompareConfig = { sizeTolerancePct: DEFAULT_SIZE_TOLERANCE_PCT },
): CompareResult {
  const { matched, missingInTarget, extraInTarget } = joinRepoStats(
    sourceRows,
    targetRows,
  );

  const findings = [
    ...generateRepoStatsFindings(
      { matched, missingInTarget, extraInTarget },
      config,
    ),
  ];

  return {
    findings,
    matched,
    summary: summarizeFindings(findings, {
      sourceRepoCount: sourceRows.length,
      targetRepoCount: targetRows.length,
      matchedRepoCount: matched.length,
    }),
  };
}

function* generateRepoStatsFindings(
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

/**
 * Computes the summary for a set of findings. Called once after all findings
 * (CSV diff plus any git-ref findings) have been collected.
 */
export function summarizeFindings(
  findings: CompareFinding[],
  base: Pick<
    CompareSummary,
    'sourceRepoCount' | 'targetRepoCount' | 'matchedRepoCount'
  >,
): CompareSummary {
  const accumulator = createSummaryAccumulator(base);
  for (const finding of findings) {
    accumulateFinding(accumulator, finding);
  }
  return finalizeSummary(accumulator);
}

function createSummaryAccumulator(
  base: CompareSummaryAccumulator['base'],
): CompareSummaryAccumulator {
  return {
    base,
    missingInTarget: new Set<string>(),
    extraInTarget: new Set<string>(),
    blockingRepos: new Set<string>(),
    matchedReposWithFindings: new Set<string>(),
    blockingFindingCounts: new Map<string, number>(),
    blockingFindingCount: 0,
    warningFindingCount: 0,
    infoFindingCount: 0,
  };
}

function accumulateFinding(
  accumulator: CompareSummaryAccumulator,
  finding: CompareFinding,
): void {
  switch (finding.Status) {
    case 'missing_in_target':
      accumulator.missingInTarget.add(finding.Repo_Name);
      break;
    case 'extra_in_target':
      accumulator.extraInTarget.add(finding.Repo_Name);
      break;
    default:
      accumulator.matchedReposWithFindings.add(finding.Repo_Name);
      if (finding.Severity === 'blocking') {
        accumulator.blockingRepos.add(finding.Repo_Name);
      }
  }

  switch (finding.Severity) {
    case 'blocking':
      accumulator.blockingFindingCount += 1;
      accumulator.blockingFindingCounts.set(
        finding.Repo_Name,
        (accumulator.blockingFindingCounts.get(finding.Repo_Name) ?? 0) + 1,
      );
      break;
    case 'warning':
      accumulator.warningFindingCount += 1;
      break;
    case 'info':
      accumulator.infoFindingCount += 1;
      break;
  }
}

function finalizeSummary(
  accumulator: CompareSummaryAccumulator,
): CompareSummary {
  return {
    ...accumulator.base,
    cleanRepoCount: Math.max(
      accumulator.base.matchedRepoCount -
        accumulator.matchedReposWithFindings.size,
      0,
    ),
    reposWithBlockingDiffs: accumulator.blockingRepos.size,
    missingInTargetCount: accumulator.missingInTarget.size,
    extraInTargetCount: accumulator.extraInTarget.size,
    blockingFindingCount: accumulator.blockingFindingCount,
    warningFindingCount: accumulator.warningFindingCount,
    infoFindingCount: accumulator.infoFindingCount,
  };
}

// --- Public entry point ---

export interface CompareStatsOptions {
  sourceFile: string;
  targetFile: string;
  outputDir?: string;
  outputFile?: string;
  failOnBlocking?: boolean;
  sizeTolerancePct?: number;
  verbose?: boolean;
  // Optional git-level SHA verification
  verifyGit?: boolean;
  sourceOrg?: string;
  targetOrg?: string;
  sourceBaseUrl?: string;
  targetBaseUrl?: string;
  sourceToken?: string;
  targetToken?: string;
  proxyUrl?: string;
  caCertPath?: string;
  apiVersion?: string;
  pageSize?: number;
  rateLimitCheckInterval?: number;
}

export interface CompareStatsRunResult {
  outputPath: string;
  summary: CompareSummary;
}

/** Number of worst offenders included in the console summary. */
const WORST_OFFENDER_LIMIT = 10;

/**
 * Resolves a token for one side of the comparison, falling back to the
 * environment variables the other commands accept.
 */
export function resolveComparisonToken(
  explicitToken: string | undefined,
  label: string,
): string {
  const token =
    explicitToken ||
    process.env.ACCESS_TOKEN ||
    process.env.GH_TOKEN ||
    process.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error(
      `A ${label} token is required for --verify-git. Provide --${label}-token or set ACCESS_TOKEN / GH_TOKEN / GITHUB_TOKEN.`,
    );
  }

  return token;
}

/**
 * Orchestrates the compare-stats workflow:
 * 1. Reads and validates both repo-stats CSV files
 * 2. Joins on `Repo_Name` and classifies every differing column
 * 3. Optionally supplements the diff with a live git ref/SHA comparison
 * 4. Writes the report CSV incrementally and logs a human-readable summary
 */
export async function runCompareStats(
  options: CompareStatsOptions,
): Promise<CompareStatsRunResult> {
  const logFileName = `compare-stats-${
    new Date().toISOString().split('T')[0]
  }.log`;
  const logger: Logger = await createLogger(
    options.verbose ?? false,
    logFileName,
  );

  logger.info('Starting compare-stats...');
  logger.info(`Source file: ${options.sourceFile}`);
  logger.info(`Target file: ${options.targetFile}`);

  const source = readStatsCsv(options.sourceFile, 'Source');
  const target = readStatsCsv(options.targetFile, 'Target');

  const config: CompareConfig = {
    sizeTolerancePct: options.sizeTolerancePct ?? DEFAULT_SIZE_TOLERANCE_PCT,
  };

  const joinResult = joinRepoStats(source.rows, target.rows);
  const summaryAccumulator = createSummaryAccumulator({
    sourceRepoCount: source.rows.length,
    targetRepoCount: target.rows.length,
    matchedRepoCount: joinResult.matched.length,
  });

  const outputPath = await resolveOutputPath(
    options.outputDir,
    options.outputFile || generateCompareStatsFileName(),
  );
  initializeCsvFile(outputPath, COMPARE_STATS_COLUMNS, logger);

  for (const finding of generateRepoStatsFindings(joinResult, config)) {
    writeFinding(outputPath, finding, logger);
    accumulateFinding(summaryAccumulator, finding);
  }

  if (options.verifyGit) {
    for await (const finding of runGitVerification(
      joinResult.matched,
      options,
      logger,
    )) {
      writeFinding(outputPath, finding, logger);
      accumulateFinding(summaryAccumulator, finding);
    }
  }

  const finalSummary = finalizeSummary(summaryAccumulator);
  logger.info(`Comparison report written to: ${outputPath}`);
  logCompareSummary(
    finalSummary,
    rankWorstOffenderCounts(summaryAccumulator.blockingFindingCounts),
    logger,
  );
  logger.info(`output_file=${outputPath}`);

  return { outputPath, summary: finalSummary };
}

function writeFinding(
  outputPath: string,
  finding: CompareFinding,
  logger: Logger,
): void {
  appendCsvRow(
    outputPath,
    COMPARE_STATS_COLUMNS.map(
      (column) => finding[column as keyof CompareFinding],
    ),
    logger,
  );
}

/**
 * Builds the source/target clients and streams git-level findings.
 */
async function* runGitVerification(
  matched: MatchedRepo[],
  options: CompareStatsOptions,
  logger: Logger,
): AsyncGenerator<CompareFinding, void, unknown> {
  const sourceOrg = options.sourceOrg?.trim();
  const targetOrg = options.targetOrg?.trim();

  if (!sourceOrg || !targetOrg) {
    throw new Error(
      '--verify-git requires both --source-org and --target-org so repositories can be addressed on each host.',
    );
  }

  const caCert = loadCaCertificate(options.caCertPath, logger);

  const clients = {
    sourceClient: createComparisonClient(
      {
        token: resolveComparisonToken(options.sourceToken, 'source'),
        baseUrl: options.sourceBaseUrl ?? 'https://api.github.com',
        proxyUrl: options.proxyUrl,
        apiVersion: options.apiVersion,
        caCert,
      },
      logger,
    ),
    targetClient: createComparisonClient(
      {
        token: resolveComparisonToken(options.targetToken, 'target'),
        baseUrl: options.targetBaseUrl ?? 'https://api.github.com',
        proxyUrl: options.proxyUrl,
        apiVersion: options.apiVersion,
        caCert,
      },
      logger,
    ),
  };

  logger.info(
    `Verifying git refs for ${matched.length} matched repositories (${sourceOrg} -> ${targetOrg})`,
  );

  yield* verifyGitRefs(
    matched,
    clients,
    {
      sourceOrg,
      targetOrg,
      pageSize: options.pageSize ?? 100,
      rateLimitCheckInterval: options.rateLimitCheckInterval ?? 10,
    },
    logger,
  );
}

/**
 * Logs a human-readable summary, including the repositories with the most
 * blocking findings.
 */
export function logCompareSummary(
  summary: CompareSummary,
  worstOffenders: WorstOffender[],
  logger: Logger,
): void {
  logger.info('='.repeat(80));
  logger.info('COMPARE STATS SUMMARY');
  logger.info(`Repositories in source file: ${summary.sourceRepoCount}`);
  logger.info(`Repositories in target file: ${summary.targetRepoCount}`);
  logger.info(`Repositories compared: ${summary.matchedRepoCount}`);
  logger.info(`Matched with no differences: ${summary.cleanRepoCount}`);
  logger.info(
    `Repositories with blocking differences: ${summary.reposWithBlockingDiffs}`,
  );
  logger.info(`Missing in target: ${summary.missingInTargetCount}`);
  logger.info(`Extra in target: ${summary.extraInTargetCount}`);
  logger.info(
    `Findings - blocking: ${summary.blockingFindingCount}, warning: ${summary.warningFindingCount}, info: ${summary.infoFindingCount}`,
  );

  if (worstOffenders.length > 0) {
    logger.info('Worst offenders (most blocking findings):');
    for (const { repoName, count } of worstOffenders) {
      logger.info(`- ${repoName}: ${count} blocking finding(s)`);
    }
  }
  logger.info('='.repeat(80));
}

/**
 * Ranks repositories by number of blocking findings, descending.
 */
export function rankWorstOffenders(
  findings: CompareFinding[],
  limit: number = WORST_OFFENDER_LIMIT,
): WorstOffender[] {
  const counts = new Map<string, number>();

  for (const finding of findings) {
    if (finding.Severity !== 'blocking') {
      continue;
    }
    counts.set(finding.Repo_Name, (counts.get(finding.Repo_Name) ?? 0) + 1);
  }

  return rankWorstOffenderCounts(counts, limit);
}

function rankWorstOffenderCounts(
  counts: Map<string, number>,
  limit: number = WORST_OFFENDER_LIMIT,
): WorstOffender[] {
  return [...counts.entries()]
    .map(([repoName, count]) => ({ repoName, count }))
    .sort((a, b) => b.count - a.count || a.repoName.localeCompare(b.repoName))
    .slice(0, limit);
}
