import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import {
  parseRepoList,
  parseRepoListInput,
  parseRepoListFileOption,
  RepoListParseError,
  resolveRepoListPath,
  isRepoListFileSource,
} from '../src/repo-list.js';
import { parseFileAsNewlineSeparatedOption } from '../src/utils.js';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

describe('parseRepoList', () => {
  it('normalizes strict owner/repo entries with source metadata', () => {
    const result = parseRepoList(
      ['# comment', ' GitHub/Repo-Stats ', '', 'octo-org/hello-world'],
      { sourcePath: 'repos.txt' },
    );

    expect(result.entries).toEqual([
      {
        owner: 'GitHub',
        repo: 'Repo-Stats',
        ownerKey: 'github',
        repoKey: 'repo-stats',
        key: 'github/repo-stats',
        sourcePath: 'repos.txt',
        lineNumber: 2,
        originalLine: ' GitHub/Repo-Stats ',
      },
      {
        owner: 'octo-org',
        repo: 'hello-world',
        ownerKey: 'octo-org',
        repoKey: 'hello-world',
        key: 'octo-org/hello-world',
        sourcePath: 'repos.txt',
        lineNumber: 4,
        originalLine: 'octo-org/hello-world',
      },
    ]);
    expect(result.summary).toEqual({
      totalInputLines: 4,
      ignoredLineCount: 2,
      uniqueEntryCount: 2,
      duplicateEntryCount: 0,
      ownerCount: 2,
    });
  });

  it('dedupes case-insensitive owner/repo duplicates and preserves first occurrence order', () => {
    const result = parseRepoList(
      [
        'GitHub/repo-stats',
        'octo-org/alpha',
        'github/REPO-STATS',
        'Octo-Org/Alpha',
        'octo-org/beta',
      ],
      { sourcePath: 'repos.txt' },
    );

    expect(result.entries.map((entry) => entry.key)).toEqual([
      'github/repo-stats',
      'octo-org/alpha',
      'octo-org/beta',
    ]);
    expect(result.duplicates).toEqual([
      expect.objectContaining({
        owner: 'github',
        repo: 'REPO-STATS',
        key: 'github/repo-stats',
        lineNumber: 3,
        firstOccurrence: {
          sourcePath: 'repos.txt',
          lineNumber: 1,
          originalLine: 'GitHub/repo-stats',
        },
      }),
      expect.objectContaining({
        owner: 'Octo-Org',
        repo: 'Alpha',
        key: 'octo-org/alpha',
        lineNumber: 4,
        firstOccurrence: {
          sourcePath: 'repos.txt',
          lineNumber: 2,
          originalLine: 'octo-org/alpha',
        },
      }),
    ]);
    expect(result.summary.duplicateEntryCount).toBe(2);
  });

  it('groups owners in one insertion-ordered map by first owner appearance', () => {
    const result = parseRepoList([
      'octo-org/alpha',
      'github/repo-stats',
      'Octo-Org/beta',
      'github/actions',
    ]);

    expect([...result.groupedByOwner.keys()]).toEqual(['octo-org', 'github']);
    expect(result.groupedByOwner.get('octo-org')).toEqual({
      owner: 'octo-org',
      ownerKey: 'octo-org',
      entries: [result.entries[0], result.entries[2]],
    });
    expect(result.groupedByOwner.get('github')?.entries).toEqual([
      result.entries[1],
      result.entries[3],
    ]);
    expect(result.summary.ownerCount).toBe(2);
  });

  it.each([
    {
      line: 'repo-only',
      message: 'Expected repo-list entry in owner/repo format',
    },
    {
      line: 'owner/repo/extra',
      message: 'Expected repo-list entry in owner/repo format',
    },
    { line: '/repo', message: 'Repo-list entry requires both owner and repo' },
    { line: 'owner/', message: 'Repo-list entry requires both owner and repo' },
  ])('throws clear errors for malformed line "$line"', ({ line, message }) => {
    expect(() =>
      parseRepoList(['valid/repo', line], { sourcePath: 'repos.txt' }),
    ).toThrow(
      new RepoListParseError({
        message,
        sourcePath: 'repos.txt',
        lineNumber: 2,
        line,
      }),
    );
  });

  it('parses string contents with mixed Unix and Windows line endings', () => {
    const result = parseRepoList('github/actions\r\nocto-org/hello\n');

    expect(result.entries.map(({ owner, repo }) => ({ owner, repo }))).toEqual([
      { owner: 'github', repo: 'actions' },
      { owner: 'octo-org', repo: 'hello' },
    ]);
    expect(result.summary.totalInputLines).toBe(3);
    expect(result.summary.ignoredLineCount).toBe(1);
  });
});

