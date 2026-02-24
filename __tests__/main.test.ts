import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMockRepositoryStats,
  createMockRepoStatsResult,
  createMockIssueStats,
  createMockPrStats,
  createMockLogger,
} from './test-utils.js';

// Mock fs module
vi.mock('fs');

import { existsSync, writeFileSync, appendFileSync } from 'fs';
import {
  initializeCsvFile,
  writeResultToCsv,
  mapToRepoStatsResult,
} from '../src/main.js';

describe('initializeCsvFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create CSV file with all column headers when file does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const logger = createMockLogger();

    initializeCsvFile('test-output.csv', logger);

    expect(writeFileSync).toHaveBeenCalledTimes(1);
    const writtenContent = vi.mocked(writeFileSync).mock.calls[0][1] as string;

    // Verify all expected column headers are present
    const expectedColumns = [
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

    for (const col of expectedColumns) {
      expect(writtenContent).toContain(col);
    }
  });

  it('should include all 45 columns in correct order', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const logger = createMockLogger();

    initializeCsvFile('test-output.csv', logger);

    const writtenContent = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    const headerLine = writtenContent.trim();
    const columns = headerLine.split(',');

    expect(columns).toHaveLength(45);

    // Verify column order for new columns relative to neighbors
    const isTemplateIdx = columns.indexOf('isTemplate');
    const isArchivedIdx = columns.indexOf('isArchived');
    const visibilityIdx = columns.indexOf('Visibility');
    expect(isTemplateIdx).toBe(isArchivedIdx + 1);
    expect(visibilityIdx).toBe(isTemplateIdx + 1);

    const discussionIdx = columns.indexOf('Discussion_Count');
    const starIdx = columns.indexOf('Star_Count');
    const forkCountIdx = columns.indexOf('Fork_Count');
    const watcherIdx = columns.indexOf('Watcher_Count');
    expect(starIdx).toBe(discussionIdx + 1);
    expect(forkCountIdx).toBe(starIdx + 1);
    expect(watcherIdx).toBe(forkCountIdx + 1);

    const hasWikiIdx = columns.indexOf('Has_Wiki');
    expect(hasWikiIdx).toBe(watcherIdx + 1);

    const defaultBranchIdx = columns.indexOf('Default_Branch');
    expect(defaultBranchIdx).toBe(hasWikiIdx + 1);
  });

  it('should not overwrite existing file', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const logger = createMockLogger();

    initializeCsvFile('existing-output.csv', logger);

    expect(writeFileSync).not.toHaveBeenCalled();
  });
});

describe('writeResultToCsv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should write all fields to CSV in correct order', async () => {
    const logger = createMockLogger();
    const result = createMockRepoStatsResult();

    await writeResultToCsv(result, 'test-output.csv', logger);

    expect(appendFileSync).toHaveBeenCalledTimes(1);
    const writtenRow = vi.mocked(appendFileSync).mock.calls[0][1] as string;

    // Verify new fields are present in the output
    expect(writtenRow).toContain('PUBLIC'); // Visibility
    expect(writtenRow).toContain('42'); // Star_Count
    expect(writtenRow).toContain('main'); // Default_Branch
    expect(writtenRow).toContain('TypeScript'); // Primary_Language
    expect(writtenRow).toContain('MIT'); // License
  });

  it('should uppercase boolean fields', async () => {
    const logger = createMockLogger();
    const result = createMockRepoStatsResult({
      isTemplate: true,
      Auto_Merge_Allowed: true,
      Delete_Branch_On_Merge: true,
      Merge_Commit_Allowed: false,
      Squash_Merge_Allowed: false,
      Rebase_Merge_Allowed: false,
    });

    await writeResultToCsv(result, 'test-output.csv', logger);

    const writtenRow = vi.mocked(appendFileSync).mock.calls[0][1] as string;
    const values = writtenRow.trim().split(',');

    // isTemplate should be TRUE (index 7 in column order)
    expect(values[7]).toBe('TRUE');
  });

  it('should handle values containing commas by quoting them', async () => {
    const logger = createMockLogger();
    const result = createMockRepoStatsResult({
      Description: 'A repo with, commas in it',
    });

    await writeResultToCsv(result, 'test-output.csv', logger);

    const writtenRow = vi.mocked(appendFileSync).mock.calls[0][1] as string;
    expect(writtenRow).toContain('"A repo with, commas in it"');
  });

  it('should handle empty string fields without producing null or undefined', async () => {
    const logger = createMockLogger();
    const result = createMockRepoStatsResult({
      Description: '',
      Homepage_URL: '',
      Default_Branch: '',
      Primary_Language: '',
      Languages: '',
      License: '',
      Topics: '',
    });

    await writeResultToCsv(result, 'test-output.csv', logger);

    const writtenRow = vi.mocked(appendFileSync).mock.calls[0][1] as string;
    expect(writtenRow).not.toContain('null');
    expect(writtenRow).not.toContain('undefined');
  });

  it('should log on successful write', async () => {
    const logger = createMockLogger();
    const result = createMockRepoStatsResult();

    await writeResultToCsv(result, 'test-output.csv', logger);

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Successfully wrote result for repository'),
    );
  });

  it('should throw and log error on write failure', async () => {
    const logger = createMockLogger();
    const result = createMockRepoStatsResult();

    vi.mocked(appendFileSync).mockImplementation(() => {
      throw new Error('Write failed');
    });

    await expect(
      writeResultToCsv(result, 'test-output.csv', logger),
    ).rejects.toThrow('Write failed');

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to write CSV'),
    );
  });
});

