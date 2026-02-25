import { mkdir } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

export function generateRepoStatsFileName(orgName: string): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:T\.Z]/g, '')
    .slice(0, 12);
  return `${orgName.toLowerCase()}-all_repos-${timestamp}_ts.csv`;
}

export function generateProjectStatsFileName(orgName: string): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:T\.Z]/g, '')
    .slice(0, 12);
  return `${orgName.toLowerCase()}-project-stats-${timestamp}_ts.csv`;
}

/**
 * Converts kilobytes to megabytes
 * @param kb Size in kilobytes, can be null or undefined
 * @returns Size in megabytes
 */
export function convertKbToMb(kb: number | null | undefined): number {
  if (kb == null) {
    return 0;
  }
  return kb / 1024;
}

/**
 * Checks whether a `.gitattributes` file content indicates Git LFS tracking.
 * Looks for lines containing `filter=lfs` which is the standard marker set by `git lfs track`.
 *
 * @param gitattributesText - The text content of a `.gitattributes` file, or null/undefined if the file doesn't exist
 * @returns true if any line contains `filter=lfs`, false otherwise
 */
export function hasLfsTracking(
  gitattributesText: string | null | undefined,
): boolean {
  if (!gitattributesText) {
    return false;
  }
  return gitattributesText
    .split(/\r?\n/)
    .some((line) => line.includes('filter=lfs'));
}

export function checkIfHasMigrationIssues({
  repoSizeMb,
  totalRecordCount,
}: {
  repoSizeMb: number;
  totalRecordCount: number;
}): boolean {
  if (totalRecordCount >= 60000) {
    return true;
  }
  if (repoSizeMb > 1500) {
    return true;
  }
  return false;
}

export function parseIntOption(value: string, defaultValue?: number): number {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Invalid number: ${value}`);
  }
  return parsed;
}

export function parseFloatOption(value: string, defaultValue?: number): number {
  const parsed = parseFloat(value);
  if (isNaN(parsed)) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Invalid number: ${value}`);
  }
  return parsed;
}

export function parseBooleanOption(
  value: string | undefined | boolean,
): boolean {
  // If value is a boolean, return it as-is
  if (typeof value === 'boolean') {
    return value;
  }

  // If value is undefined or empty, return false (default when not provided)
  if (!value) {
    return false;
  }

  const normalized = value.toLowerCase().trim();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  throw new Error(`Invalid boolean value: ${value}`);
}

export function formatElapsedTime(startTime: Date, endTime: Date): string {
  const elapsed = endTime.getTime() - startTime.getTime();
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
}

/**
 * Creates the output directory if it doesn't exist and returns the full path for a file
 * @param outputDir The output directory (defaults to 'output')
 * @param fileName The file name
 * @returns The full path to the file
 */
export async function resolveOutputPath(
  outputDir: string | undefined,
  fileName: string,
): Promise<string> {
  // Normalize outputDir: if empty, null, or undefined, default to 'output'
  const normalizedOutputDir =
    outputDir && outputDir.trim() !== '' ? outputDir : 'output';
  const fullOutputDir = resolve(process.cwd(), normalizedOutputDir);

  // Create directory - mkdir with recursive option handles existing directories gracefully
  await mkdir(fullOutputDir, { recursive: true });

  return resolve(fullOutputDir, fileName);
}

/**
 * Parses a comma-separated string into an array of trimmed strings.
 * Designed to be used as a Commander.js argParser for options that accept
 * comma-separated values or can be specified multiple times.
 *
 * @param value - A comma-separated string of values (e.g., "item1, item2, item3")
 * @param previous - Optional array of previously parsed values (for Commander.js accumulator pattern)
 * @returns An array of trimmed strings. Returns empty array if value is empty/undefined.
 *
 * @example
 * // Basic usage
 * parseCommaSeparatedOption('foo, bar, baz') // ['foo', 'bar', 'baz']
 *
 * @example
 * // With Commander.js option
 * new Option('--repos <repos>', 'Repositories to process')
 *   .argParser(parseCommaSeparatedOption)
 *
 * @example
 * // Accumulator pattern (multiple --repos flags)
 * // --repos repo1,repo2 --repos repo3
 * parseCommaSeparatedOption('repo3', ['repo1', 'repo2']) // ['repo1', 'repo2', 'repo3']
 */