describe('repo-list file path parsing', () => {
  const originalInvocationDir = process.env.GH_REPO_STATS_PLUS_INVOCATION_DIR;
  const originalCwd = process.cwd();

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GH_REPO_STATS_PLUS_INVOCATION_DIR;
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (originalInvocationDir === undefined) {
      delete process.env.GH_REPO_STATS_PLUS_INVOCATION_DIR;
    } else {
      process.env.GH_REPO_STATS_PLUS_INVOCATION_DIR = originalInvocationDir;
    }
  });

  it('resolves relative repo-list paths from the wrapper invocation directory', () => {
    process.env.GH_REPO_STATS_PLUS_INVOCATION_DIR = '/users/me/project';
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      'github/repo-stats\n# comment\nocto-org/hello\n',
    );

    const source = parseRepoListFileOption('lists/repos.txt');
    expect(source).toEqual({
      kind: 'repo-list-file',
      sourcePath: '/users/me/project/lists/repos.txt',
      content: 'github/repo-stats\n# comment\nocto-org/hello\n',
    });
    expect(parseRepoListInput(source).entries.map(({ key }) => key)).toEqual([
      'github/repo-stats',
      'octo-org/hello',
    ]);
    expect(existsSync).toHaveBeenCalledWith(
      '/users/me/project/lists/repos.txt',
    );
    expect(readFileSync).toHaveBeenCalledWith(
      '/users/me/project/lists/repos.txt',
      'utf-8',
    );
  });

  it('preserves absolute repo-list paths', () => {
    process.env.GH_REPO_STATS_PLUS_INVOCATION_DIR = '/users/me/project';

    expect(resolveRepoListPath('/absolute/repos.txt')).toBe(
      '/absolute/repos.txt',
    );
  });

  it('falls back to process.cwd when invocation directory is unset', () => {
    expect(resolveRepoListPath('repos.txt')).toBe(`${originalCwd}/repos.txt`);
  });

  it('includes the original and resolved paths when a repo-list file is missing', () => {
    process.env.GH_REPO_STATS_PLUS_INVOCATION_DIR = '/users/me/project';
    vi.mocked(existsSync).mockReturnValue(false);

    expect(() => parseRepoListFileOption('missing/repos.txt')).toThrow(
      'Repo-list file not found: missing/repos.txt (resolved path: /users/me/project/missing/repos.txt)',
    );
  });

  it('treats empty repo-list option values as absent', () => {
    expect(parseRepoListFileOption('')).toBeUndefined();
    expect(parseRepoListFileOption('   ')).toBeUndefined();
    expect(parseRepoListFileOption('', ['github/repo-stats'])).toEqual([
      'github/repo-stats',
    ]);
    expect(existsSync).not.toHaveBeenCalled();
    expect(readFileSync).not.toHaveBeenCalled();
  });

  it('preserves source path and original line numbers from repo-list files', () => {
    process.env.GH_REPO_STATS_PLUS_INVOCATION_DIR = '/users/me/project';
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      '# comment\n\n  github/repo-stats  \ninvalid-entry\n',
    );

    const source = parseRepoListFileOption('lists/repos.txt');

    expect(() => parseRepoListInput(source)).toThrow(
      new RepoListParseError({
        message: 'Expected repo-list entry in owner/repo format',
        sourcePath: '/users/me/project/lists/repos.txt',
        lineNumber: 4,
        line: 'invalid-entry',
      }),
    );
  });

  it('preserves original line text and duplicate first occurrence metadata from files', () => {
    process.env.GH_REPO_STATS_PLUS_INVOCATION_DIR = '/users/me/project';
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      '# comment\n\n  GitHub/Repo-Stats  \ngithub/repo-stats\n',
    );

    const source = parseRepoListFileOption('lists/repos.txt');
    const result = parseRepoListInput(source);

    expect(result.entries[0]).toEqual(
      expect.objectContaining({
        key: 'github/repo-stats',
        lineNumber: 3,
        originalLine: '  GitHub/Repo-Stats  ',
        sourcePath: '/users/me/project/lists/repos.txt',
      }),
    );
    expect(result.duplicates[0]).toEqual(
      expect.objectContaining({
        key: 'github/repo-stats',
        lineNumber: 4,
        firstOccurrence: {
          sourcePath: '/users/me/project/lists/repos.txt',
          lineNumber: 3,
          originalLine: '  GitHub/Repo-Stats  ',
        },
      }),
    );
  });

  it('identifies structured repo-list file sources', () => {
    process.env.GH_REPO_STATS_PLUS_INVOCATION_DIR = '/users/me/project';
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('github/repo-stats\n');

    expect(isRepoListFileSource(parseRepoListFileOption('repos.txt'))).toBe(
      true,
    );
    expect(isRepoListFileSource(['github/repo-stats'])).toBe(false);
  });

  it('does not apply the wrapper invocation directory to org-list file parsing', () => {
    process.env.GH_REPO_STATS_PLUS_INVOCATION_DIR = '/users/me/project';
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('org-one\n# comment\norg-two\n');

    expect(parseFileAsNewlineSeparatedOption('orgs.txt')).toEqual([
      'org-one',
      'org-two',
    ]);
    expect(existsSync).toHaveBeenCalledWith(`${originalCwd}/orgs.txt`);
    expect(readFileSync).toHaveBeenCalledWith(
      `${originalCwd}/orgs.txt`,
      'utf-8',
    );
  });
});
