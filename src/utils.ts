import { mkdir } from 'fs/promises';
import { resolve } from 'path';

export function generateRepoStatsFileName(orgName: string): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:T\.Z]/g, '')
    .slice(0, 12);
  return `${orgName.toLowerCase()}-all_repos-${timestamp}_ts.csv`;
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
