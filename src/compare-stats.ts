import { COMPARE_STATS_COLUMNS, initializeCsvFile } from './csv.js';
import { readStatsCsv, writeCompareFinding } from './compare-stats-csv.js';
import {
  DEFAULT_SIZE_TOLERANCE_PCT,
  deriveRepoCounts,
  generateRepoStatsFindings,
  joinRepoStats,
} from './compare-stats-core.js';
import { runGitVerification } from './compare-stats-git.js';
import {
  accumulateFinding,
  createSummaryAccumulator,
  finalizeSummary,
  logCompareSummary,
  rankWorstOffenderCounts,
} from './compare-stats-summary.js';
import type {
  CompareConfig,
  CompareStatsOptions,
  CompareStatsRunResult,
} from './compare-stats-types.js';
import { createLogger } from './logger.js';
import { generateCompareStatsFileName, resolveOutputPath } from './utils.js';

export * from './compare-stats-core.js';
export * from './compare-stats-csv.js';
export * from './compare-stats-summary.js';
export * from './compare-stats-types.js';
export { resolveComparisonToken } from './compare-stats-git.js';

export async function runCompareStats(
  options: CompareStatsOptions,
): Promise<CompareStatsRunResult> {
  const logFileName = `compare-stats-${
    new Date().toISOString().split('T')[0]
  }.log`;
  const logger = await createLogger(options.verbose ?? false, logFileName);

  logger.info('Starting compare-stats...');
  logger.info(`Source file: ${options.sourceFile}`);
  logger.info(`Target file: ${options.targetFile}`);

  const source = readStatsCsv(options.sourceFile, 'Source');
  const target = readStatsCsv(options.targetFile, 'Target');
  const config: CompareConfig = {
    sizeTolerancePct: options.sizeTolerancePct ?? DEFAULT_SIZE_TOLERANCE_PCT,
  };
  const joinResult = joinRepoStats(source.rows, target.rows);
  const summaryAccumulator = createSummaryAccumulator(
    deriveRepoCounts(joinResult),
  );

  const outputPath = await resolveOutputPath(
    options.outputDir,
    options.outputFile || generateCompareStatsFileName(),
  );
  initializeCsvFile(outputPath, COMPARE_STATS_COLUMNS, logger);

  for (const finding of generateRepoStatsFindings(joinResult, config)) {
    writeCompareFinding(outputPath, finding, logger);
    accumulateFinding(summaryAccumulator, finding);
  }

  if (options.verifyGit) {
    for await (const finding of runGitVerification(
      joinResult.matched,
      options,
      logger,
    )) {
      writeCompareFinding(outputPath, finding, logger);
      accumulateFinding(summaryAccumulator, finding);
    }
  }

  const summary = finalizeSummary(summaryAccumulator);
  logger.info(`Comparison report written to: ${outputPath}`);
  logCompareSummary(
    summary,
    rankWorstOffenderCounts(summaryAccumulator.blockingFindingCounts),
    logger,
  );
  logger.info(`output_file=${outputPath}`);

  return { outputPath, summary };
}
