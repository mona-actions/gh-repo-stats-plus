import { existsSync } from 'fs';
import { readCsvFile, writeCsvFile } from './csv.js';
import { resolveOutputPath, generateCombinedStatsFileName } from './utils.js';
import { createLogger } from './logger.js';
import { Logger } from './types.js';

// --- Types ---

export interface CombineStatsOptions {
  files: string[];
  matchColumns: string[];
  outputFile?: string;
  outputDir?: string;
  verbose?: boolean;
}

// --- Key building ---

/**
 * Builds a composite key from the specified match columns in a row.
 * Values are lowercased and trimmed for case-insensitive matching.
 * Uses null character as delimiter to avoid collisions.
 */
export function buildKey(
  row: Record<string, string>,
  matchColumns: string[],
): string {
  return matchColumns
    .map((col) => (row[col] ?? '').trim().toLowerCase())
    .join('\0');
}

// --- Two-file merge (full outer join) ---

export interface MergeResult {
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * Performs a full outer join of two datasets on the specified match columns.
 *
 * - Rows that match in both datasets are merged (additional columns appended).
 * - Rows only in `base` are preserved with empty values for additional-only columns.
 * - Rows only in `additional` are preserved with empty values for base-only columns.
 * - Match columns from `additional` are not duplicated in the output.
 *
 * @param base - The base dataset (rows from the first/left file)
 * @param additional - The additional dataset (rows from the second/right file)
 * @param matchColumns - Column names used to match rows between datasets
 * @returns Combined headers and rows
 */
export function mergeTwo(
  base: Record<string, string>[],
  additional: Record<string, string>[],
  matchColumns: string[],
): MergeResult {
  // Determine base headers from first row keys (preserves order)
  const baseHeaders =
    base.length > 0 ? Object.keys(base[0]) : [...matchColumns];

  // Determine additional headers, excluding match columns to avoid duplication
  const matchSet = new Set(matchColumns);
  const additionalAllHeaders =
    additional.length > 0 ? Object.keys(additional[0]) : [];
  const additionalNewHeaders = additionalAllHeaders.filter(
    (h) => !matchSet.has(h),
  );

  // Combined headers: base headers first, then new columns from additional
  const seenHeaders = new Set(baseHeaders);
  const combinedHeaders = [...baseHeaders];
  for (const h of additionalNewHeaders) {
    if (!seenHeaders.has(h)) {
      combinedHeaders.push(h);
      seenHeaders.add(h);
    }
  }

  // Index additional rows by composite key
  const additionalIndex = new Map<string, Record<string, string>>();
  for (const row of additional) {
    const key = buildKey(row, matchColumns);
    additionalIndex.set(key, row);
  }

  const consumedKeys = new Set<string>();
  const combinedRows: Record<string, string>[] = [];

  // Walk base rows → merge or keep as-is
  for (const baseRow of base) {
    const key = buildKey(baseRow, matchColumns);
    const addRow = additionalIndex.get(key);

    const merged: Record<string, string> = {};
    for (const h of combinedHeaders) {
      merged[h] = baseRow[h] ?? '';
    }

    if (addRow) {
      // Merge additional columns (excluding match columns)
      for (const h of additionalNewHeaders) {
        merged[h] = addRow[h] ?? '';
      }
      consumedKeys.add(key);
    }

    combinedRows.push(merged);
  }

  // Append unconsumed additional rows (full outer join)
  for (const addRow of additional) {
    const key = buildKey(addRow, matchColumns);
    if (consumedKeys.has(key)) {
      continue;
    }

    const merged: Record<string, string> = {};
    for (const h of combinedHeaders) {
      if (matchSet.has(h)) {
        merged[h] = addRow[h] ?? '';
      } else if (additionalNewHeaders.includes(h)) {
        merged[h] = addRow[h] ?? '';
      } else {
        merged[h] = '';
      }
    }

    combinedRows.push(merged);
    consumedKeys.add(key);
  }

  return { headers: combinedHeaders, rows: combinedRows };
}

// --- N-file combine ---

/**
 * Combines N CSV files by iteratively merging them left-to-right.
 * Each file is read, then merged into the running result using the specified match columns.
 *
 * @param filePaths - Array of CSV file paths to combine (minimum 2)
 * @param matchColumns - Column names used to match rows across files
 * @returns Combined headers and rows from all files
 */
export function combineFiles(
  filePaths: string[],
  matchColumns: string[],
): MergeResult {
  if (filePaths.length < 2) {
    throw new Error('At least 2 files are required for combining');
  }

  let result: MergeResult = {
    headers: [],
    rows: readCsvFile(filePaths[0]),
  };

  // Set initial headers from first file
  if (result.rows.length > 0) {
    result.headers = Object.keys(result.rows[0]);
  } else {
    result.headers = [...matchColumns];
  }

  // Iteratively merge each subsequent file
  for (let i = 1; i < filePaths.length; i++) {
    const additionalRows = readCsvFile(filePaths[i]);
    result = mergeTwo(result.rows, additionalRows, matchColumns);
  }

  return result;
}

// --- Public entry point ---

/**
 * Orchestrates the combine-stats workflow:
 * 1. Validates inputs (files exist, match columns provided)
 * 2. Reads and combines all CSV files
 * 3. Writes the combined output CSV
 * 4. Logs a summary
 */
export async function runCombineStats(
  options: CombineStatsOptions,
): Promise<void> {
  const logFileName = `combine-stats-${
    new Date().toISOString().split('T')[0]
  }.log`;
  const logger: Logger = await createLogger(
    options.verbose ?? false,
    logFileName,
  );

  logger.info('Starting combine-stats...');
  logger.info(`Files to combine: ${options.files.join(', ')}`);
  logger.info(`Match columns: ${options.matchColumns.join(', ')}`);

  // Validate all files exist
  for (const filePath of options.files) {
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
  }

  // Combine files
  const { headers, rows } = combineFiles(options.files, options.matchColumns);

  logger.info(
    `Combined ${options.files.length} files: ${headers.length} columns, ${rows.length} rows`,
  );

  // Determine output path
  const outputFileName = options.outputFile || generateCombinedStatsFileName();
  const outputPath = await resolveOutputPath(options.outputDir, outputFileName);

  // Write output
  writeCsvFile(outputPath, headers, rows);
  logger.info(`Combined CSV written to: ${outputPath}`);

  logger.info(`Combined ${options.files.length} files into: ${outputPath}`);
  logger.info(`  Total columns: ${headers.length}`);
  logger.info(`  Total rows: ${rows.length}`);
}
