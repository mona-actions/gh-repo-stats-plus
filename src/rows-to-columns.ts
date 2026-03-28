import { existsSync } from 'fs';
import { readCsvFile, writeCsvFile } from './csv.js';
import { resolveOutputPath } from './utils.js';
import { createLogger } from './logger.js';
import { Logger } from './types.js';

// --- Types ---

export interface RowsToColumnsOptions {
  baseCsvFile: string;
  additionalCsvFile: string;
  headerColumnKeys: string;
  headerColumnValues: string;
  baseCsvColumns: string[];
  additionalCsvColumns: string[];
  outputFileName?: string;
  outputDir?: string;
  verbose?: boolean;
}

export interface RowsToColumnsResult {
  combinedData: Record<string, string>[];
  headerTypes: Set<string>;
}

// --- Filename generation ---

function generateTimestamp(): string {
  return new Date()
    .toISOString()
    .replace(/[-:T\.Z]/g, '')
    .slice(0, 12);
}

export function generateRowsToColumnsFileName(): string {
  const timestamp = generateTimestamp();
  return `rows-to-columns-${timestamp}_ts.csv`;
}

// --- Core logic ---

/**
 * Compares two string values in a case-insensitive, trimmed manner.
 */
function safeCompareValues(
  val1: string | undefined | null,
  val2: string | undefined | null,
): boolean {
  const stringVal1 = (val1 ?? '').toString().trim().toLowerCase();
  const stringVal2 = (val2 ?? '').toString().trim().toLowerCase();
  return stringVal1 === stringVal2;
}

/**
 * Converts rows from an additional CSV into new columns in a base CSV.
 *
 * For each row in the base CSV, finds matching rows in the additional CSV
 * based on the specified column mappings. When matches are found, new columns
 * are added to the base row with names taken from `headerColumnKeys` and
 * values taken from `headerColumnValues`.
 *
 * Values are parsed for digits:
 * - If digits are found in the value, the extracted digits become the new value
 * - If the row matched but no digits were found, the value is "1+"
 * - If no matching row exists, the value is "0"
 *
 * A `Has_Unmigratable` indicator column is also added to flag rows that had
 * any matching entries in the additional CSV.
 *
 * @param baseCsvData - Parsed rows from the base CSV file
 * @param additionalCsvData - Parsed rows from the additional CSV file
 * @param baseCsvColumns - Column names in the base CSV used for matching
 * @param additionalCsvColumns - Corresponding column names in the additional CSV
 * @param headerColumnKeys - Column in the additional CSV whose values become new column headers
 * @param headerColumnValues - Column in the additional CSV whose values become the cell values
 * @returns Combined data and set of unique header types found
 */
export function rowsToColumns(
  baseCsvData: Record<string, string>[],
  additionalCsvData: Record<string, string>[],
  baseCsvColumns: string[],
  additionalCsvColumns: string[],
  headerColumnKeys: string,
  headerColumnValues: string,
): RowsToColumnsResult {
  // Collect unique header key values from the additional CSV
  const headerTypes = new Set<string>();
  for (const row of additionalCsvData) {
    const keyValue = row[headerColumnKeys];
    if (keyValue !== undefined && keyValue !== '') {
      headerTypes.add(keyValue);
    }
  }

  const combinedData = baseCsvData.map((baseRow) => {
    // Find matching rows in the additional CSV
    const matchingRows = additionalCsvData.filter((additionalRow) =>
      baseCsvColumns.every((col, index) =>
        safeCompareValues(
          baseRow[col],
          additionalRow[additionalCsvColumns[index]],
        ),
      ),
    );

    // Start with a copy of the base row
    const combinedRow: Record<string, string> = { ...baseRow };

    // Initialize all header type columns to "0" (no match)
    for (const headerType of headerTypes) {
      combinedRow[headerType] = '0';
    }

    // Fill in values from matching rows
    for (const matchRow of matchingRows) {
      const key = matchRow[headerColumnKeys];
      const rawValue = matchRow[headerColumnValues] ?? '';

      // Parse digits from the value
      const digitMatch = rawValue.match(/(\d+)/);
      if (digitMatch) {
        combinedRow[key] = digitMatch[1];
      } else {
        // Row existed but no digits found
        combinedRow[key] = '1+';
      }
    }

    // Add Has_Unmigratable indicator
    combinedRow['Has_Unmigratable'] = matchingRows.length > 0 ? 'TRUE' : 'FALSE';

    return combinedRow;
  });

  return { combinedData, headerTypes };
}

