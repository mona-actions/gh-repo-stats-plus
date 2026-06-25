import { existsSync, readFileSync, writeFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { createLogger } from './logger.js';
import { Logger } from './types.js';
import { resolveOutputPath } from './utils.js';

export type CsvToMarkdownFormat = 'table' | 'vertical';

export interface CsvToMarkdownOptions {
  input: string;
  format?: CsvToMarkdownFormat;
  title?: string;
  outputFileName?: string;
  outputDir?: string;
  verbose?: boolean;
}

function generateTimestamp(): string {
  return new Date()
    .toISOString()
    .replace(/[-:T\.Z]/g, '')
    .slice(0, 12);
}

export function generateCsvToMarkdownFileName(): string {
  const timestamp = generateTimestamp();
  return `csv-to-markdown-${timestamp}_ts.md`;
}

export function parseCsvMatrix(fileContent: string): string[][] {
  return parse(fileContent, {
    skip_empty_lines: true,
  }) as string[][];
}

function escapeMarkdownCell(value: string | undefined): string {
  return (value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function renderMarkdownTable(headers: string[], rows: string[][]): string {
  const headerRow = `| ${headers.map(escapeMarkdownCell).join(' | ')} |`;
  const separatorRow = `| ${headers.map(() => '---').join(' | ')} |`;
  const dataRows = rows.map((row) => {
    const normalizedRow = headers.map((_, index) =>
      escapeMarkdownCell(row[index]),
    );
    return `| ${normalizedRow.join(' | ')} |`;
  });

  return [headerRow, separatorRow, ...dataRows].join('\n');
}

export function csvToMarkdownTable(csvRows: string[][]): string {
  if (csvRows.length === 0) {
    throw new Error('CSV file is empty');
  }

  const [headers, ...rows] = csvRows;
  return renderMarkdownTable(headers, rows);
}

export function csvToVerticalMarkdown(csvRows: string[][]): string {
  if (csvRows.length === 0) {
    throw new Error('CSV file is empty');
  }

  if (csvRows.length < 2) {
    throw new Error(
      'Vertical markdown format requires at least one data row in the CSV file',
    );
  }

  const headers = csvRows[0];
  const values = csvRows[csvRows.length - 1];
  const rows = headers.map((header, index) => [header, values[index] ?? '']);

  return renderMarkdownTable(['Metric', 'Value'], rows);
}

export function addMarkdownTitle(markdown: string, title?: string): string {
  if (!title || title.trim() === '') {
    return markdown;
  }

  return `## ${title}\n\n${markdown}`;
}

export async function runCsvToMarkdown(
  options: CsvToMarkdownOptions,
): Promise<string> {
  const logFileName = `csv-to-markdown-${
    new Date().toISOString().split('T')[0]
  }.log`;
  const logger: Logger = await createLogger(
    options.verbose ?? false,
    logFileName,
  );
  const format = options.format ?? 'table';

  logger.info('Starting csv-to-markdown...');
  logger.info(`Input CSV file: ${options.input}`);
  logger.info(`Markdown format: ${format}`);

  if (options.title) {
    logger.info(`Markdown title: ${options.title}`);
  }

  if (!existsSync(options.input)) {
    throw new Error(`Input CSV file not found: ${options.input}`);
  }

  const fileContent = readFileSync(options.input, 'utf-8');
  const csvRows = parseCsvMatrix(fileContent);
  logger.info(`Read CSV rows: ${csvRows.length}`);

  const markdownBody =
    format === 'vertical'
      ? csvToVerticalMarkdown(csvRows)
      : csvToMarkdownTable(csvRows);
  const markdown = addMarkdownTitle(markdownBody, options.title) + '\n';

  const outputFileName =
    options.outputFileName || generateCsvToMarkdownFileName();
  const outputPath = await resolveOutputPath(options.outputDir, outputFileName);

  writeFileSync(outputPath, markdown);
  logger.info(`Output markdown written to: ${outputPath}`);
  logger.info(`output_file=${outputPath}`);

  return outputPath;
}