describe('mapToRepoStatsResult', () => {
  it('should map all new fields from RepositoryStats to RepoStatsResult', () => {
    const repo = createMockRepositoryStats();
    const issueStats = createMockIssueStats();
    const prStats = createMockPrStats();

    const result = mapToRepoStatsResult(repo, issueStats, prStats);

    expect(result.isTemplate).toBe(false);
    expect(result.Visibility).toBe('PUBLIC');
    expect(result.Star_Count).toBe(42);
    expect(result.Fork_Count).toBe(3);
    expect(result.Watcher_Count).toBe(10);
    expect(result.Default_Branch).toBe('main');
    expect(result.Primary_Language).toBe('TypeScript');
    expect(result.License).toBe('MIT');
    expect(result.Description).toBe('A test repository');
    expect(result.Homepage_URL).toBe('https://example.com');
    expect(result.Auto_Merge_Allowed).toBe(false);
    expect(result.Delete_Branch_On_Merge).toBe(false);
    expect(result.Merge_Commit_Allowed).toBe(true);
    expect(result.Squash_Merge_Allowed).toBe(true);
    expect(result.Rebase_Merge_Allowed).toBe(true);
  });

  it('should format languages as semicolon-separated with percentages', () => {
    const repo = createMockRepositoryStats({
      languages: {
        totalCount: 2,
        totalSize: 10000,
        edges: [
          { size: 8000, node: { name: 'TypeScript', color: '#3178c6' } },
          { size: 2000, node: { name: 'JavaScript', color: '#f1e05a' } },
        ],
      },
    });
    const issueStats = createMockIssueStats();
    const prStats = createMockPrStats();

    const result = mapToRepoStatsResult(repo, issueStats, prStats);

    expect(result.Languages).toBe('TypeScript:80.0%;JavaScript:20.0%');
  });

  it('should format topics as semicolon-separated list', () => {
    const repo = createMockRepositoryStats({
      repositoryTopics: {
        totalCount: 3,
        nodes: [
          { topic: { name: 'typescript' } },
          { topic: { name: 'github' } },
          { topic: { name: 'cli' } },
        ],
      },
    });
    const issueStats = createMockIssueStats();
    const prStats = createMockPrStats();

    const result = mapToRepoStatsResult(repo, issueStats, prStats);

    expect(result.Topics).toBe('typescript;github;cli');
  });

  it('should use spdxId over license name when available', () => {
    const repo = createMockRepositoryStats({
      licenseInfo: { name: 'MIT License', spdxId: 'MIT' },
    });
    const issueStats = createMockIssueStats();
    const prStats = createMockPrStats();

    const result = mapToRepoStatsResult(repo, issueStats, prStats);

    expect(result.License).toBe('MIT');
  });

  it('should fall back to license name when spdxId is empty', () => {
    const repo = createMockRepositoryStats({
      licenseInfo: { name: 'Custom License', spdxId: '' },
    });
    const issueStats = createMockIssueStats();
    const prStats = createMockPrStats();

    const result = mapToRepoStatsResult(repo, issueStats, prStats);

    expect(result.License).toBe('Custom License');
  });

  it('should handle null defaultBranchRef', () => {
    const repo = createMockRepositoryStats({ defaultBranchRef: null });
    const issueStats = createMockIssueStats();
    const prStats = createMockPrStats();

    const result = mapToRepoStatsResult(repo, issueStats, prStats);

    expect(result.Default_Branch).toBe('');
  });

  it('should handle null primaryLanguage', () => {
    const repo = createMockRepositoryStats({ primaryLanguage: null });
    const issueStats = createMockIssueStats();
    const prStats = createMockPrStats();

    const result = mapToRepoStatsResult(repo, issueStats, prStats);

    expect(result.Primary_Language).toBe('');
  });

  it('should handle null licenseInfo', () => {
    const repo = createMockRepositoryStats({ licenseInfo: null });
    const issueStats = createMockIssueStats();
    const prStats = createMockPrStats();

    const result = mapToRepoStatsResult(repo, issueStats, prStats);

    expect(result.License).toBe('');
  });

  it('should handle null description', () => {
    const repo = createMockRepositoryStats({ description: null });
    const issueStats = createMockIssueStats();
    const prStats = createMockPrStats();

    const result = mapToRepoStatsResult(repo, issueStats, prStats);

    expect(result.Description).toBe('');
  });

  it('should handle null homepageUrl', () => {
    const repo = createMockRepositoryStats({ homepageUrl: null });
    const issueStats = createMockIssueStats();
    const prStats = createMockPrStats();

    const result = mapToRepoStatsResult(repo, issueStats, prStats);

    expect(result.Homepage_URL).toBe('');
  });

  it('should handle empty languages edges', () => {
    const repo = createMockRepositoryStats({
      languages: { totalCount: 0, totalSize: 0, edges: [] },
    });
    const issueStats = createMockIssueStats();
    const prStats = createMockPrStats();

    const result = mapToRepoStatsResult(repo, issueStats, prStats);

    expect(result.Languages).toBe('');
  });

  it('should handle empty repository topics', () => {
    const repo = createMockRepositoryStats({
      repositoryTopics: { totalCount: 0, nodes: [] },
    });
    const issueStats = createMockIssueStats();
    const prStats = createMockPrStats();

    const result = mapToRepoStatsResult(repo, issueStats, prStats);

    expect(result.Topics).toBe('');
  });

  it('should show 0.0% for languages when totalSize is 0', () => {
    const repo = createMockRepositoryStats({
      languages: {
        totalCount: 1,
        totalSize: 0,
        edges: [{ size: 0, node: { name: 'TypeScript', color: '#3178c6' } }],
      },
    });
    const issueStats = createMockIssueStats();
    const prStats = createMockPrStats();

    const result = mapToRepoStatsResult(repo, issueStats, prStats);

    expect(result.Languages).toBe('TypeScript:0.0%');
  });

  it('should default boolean fields to false when undefined/null', () => {
    const repo = createMockRepositoryStats({
      autoMergeAllowed: undefined as unknown as boolean,
      deleteBranchOnMerge: undefined as unknown as boolean,
      mergeCommitAllowed: undefined as unknown as boolean,
      squashMergeAllowed: undefined as unknown as boolean,
      rebaseMergeAllowed: undefined as unknown as boolean,
    });
    const issueStats = createMockIssueStats();
    const prStats = createMockPrStats();

    const result = mapToRepoStatsResult(repo, issueStats, prStats);

    expect(result.Auto_Merge_Allowed).toBe(false);
    expect(result.Delete_Branch_On_Merge).toBe(false);
    expect(result.Merge_Commit_Allowed).toBe(false);
    expect(result.Squash_Merge_Allowed).toBe(false);
    expect(result.Rebase_Merge_Allowed).toBe(false);
  });

  it('should default numeric fields to 0 when undefined/null', () => {
    const repo = createMockRepositoryStats({
      stargazerCount: undefined as unknown as number,
      forkCount: undefined as unknown as number,
      watchers: undefined as unknown as { totalCount: number },
    });
    const issueStats = createMockIssueStats();
    const prStats = createMockPrStats();

    const result = mapToRepoStatsResult(repo, issueStats, prStats);

    expect(result.Star_Count).toBe(0);
    expect(result.Fork_Count).toBe(0);
    expect(result.Watcher_Count).toBe(0);
  });

  it('should lowercase org name and repo name', () => {
    const repo = createMockRepositoryStats({
      owner: { login: 'MyOrg' },
      name: 'MyRepo',
    });
    const issueStats = createMockIssueStats();
    const prStats = createMockPrStats();

    const result = mapToRepoStatsResult(repo, issueStats, prStats);

    expect(result.Org_Name).toBe('myorg');
    expect(result.Repo_Name).toBe('myrepo');
  });

  it('should map all original fields correctly', () => {
    const repo = createMockRepositoryStats();
    const issueStats = createMockIssueStats({
      totalIssuesCount: 25,
      issueEventCount: 50,
      issueCommentCount: 30,
    });
    const prStats = createMockPrStats({
      prReviewCount: 10,
      prReviewCommentCount: 5,
      issueEventCount: 20,
      issueCommentCount: 15,
    });

    const result = mapToRepoStatsResult(repo, issueStats, prStats);

    expect(result.Is_Empty).toBe(false);
    expect(result.isFork).toBe(false);
    expect(result.isArchived).toBe(false);
    expect(result.Has_Wiki).toBe(true);
    expect(result.Collaborator_Count).toBe(5);
    expect(result.Protected_Branch_Count).toBe(1);
    expect(result.Milestone_Count).toBe(1);
    expect(result.Branch_Count).toBe(3);
    expect(result.Tag_Count).toBe(3);
    expect(result.Release_Count).toBe(2);
    expect(result.Discussion_Count).toBe(0);
    expect(result.PR_Count).toBe(5);
    expect(result.PR_Review_Count).toBe(10);
    expect(result.PR_Review_Comment_Count).toBe(5);
    expect(result.Commit_Comment_Count).toBe(2);
    expect(result.Issue_Count).toBe(25);
    expect(result.Issue_Event_Count).toBe(70); // 50 + 20
    expect(result.Issue_Comment_Count).toBe(45); // 30 + 15
    expect(result.Project_Count).toBe(0);
    expect(result.Full_URL).toBe('https://github.com/TestOrg/test-repo');
    expect(result.Created).toBe('2024-01-01T00:00:00Z');
    expect(result.Last_Push).toBe('2024-06-01T12:00:00Z');
    expect(result.Last_Update).toBe('2024-06-15T08:00:00Z');
  });
});
