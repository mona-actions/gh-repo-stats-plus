import { existsSync, readFileSync } from 'fs';
import { isAbsolute, resolve } from 'path';

export interface RepoListFileSource {
  readonly kind: 'repo-list-file';
  readonly sourcePath: string;
  readonly content: string;
}

export type RepoListInput = readonly string[] | string | RepoListFileSource;
export type RepoListOptionValue = RepoListInput | undefined;

export interface RepoListLineMetadata {
  readonly sourcePath?: string;
  readonly lineNumber: number;
  readonly originalLine: string;
}

export interface NormalizedRepoListEntry extends RepoListLineMetadata {
  readonly owner: string;
  readonly repo: string;
  readonly ownerKey: string;
  readonly repoKey: string;
  readonly key: string;
}

export interface DuplicateRepoListEntry extends NormalizedRepoListEntry {
  readonly firstOccurrence: RepoListLineMetadata;
}

export interface RepoListOwnerGroup {
  readonly owner: string;
  readonly ownerKey: string;
  readonly entries: readonly NormalizedRepoListEntry[];
}

interface MutableRepoListOwnerGroup {
  owner: string;
  ownerKey: string;
  entries: NormalizedRepoListEntry[];
}

export interface RepoListNormalizationSummary {
  readonly totalInputLines: number;
  readonly ignoredLineCount: number;
  readonly uniqueEntryCount: number;
  readonly duplicateEntryCount: number;
  readonly ownerCount: number;
}

export interface NormalizedRepoList {
  readonly entries: readonly NormalizedRepoListEntry[];
  readonly duplicates: readonly DuplicateRepoListEntry[];
  readonly groupedByOwner: ReadonlyMap<string, RepoListOwnerGroup>;
  readonly summary: RepoListNormalizationSummary;
}

export interface ParseRepoListOptions {
  readonly sourcePath?: string;
}

export function resolveRepoListPath(filePath: string): string {
  if (isAbsolute(filePath)) {
    return filePath;
  }

  const invocationDir = process.env.GH_REPO_STATS_PLUS_INVOCATION_DIR;
  const baseDir =
    invocationDir && invocationDir.trim() !== ''
      ? invocationDir
      : process.cwd();

  return resolve(baseDir, filePath);
}

export function parseRepoListFileOption(
  filePath: string,
  previous?: string[] | RepoListFileSource,
): RepoListFileSource | string[] | undefined {
  if (!filePath || filePath.trim() === '') {
    return previous;
  }

  const resolvedPath = resolveRepoListPath(filePath);

  if (!existsSync(resolvedPath)) {
    throw new Error(
      `Repo-list file not found: ${filePath} (resolved path: ${resolvedPath})`,
    );
  }

  const fileContent = readFileSync(resolvedPath, 'utf-8');
  return {
    kind: 'repo-list-file',
    sourcePath: resolvedPath,
    content: fileContent,
  };
}

export function isRepoListFileSource(
  repoList: RepoListOptionValue,
): repoList is RepoListFileSource {
  return (
    typeof repoList === 'object' &&
    repoList !== null &&
    !Array.isArray(repoList) &&
    'kind' in repoList &&
    repoList.kind === 'repo-list-file'
  );
}

export function hasRepoListInput(repoList: RepoListOptionValue): boolean {
  if (Array.isArray(repoList)) {
    return repoList.length > 0;
  }

  if (isRepoListFileSource(repoList)) {
    return true;
  }

  return typeof repoList === 'string' && repoList.trim() !== '';
}

export function hasEmptyParsedRepoList(repoList: RepoListOptionValue): boolean {
  return Array.isArray(repoList) && repoList.length === 0;
}

export function parseRepoListInput(
  repoList: RepoListOptionValue,
): NormalizedRepoList {
  if (isRepoListFileSource(repoList)) {
    return parseRepoList(repoList.content, {
      sourcePath: repoList.sourcePath,
    });
  }

  if (Array.isArray(repoList)) {
    return parseRepoList(repoList);
  }

  if (typeof repoList === 'string' && repoList.trim() !== '') {
    const resolvedPath = resolveRepoListPath(repoList);
    if (existsSync(resolvedPath)) {
      return parseRepoList(readFileSync(resolvedPath, 'utf-8'), {
        sourcePath: resolvedPath,
      });
    }

    return parseRepoList(repoList);
  }

  return parseRepoList([]);
}

