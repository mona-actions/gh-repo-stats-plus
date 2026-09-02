import type { CompareFinding, CompareSummary } from './compare-stats-types.js';
import type { Logger } from './types.js';

export interface CompareSummaryAccumulator {
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

export interface WorstOffender {
  repoName: string;
  count: number;
}

const WORST_OFFENDER_LIMIT = 10;

export function createSummaryAccumulator(
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

export function accumulateFinding(
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

export function finalizeSummary(
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

export function summarizeFindings(
  findings: CompareFinding[],
  base: CompareSummaryAccumulator['base'],
): CompareSummary {
  const accumulator = createSummaryAccumulator(base);
  for (const finding of findings) {
    accumulateFinding(accumulator, finding);
  }
  return finalizeSummary(accumulator);
}

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

export function rankWorstOffenderCounts(
  counts: Map<string, number>,
  limit: number = WORST_OFFENDER_LIMIT,
): WorstOffender[] {
  return [...counts.entries()]
    .map(([repoName, count]) => ({ repoName, count }))
    .sort((a, b) => b.count - a.count || a.repoName.localeCompare(b.repoName))
    .slice(0, limit);
}