/**
 * Determines the output CSV headers: base CSV headers + header types + Has_Unmigratable.
 */
export function determineHeaders(
  baseCsvData: Record<string, string>[],
  headerTypes: Set<string>,
): string[] {
  if (baseCsvData.length === 0) {
    return [...Array.from(headerTypes), 'Has_Unmigratable'];
  }
  return [
    ...Object.keys(baseCsvData[0]),
    ...Array.from(headerTypes),
    'Has_Unmigratable',
  ];
}

// --- Public entry point ---

/**
 * Orchestrates the rows-to-columns workflow:
 * 1. Validates inputs (files exist, columns provided)
 * 2. Reads both CSV files
 * 3. Converts rows to columns
 * 4. Writes the combined output CSV
 * 5. Logs a summary
 */
export async function runRowsToColumns(
  options: RowsToColumnsOptions,
): Promise<string> {
  const logFileName = `rows-to-columns-${
    new Date().toISOString().split('T')[0]
  }.log`;
  const logger: Logger = await createLogger(
    options.verbose ?? false,
    logFileName,
  );

  logger.info('Starting rows-to-columns...');
  logger.info(`Base CSV file: ${options.baseCsvFile}`);
  logger.info(`Additional CSV file: ${options.additionalCsvFile}`);
  logger.info(`Header column keys: ${options.headerColumnKeys}`);
  logger.info(`Header column values: ${options.headerColumnValues}`);
  logger.info(`Base CSV columns: ${options.baseCsvColumns.join(', ')}`);
  logger.info(
    `Additional CSV columns: ${options.additionalCsvColumns.join(', ')}`,
  );

  // Validate files exist
  if (!existsSync(options.baseCsvFile)) {
    throw new Error(`Base CSV file not found: ${options.baseCsvFile}`);
  }
  if (!existsSync(options.additionalCsvFile)) {
    throw new Error(
      `Additional CSV file not found: ${options.additionalCsvFile}`,
    );
  }

  // Read CSV files
  const baseCsvData = readCsvFile(options.baseCsvFile);
  logger.info(
    `Read base CSV: ${baseCsvData.length} rows`,
  );

  const additionalCsvData = readCsvFile(options.additionalCsvFile);
  logger.info(
    `Read additional CSV: ${additionalCsvData.length} rows`,
  );

  // Convert rows to columns
  logger.info('Converting rows to columns...');
  const { combinedData, headerTypes } = rowsToColumns(
    baseCsvData,
    additionalCsvData,
    options.baseCsvColumns,
    options.additionalCsvColumns,
    options.headerColumnKeys,
    options.headerColumnValues,
  );

  // Determine headers
  const headers = determineHeaders(baseCsvData, headerTypes);
  logger.info(`Output headers: ${headers.length} columns`);

  // Determine output path
  const outputFileName =
    options.outputFileName || generateRowsToColumnsFileName();
  const outputPath = await resolveOutputPath(options.outputDir, outputFileName);

  // Write output CSV
  writeCsvFile(outputPath, headers, combinedData);
  logger.info(`Output CSV written to: ${outputPath}`);

  logger.info(`Rows-to-columns complete:`);
  logger.info(`  Base rows: ${baseCsvData.length}`);
  logger.info(`  Additional rows: ${additionalCsvData.length}`);
  logger.info(`  Output rows: ${combinedData.length}`);
  logger.info(`  New columns added: ${headerTypes.size}`);
  logger.info(`  Total columns: ${headers.length}`);
  logger.info(`output_file=${outputPath}`);

  return outputPath;
}