export function readRepoListInputLines(
  repoList: RepoListOptionValue,
): readonly string[] {
  if (isRepoListFileSource(repoList)) {
    return repoList.content.split(/\r?\n/);
  }

  if (Array.isArray(repoList)) {
    return repoList;
  }

  if (typeof repoList === 'string' && repoList.trim() !== '') {
    const resolvedPath = resolveRepoListPath(repoList);
    if (existsSync(resolvedPath)) {
      return readFileSync(resolvedPath, 'utf-8').split(/\r?\n/);
    }

    return repoList.split(/\r?\n/);
  }

  return [];
}

export class RepoListParseError extends Error {
  readonly sourcePath?: string;
  readonly lineNumber: number;
  readonly line: string;

  constructor({
    message,
    sourcePath,
    lineNumber,
    line,
  }: {
    message: string;
    sourcePath?: string;
    lineNumber: number;
    line: string;
  }) {
    super(
      `${sourcePath ? `${sourcePath}:` : ''}${lineNumber}: ${message}: "${line}"`,
    );
    this.name = 'RepoListParseError';
    this.sourcePath = sourcePath;
    this.lineNumber = lineNumber;
    this.line = line;
  }
}

export function parseRepoList(
  input: string | readonly string[],
  options: ParseRepoListOptions = {},
): NormalizedRepoList {
  const lines = typeof input === 'string' ? input.split(/\r?\n/) : [...input];
  const entries: NormalizedRepoListEntry[] = [];
  const duplicates: DuplicateRepoListEntry[] = [];
  const firstEntriesByKey = new Map<string, NormalizedRepoListEntry>();
  let ignoredLineCount = 0;

  for (const [index, originalLine] of lines.entries()) {
    const lineNumber = index + 1;
    const trimmed = originalLine.trim();

    if (trimmed === '' || trimmed.startsWith('#')) {
      ignoredLineCount++;
      continue;
    }

    const parsed = parseRepoListLine({
      trimmed,
      originalLine,
      lineNumber,
      sourcePath: options.sourcePath,
    });

    const firstEntry = firstEntriesByKey.get(parsed.key);
    if (firstEntry) {
      duplicates.push({
        ...parsed,
        firstOccurrence: {
          sourcePath: firstEntry.sourcePath,
          lineNumber: firstEntry.lineNumber,
          originalLine: firstEntry.originalLine,
        },
      });
      continue;
    }

    firstEntriesByKey.set(parsed.key, parsed);
    entries.push(parsed);
  }

  const groupedByOwner = groupRepoListEntriesByOwner(entries);

  return {
    entries,
    duplicates,
    groupedByOwner,
    summary: {
      totalInputLines: lines.length,
      ignoredLineCount,
      uniqueEntryCount: entries.length,
      duplicateEntryCount: duplicates.length,
      ownerCount: groupedByOwner.size,
    },
  };
}

export function normalizeRepoListKeySegment(value: string): string {
  return value.trim().toLowerCase();
}

export function createRepoListKey(owner: string, repo: string): string {
  return `${normalizeRepoListKeySegment(owner)}/${normalizeRepoListKeySegment(
    repo,
  )}`;
}

function parseRepoListLine({
  trimmed,
  originalLine,
  lineNumber,
  sourcePath,
}: {
  trimmed: string;
  originalLine: string;
  lineNumber: number;
  sourcePath?: string;
}): NormalizedRepoListEntry {
  const segments = trimmed.split('/');

  if (segments.length !== 2) {
    throw new RepoListParseError({
      message: 'Expected repo-list entry in owner/repo format',
      sourcePath,
      lineNumber,
      line: trimmed,
    });
  }

  const owner = segments[0].trim();
  const repo = segments[1].trim();

  if (owner === '' || repo === '') {
    throw new RepoListParseError({
      message: 'Repo-list entry requires both owner and repo',
      sourcePath,
      lineNumber,
      line: trimmed,
    });
  }

  const ownerKey = normalizeRepoListKeySegment(owner);
  const repoKey = normalizeRepoListKeySegment(repo);

  return {
    owner,
    repo,
    ownerKey,
    repoKey,
    key: createRepoListKey(owner, repo),
    sourcePath,
    lineNumber,
    originalLine,
  };
}

function groupRepoListEntriesByOwner(
  entries: readonly NormalizedRepoListEntry[],
): Map<string, RepoListOwnerGroup> {
  const groupedByOwner = new Map<string, MutableRepoListOwnerGroup>();

  for (const entry of entries) {
    let group = groupedByOwner.get(entry.ownerKey);
    if (!group) {
      group = {
        owner: entry.owner,
        ownerKey: entry.ownerKey,
        entries: [],
      };
      groupedByOwner.set(entry.ownerKey, group);
    }

    group.entries.push(entry);
  }

  return groupedByOwner;
}
