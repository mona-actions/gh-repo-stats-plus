import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { readCsvFile, writeCsvFile } from './csv.js';
import { resolveOutputPath } from './utils.js';
import { createLogger } from './logger.js';
import {
  Logger,
  PostProcessRule,
  PostProcessRulesConfig,
  PostProcessOptions,
  ColumnRange,
  IndicatorColumnConfig,
} from './types.js';

// --- Filename generation ---

function generateTimestamp(): string {
  return new Date()
    .toISOString()
    .replace(/[-:T\.Z]/g, '')
    .slice(0, 12);
}

export function generatePostProcessFileName(): string {
  const timestamp = generateTimestamp();
  return `post-processed-${timestamp}_ts.csv`;
}

// --- Validation ---

export function validateRulesConfig(config: unknown): PostProcessRulesConfig {
  if (!config || typeof config !== 'object') {
    throw new Error('Rules configuration must be a non-null object');
  }

  const cfg = config as Record<string, unknown>;

  if (!Array.isArray(cfg.rules)) {
    throw new Error('Rules configuration must contain a "rules" array');
  }

  for (let i = 0; i < cfg.rules.length; i++) {
    const rule = cfg.rules[i] as Record<string, unknown>;
    if (!rule || typeof rule !== 'object') {
      throw new Error(`Rule at index ${i} must be an object`);
    }
    if (!Array.isArray(rule.columns) || rule.columns.length === 0) {
      throw new Error(
        `Rule at index ${i} must have a non-empty "columns" array`,
      );
    }
    for (const col of rule.columns as unknown[]) {
      if (typeof col !== 'string') {
        throw new Error(
          `Rule at index ${i} contains a non-string column value`,
        );
      }
    }
  }

  if (cfg.processColumns !== undefined) {
    if (typeof cfg.processColumns !== 'object' || cfg.processColumns === null) {
      throw new Error('"processColumns" must be an object if provided');
    }
  }

  if (cfg.indicatorColumns !== undefined) {
    if (!Array.isArray(cfg.indicatorColumns)) {
      throw new Error('"indicatorColumns" must be an array if provided');
    }
    for (let i = 0; i < cfg.indicatorColumns.length; i++) {
      const ind = cfg.indicatorColumns[i] as Record<string, unknown>;
      if (!ind || typeof ind !== 'object') {
        throw new Error(`Indicator column at index ${i} must be an object`);
      }
      if (typeof ind.name !== 'string' || ind.name.trim() === '') {
        throw new Error(
          `Indicator column at index ${i} must have a non-empty "name" string`,
        );
      }
      if (ind.trueValue === undefined || ind.falseValue === undefined) {
        throw new Error(
          `Indicator column at index ${i} must have "trueValue" and "falseValue"`,
        );
      }
    }
  }

  return config as PostProcessRulesConfig;
}

// --- Column utilities ---

/**
 * Resolves column ranges to an array of column names.
 * Ranges are zero-based; end is exclusive. A single number is treated as { start: n }.
 */
export function getColumnsByRange(
  ranges: ColumnRange[],
  allColumns: string[],
): string[] {
  const result: string[] = [];

  for (const range of ranges) {
    const rangeObj = typeof range === 'number' ? { start: range } : range;
    const start = typeof rangeObj.start === 'number' ? rangeObj.start : 0;
    const end =
      typeof rangeObj.end === 'number' ? rangeObj.end : allColumns.length;

    result.push(...allColumns.slice(start, end));
  }

  return result;
}

/**
 * Determines which columns should be processed based on the rules configuration.
 * If no processColumns config is provided, all columns are processed.
 */
export function getColumnsToProcess(
  config: PostProcessRulesConfig,
  sampleRow: Record<string, string>,
): string[] {
  const allColumns = Object.keys(sampleRow);

  if (!config.processColumns) {
    return allColumns;
  }

  const columns: string[] = [];

  // Add columns specified by name (case-insensitive matching)
  if (
    config.processColumns.columns &&
    Array.isArray(config.processColumns.columns)
  ) {
    for (const colName of config.processColumns.columns) {
      const match = allColumns.find(
        (c) => c.toLowerCase() === colName.toLowerCase(),
      );
      if (match) {
        columns.push(match);
      }
    }
  }

  // Add columns from ranges
  if (
    config.processColumns.columnRanges &&
    Array.isArray(config.processColumns.columnRanges)
  ) {
    columns.push(
      ...getColumnsByRange(config.processColumns.columnRanges, allColumns),
    );
  }

  // Deduplicate while preserving order
  return [...new Set(columns)];
}

/**
 * Gets the source columns to check for an indicator column.
 * If neither sourceColumns nor sourceColumnRanges is provided, all columns are checked.
 */
