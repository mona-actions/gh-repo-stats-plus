import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { Logger } from './types.js';

// --- Shared column constants ---

export const REPO_STATS_COLUMNS = [
  'Org_Name',
  'Repo_Name',
  'Is_Empty',
  'Last_Push',
  'Last_Update',
  'isFork',
  'isArchived',
  'isTemplate',
  'Visibility',
  'Repo_Size_mb',
  'Record_Count',
  'Collaborator_Count',
  'Protected_Branch_Count',
  'PR_Review_Count',
  'Milestone_Count',
  'Issue_Count',
  'PR_Count',
  'PR_Review_Comment_Count',
  'Commit_Comment_Count',
  'Issue_Comment_Count',
  'Issue_Event_Count',
  'Release_Count',
  'Project_Count',
  'Branch_Count',
  'Tag_Count',
  'Discussion_Count',
  'Star_Count',
  'Fork_Count',
  'Watcher_Count',
  'Has_Wiki',
  'Has_LFS',
  'Default_Branch',
  'Primary_Language',
  'Languages',
  'License',
  'Topics',
  'Description',
  'Homepage_URL',
  'Auto_Merge_Allowed',
  'Delete_Branch_On_Merge',
  'Merge_Commit_Allowed',
  'Squash_Merge_Allowed',
  'Rebase_Merge_Allowed',
  'Full_URL',
  'Migration_Issue',
  'Created',
];

export const PROJECT_STATS_COLUMNS = [
  'Org_Name',
  'Repo_Name',
  'Issues_Linked_To_Projects',
  'Unique_Projects_Linked_By_Issues',
  'Projects_Linked_To_Repo',
];

/** Default columns used for matching/joining CSV files */
export const DEFAULT_MATCH_COLUMNS = ['Org_Name', 'Repo_Name'];

// --- CSV field escaping ---

/**
 * Escapes a value for safe inclusion in a CSV field per RFC 4180.
 * - Wraps in double quotes if the value contains commas, double quotes, or newlines
 * - Escapes embedded double quotes by doubling them
 */
export function escapeCsvField(value: unknown): string {
  const str = value?.toString() ?? '';
  if (
    str.includes(',') ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r')
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// --- CSV file initialization ---

/**
 * Creates a new CSV file with the specified column headers if it doesn't already exist.
 * If the file exists, logs a message and leaves it as-is for append operations.
 *
 * @param fileName - Full path to the CSV file
 * @param columns - Array of column header names
 * @param logger - Logger instance for status messages
 */
export function initializeCsvFile(
  fileName: string,
  columns: string[],
  logger: Logger,
): void {
  if (!existsSync(fileName)) {
    logger.info(`[csv] Creating new CSV file: ${fileName}`);
    const headerRow = `${columns.join(',')}\n`;
    writeFileSync(fileName, headerRow);
  } else {
    logger.info(`[csv] Using existing CSV file: ${fileName}`);
  }
}

// --- CSV row writing ---

/**
 * Appends a single row to an existing CSV file. All values are escaped per RFC 4180.
 *
 * @param fileName - Full path to the CSV file
 * @param values - Array of values (in column order) to write as a row
 * @param logger - Logger instance for status/error messages
 */
export function appendCsvRow(
  fileName: string,
  values: unknown[],
  logger: Logger,
): void {
  try {
    const escaped = values.map((v) => escapeCsvField(v));
    const csvRow = `${escaped.join(',')}\n`;
    appendFileSync(fileName, csvRow);
  } catch (error) {
    logger.error(
      `[csv] Failed to append CSV row: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    throw error;
  }
}

// --- CSV file reading ---

/**
 * Reads and parses a CSV file into an array of row objects keyed by header names.
 *
 * @param filePath - Full path to the CSV file to read
 * @returns Array of record objects where keys are column headers
 * @throws Error if the file does not exist or cannot be parsed
 */
export function readCsvFile(filePath: string): Record<string, string>[] {
  if (!existsSync(filePath)) {
    throw new Error(`CSV file not found: ${filePath}`);
  }

  const fileContent = readFileSync(filePath, 'utf-8');
  return parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
  }) as Record<string, string>[];
}

// --- CSV file writing (complete file) ---

/**
 * Writes a complete CSV file from headers and row objects.
 * Each value is escaped per RFC 4180.
 *
 * @param filePath - Full path for the output CSV file
 * @param headers - Array of column header names (determines column order)
 * @param rows - Array of row objects keyed by header names
 */
export function writeCsvFile(
  filePath: string,
  headers: string[],
  rows: Record<string, string>[],
): void {
  const headerRow = headers.join(',') + '\n';
  const dataRows = rows
    .map((row) => headers.map((h) => escapeCsvField(row[h] ?? '')).join(','))
    .join('\n');

  const content = dataRows.length > 0 ? headerRow + dataRows + '\n' : headerRow;
  writeFileSync(filePath, content);
}