export function parseCommaSeparatedOption(
  value: string,
  previous?: string[],
): string[] {
  if (!value) {
    return Array.isArray(previous) ? previous : [];
  }

  const parsed = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
  return Array.isArray(previous) ? [...previous, ...parsed] : parsed;
}

/**
 * Parses a newline-separated string into an array of trimmed strings.
 * Designed to be used as a Commander.js argParser for options that accept
 * newline-separated values (e.g., from file contents or multi-line input).
 * Handles both Unix (\n) and Windows (\r\n) line endings.
 *
 * @param value - A newline-separated string of values
 * @param previous - Optional array of previously parsed values (for Commander.js accumulator pattern)
 * @returns An array of trimmed strings. Returns empty array if value is empty/undefined.
 *
 * @example
 * // Basic usage
 * parseNewlineSeparatedOption('foo\nbar\nbaz') // ['foo', 'bar', 'baz']
 *
 * @example
 * // With Commander.js option (useful for reading from files)
 * new Option('--org-list <orgs>', 'Organizations to process')
 *   .argParser(parseNewlineSeparatedOption)
 *
 * @example
 * // Handles Windows line endings
 * parseNewlineSeparatedOption('foo\r\nbar\r\nbaz') // ['foo', 'bar', 'baz']
 *
 * @example
 * // Filters comments (lines starting with #) and empty lines
 * parseNewlineSeparatedOption('org1\n# comment\norg2\n\norg3') // ['org1', 'org2', 'org3']
 */
export function parseNewlineSeparatedOption(
  value: string,
  previous?: string[],
): string[] {
  if (!value) {
    return previous ?? [];
  }

  const parsed = value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item) => item !== '' && !item.startsWith('#'));
  return previous ? [...previous, ...parsed] : parsed;
}

/**
 * Reads a file and parses its contents as newline-separated values.
 * Designed to be used as a Commander.js argParser for options that accept
 * a file path containing a list of items (one per line).
 *
 * @param filePath - Path to a file containing newline-separated values
 * @param previous - Optional array of previously parsed values (for Commander.js accumulator pattern)
 * @returns An array of trimmed strings from the file. Filters empty lines and comments (#).
 * @throws Error if the file does not exist or cannot be read
 *
 * @example
 * // With Commander.js option
 * new Option('--org-list <file>', 'Path to file containing organizations')
 *   .argParser(parseFileAsNewlineSeparatedOption)
 *
 * @example
 * // File contents (orgs.txt):
 * // org1
 * // # this is a comment
 * // org2
 * // org3
 * parseFileAsNewlineSeparatedOption('orgs.txt') // ['org1', 'org2', 'org3']
 *
 * @example
 * // Accumulator pattern (multiple --org-list flags)
 * // --org-list file1.txt --org-list file2.txt
 * parseFileAsNewlineSeparatedOption('file2.txt', ['org1', 'org2']) // ['org1', 'org2', 'org3', 'org4']
 */
export function parseFileAsNewlineSeparatedOption(
  filePath: string,
  previous?: string[],
): string[] {
  if (!filePath) {
    return previous ?? [];
  }

  const resolvedPath = resolve(process.cwd(), filePath);

  if (!existsSync(resolvedPath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const fileContent = readFileSync(resolvedPath, 'utf-8');
  return parseNewlineSeparatedOption(fileContent, previous);
}

export function generateCombinedStatsFileName(): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:T\.Z]/g, '')
    .slice(0, 12);
  return `combined-stats-${timestamp}_ts.csv`;
}