export function getIndicatorSourceColumns(
  indicator: IndicatorColumnConfig,
  allColumns: string[],
): string[] {
  if (!indicator.sourceColumns && !indicator.sourceColumnRanges) {
    return allColumns;
  }

  const columns: string[] = [];

  // Add columns by name (case-insensitive matching)
  if (indicator.sourceColumns && Array.isArray(indicator.sourceColumns)) {
    for (const colName of indicator.sourceColumns) {
      const match = allColumns.find(
        (c) => c.toLowerCase() === colName.toLowerCase(),
      );
      if (match) {
        columns.push(match);
      }
    }
  }

  // Add columns from ranges
  if (
    indicator.sourceColumnRanges &&
    Array.isArray(indicator.sourceColumnRanges)
  ) {
    columns.push(
      ...getColumnsByRange(indicator.sourceColumnRanges, allColumns),
    );
  }

  return columns;
}

// --- Rule matching ---

interface ResolvedRule {
  pattern: RegExp | null;
  replacement: string;
  fallback: string | boolean | number;
  emptyValue: string | boolean | number;
}

const DEFAULT_RULE: ResolvedRule = {
  pattern: null,
  replacement: '$0',
  fallback: '1+',
  emptyValue: '0',
};

/**
 * Finds the most specific rule that applies to a column.
 * Later rules in the array take precedence over earlier ones.
 * Wildcard ("*") rules serve as fallback.
 */
export function findRuleForColumn(
  column: string,
  rules: PostProcessRule[],
): ResolvedRule {
  let wildcardRule: PostProcessRule | null = null;

  // Iterate from end to start — last matching rule wins
  for (let i = rules.length - 1; i >= 0; i--) {
    const rule = rules[i];
    if (!rule.columns || !Array.isArray(rule.columns)) {
      continue;
    }

    // Check for direct column match (case-insensitive)
    const hasDirectMatch = rule.columns.some(
      (col) => col !== '*' && col.toLowerCase() === column.toLowerCase(),
    );

    if (hasDirectMatch) {
      return resolveRule(rule);
    }

    // Store wildcard rule if found (first one from the end = highest precedence)
    if (rule.columns.includes('*') && !wildcardRule) {
      wildcardRule = rule;
    }
  }

  if (wildcardRule) {
    return resolveRule(wildcardRule);
  }

  return { ...DEFAULT_RULE };
}

function resolveRule(rule: PostProcessRule): ResolvedRule {
  return {
    pattern: rule.pattern ? new RegExp(rule.pattern, 'i') : null,
    replacement: rule.replacement ?? DEFAULT_RULE.replacement,
    fallback:
      rule.fallback !== undefined ? rule.fallback : DEFAULT_RULE.fallback,
    emptyValue:
      rule.emptyValue !== undefined ? rule.emptyValue : DEFAULT_RULE.emptyValue,
  };
}

/**
 * Processes a single cell value according to the rule.
 * 1. If value is empty/null → return emptyValue
 * 2. If pattern matches → apply replacement
 * 3. Otherwise → return fallback
 */
export function processCell(
  value: string | undefined | null,
  rule: ResolvedRule,
): string | boolean | number {
  // Check for empty/null/undefined
  if (value === undefined || value === null || String(value).trim() === '') {
    return rule.emptyValue;
  }

  const strValue = String(value);

  // Try to match pattern
  if (rule.pattern) {
    const match = strValue.match(rule.pattern);
    if (match) {
      return rule.replacement.replace(
        /\$(\d+)/g,
        (_, n) => match[Number(n)] || '',
      );
    }
    return rule.fallback;
  }

  // No pattern defined — return fallback
  return rule.fallback;
}

/**
 * Processes a single row according to the rules.
 * Only columns in columnsToProcess are transformed.
 */
export function processRow(
  row: Record<string, string>,
  columnsToProcess: string[],
  rules: PostProcessRule[],
): Record<string, string> {
  const processedRow = { ...row };

  for (const column of Object.keys(row)) {
    if (!columnsToProcess.includes(column)) {
      continue;
    }

    const rule = findRuleForColumn(column, rules);
    const result = processCell(row[column], rule);
    processedRow[column] = String(result);
  }

  return processedRow;
}

// --- Indicator columns ---

/**
 * Adds indicator columns to processed CSV data.
 * An indicator column is set to trueValue if any of its source columns
 * contain a non-empty value (different from that column's emptyValue), falseValue otherwise.
 */
