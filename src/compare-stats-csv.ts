import {
  appendCsvRow,
  COMPARE_STATS_COLUMNS,
  readCsvMatrix,
  REPO_STATS_COLUMNS,
} from './csv.js';
import type { CompareFinding } from './compare-stats-types.js';
import type { Logger } from './types.js';

export interface StatsCsvFile {
  headers: string[];
  rows: Record<string, string>[];
}

export function readStatsCsv(filePath: string, label: string): StatsCsvFile {
  const matrix = readCsvMatrix(filePath);
  if (matrix.length === 0) {
    throw new Error(`${label} file is empty: ${filePath}`);
  }

  const headers = matrix[0].map((header) => header.trim());
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

export function validateStatsHeaders(
  headers: string[],
  label: string,
  filePath?: string,
): void {
  const present = new Set(headers.map((header) => header.trim()));
  const missing = REPO_STATS_COLUMNS.filter((column) => !present.has(column));

  if (missing.length > 0) {
    const location = filePath ? ` (${filePath})` : '';
    throw new Error(
      `${label} file is missing required repo-stats column(s)${location}: ${missing.join(', ')}`,
    );
  }
}

export function writeCompareFinding(
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