export function addIndicatorColumns(
  csvData: Record<string, string>[],
  config: PostProcessRulesConfig,
): Record<string, string>[] {
  if (
    !config.indicatorColumns ||
    !Array.isArray(config.indicatorColumns) ||
    config.indicatorColumns.length === 0
  ) {
    return csvData;
  }

  // Find default empty value from wildcard rule if available
  const wildcardRule = config.rules?.find(
    (r) => r.columns && r.columns.includes('*'),
  );
  const defaultEmptyValue =
    wildcardRule?.emptyValue !== undefined ? wildcardRule.emptyValue : '0';

  // Build a map of column → emptyValue from rules
  const columnEmptyValues = new Map<string, string | boolean | number>();
  if (config.rules && Array.isArray(config.rules)) {
    for (const rule of config.rules) {
      if (rule.columns && Array.isArray(rule.columns)) {
        const emptyVal =
          rule.emptyValue !== undefined ? rule.emptyValue : defaultEmptyValue;
        for (const col of rule.columns) {
          columnEmptyValues.set(col.toLowerCase(), emptyVal);
        }
      }
    }
  }

  return csvData.map((row) => {
    const allColumns = Object.keys(row);
    const newRow = { ...row };

    for (const indicator of config.indicatorColumns!) {
      const columnsToCheck = getIndicatorSourceColumns(indicator, allColumns);

      const hasNonEmpty = columnsToCheck.some((col) => {
        const value = row[col];
        const emptyValue =
          columnEmptyValues.get(col.toLowerCase()) ?? defaultEmptyValue;

        return (
          value !== undefined &&
          value !== null &&
          value !== '' &&
          String(value) !== String(emptyValue)
        );
      });

      newRow[indicator.name] = String(
        hasNonEmpty ? indicator.trueValue : indicator.falseValue,
      );
    }

    return newRow;
  });
}

// --- Main processing ---

/**
 * Processes CSV data with rules and adds indicator columns.
 */
export function processData(
  csvData: Record<string, string>[],
  config: PostProcessRulesConfig,
): Record<string, string>[] {
  if (csvData.length === 0) {
    return csvData;
  }

  const rulesArray = Array.isArray(config.rules) ? config.rules : [];
  const columnsToProcess = getColumnsToProcess(config, csvData[0]);

  // Process each row
  const processedData = csvData.map((row) =>
    processRow(row, columnsToProcess, rulesArray),
  );

  // Add indicator columns after processing
  return addIndicatorColumns(processedData, config);
}

// --- Public entry point ---

/**
 * Orchestrates the post-process workflow:
 * 1. Validates inputs (files exist, rules valid)
 * 2. Reads input CSV
 * 3. Loads and validates rules configuration
 * 4. Processes CSV data
 * 5. Writes output CSV
 * 6. Logs summary
 */
export async function runPostProcess(
  options: PostProcessOptions,
): Promise<string> {
  const logFileName = `post-process-${
    new Date().toISOString().split('T')[0]
  }.log`;
  const logger: Logger = await createLogger(
    options.verbose ?? false,
    logFileName,
  );

  logger.info('Starting post-process...');
  logger.info(`Input file: ${options.input}`);
  logger.info(`Rules file: ${options.rulesFile}`);

  // Validate input file exists
  const inputPath = resolve(process.cwd(), options.input);
  if (!existsSync(inputPath)) {
    throw new Error(`Input CSV file not found: ${inputPath}`);
  }

  // Validate and load rules file
  const rulesPath = resolve(process.cwd(), options.rulesFile);
  if (!existsSync(rulesPath)) {
    throw new Error(`Rules file not found: ${rulesPath}`);
  }

  let rulesConfig: PostProcessRulesConfig;
  try {
    const rulesContent = readFileSync(rulesPath, 'utf-8');
    const parsed = JSON.parse(rulesContent);
    rulesConfig = validateRulesConfig(parsed);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in rules file: ${error.message}`, {
        cause: error,
      });
    }
    throw error;
  }

  logger.info(`Rules loaded: ${rulesConfig.rules.length} rule(s)`);
  if (rulesConfig.processColumns) {
    logger.info('Process columns configuration provided');
  }
  if (rulesConfig.indicatorColumns) {
    logger.info(
      `Indicator columns: ${rulesConfig.indicatorColumns.length} configured`,
    );
  }

  // Read CSV data
  const csvData = readCsvFile(inputPath);
  if (csvData.length === 0) {
    logger.warn('Input CSV file is empty. No processing performed.');
    // Still write an empty output
    const outputFileName =
      options.outputFileName || generatePostProcessFileName();
    const outputPath = await resolveOutputPath(
      options.outputDir,
      outputFileName,
    );
    writeCsvFile(outputPath, [], []);
    logger.info(`Empty output written to: ${outputPath}`);
    logger.info(`output_file=${outputPath}`);
    return outputPath;
  }

  logger.info(
    `Input CSV: ${Object.keys(csvData[0]).length} columns, ${csvData.length} rows`,
  );

  // Process the data
  const processedData = processData(csvData, rulesConfig);

  // Determine output path
  const outputFileName =
    options.outputFileName || generatePostProcessFileName();
  const outputPath = await resolveOutputPath(options.outputDir, outputFileName);

  // Get headers from processed data (includes any new indicator columns)
  const headers = Object.keys(processedData[0]);

  // Write output
  writeCsvFile(outputPath, headers, processedData);

  logger.info(`Post-processing complete.`);
  logger.info(`  Input: ${csvData.length} rows`);
  logger.info(
    `  Output: ${processedData.length} rows, ${headers.length} columns`,
  );
  logger.info(`  Output file: ${outputPath}`);
  logger.info(`output_file=${outputPath}`);

  return outputPath;
}
