import { vi } from 'vitest';
import type {
  RepositoryStats,
  RepoStatsResult,
  IssueStatsResult,
  PullRequestStatsResult,
} from '../src/types.js';

/**
 * Test utilities for mocking and helper functions used across test files
 */

/**
 * Executes a function with a mocked Date object
 * Restores the original Date after execution to prevent test pollution
 *
 * @param mockDate The date to use during test execution
 * @param testFn The function to execute with the mocked date
 */
export function withMockedDate(mockDate: Date, testFn: () => void): void {
  const originalDate = global.Date;
  try {
    // Replace the global Date with our mocked version
    global.Date = class extends Date {
      constructor() {
        super();
        return mockDate;
      }
      static now() {
        return mockDate.getTime();
      }
    } as DateConstructor;

    // Execute the test function with our mocked Date
    testFn();
  } finally {
    // Always restore the original Date to prevent test pollution
    global.Date = originalDate;
  }
}

/**
 * Creates a simple mock logger object that can be used in tests
 *
 * @returns A mock logger with vitest spy functions
 */
export function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

/**
 * Creates a complete mock RepositoryStats object with sensible defaults.
 * All fields from the GraphQL response are included.
 *
 * @param overrides Partial overrides to customize the mock
 * @returns A fully populated RepositoryStats object
 */
export function createMockRepositoryStats(
  overrides: Partial<RepositoryStats> = {},
): RepositoryStats {
  return {
    pageInfo: { endCursor: 'cursor123', hasNextPage: false },
    autoMergeAllowed: false,
    branches: { totalCount: 3 },
    branchProtectionRules: { totalCount: 1 },
    commitComments: { totalCount: 2 },
    collaborators: { totalCount: 5 },
    createdAt: '2024-01-01T00:00:00Z',
    defaultBranchRef: { name: 'main' },
    deleteBranchOnMerge: false,
    description: 'A test repository',
    diskUsage: 1024,
    discussions: { totalCount: 0 },
    forkCount: 3,
    hasWikiEnabled: true,
    homepageUrl: 'https://example.com',
    isEmpty: false,
    isArchived: false,
    isFork: false,
    isTemplate: false,
    issues: {
      totalCount: 10,
      pageInfo: { endCursor: null, hasNextPage: false },
      nodes: [],
    },
    languages: {
      totalCount: 2,
      totalSize: 10000,
      edges: [
        { size: 8000, node: { name: 'TypeScript', color: '#3178c6' } },
        { size: 2000, node: { name: 'JavaScript', color: '#f1e05a' } },
      ],
    },
    licenseInfo: { name: 'MIT License', spdxId: 'MIT' },
    mergeCommitAllowed: true,
    milestones: { totalCount: 1 },
    name: 'test-repo',
    owner: { login: 'TestOrg' },
    primaryLanguage: { name: 'TypeScript' },
    projectsV2: { totalCount: 0 },
    pullRequests: {
      totalCount: 5,
      pageInfo: { endCursor: null, hasNextPage: false },
      nodes: [],
    },
    pushedAt: '2024-06-01T12:00:00Z',
    rebaseMergeAllowed: true,
    releases: { totalCount: 2 },
    repositoryTopics: {
      totalCount: 2,
      nodes: [{ topic: { name: 'typescript' } }, { topic: { name: 'github' } }],
    },
    squashMergeAllowed: true,
    stargazerCount: 42,
    tags: { totalCount: 3 },
    updatedAt: '2024-06-15T08:00:00Z',
    url: 'https://github.com/TestOrg/test-repo',
    visibility: 'PUBLIC',
    watchers: { totalCount: 10 },
    gitattributes: null,
    ...overrides,
  };
}

/**
 * Creates a complete mock RepoStatsResult object with sensible defaults.
 * Represents the mapped CSV output row.
 *
 * @param overrides Partial overrides to customize the mock
 * @returns A fully populated RepoStatsResult object
 */
export function createMockRepoStatsResult(
  overrides: Partial<RepoStatsResult> = {},
): RepoStatsResult {
  return {
    Org_Name: 'testorg',
    Repo_Name: 'test-repo',
    Is_Empty: false,
    Last_Push: '2024-06-01T12:00:00Z',
    Last_Update: '2024-06-15T08:00:00Z',
    isFork: false,
    isArchived: false,
    isTemplate: false,
    Visibility: 'PUBLIC',
    Repo_Size_mb: 1,
    Record_Count: 100,
    Collaborator_Count: 5,
    Protected_Branch_Count: 1,
    PR_Review_Count: 3,
    Milestone_Count: 1,
    Issue_Count: 10,
    PR_Count: 5,
    PR_Review_Comment_Count: 2,
    Commit_Comment_Count: 2,
    Issue_Comment_Count: 8,
    Issue_Event_Count: 15,
    Release_Count: 2,
    Project_Count: 0,
    Branch_Count: 3,
    Tag_Count: 3,
    Discussion_Count: 0,
    Star_Count: 42,
    Fork_Count: 3,
    Watcher_Count: 10,
    Has_Wiki: true,
    Has_LFS: false,
    Default_Branch: 'main',
    Primary_Language: 'TypeScript',
    Languages: 'TypeScript:80.0%;JavaScript:20.0%',
    License: 'MIT',
    Topics: 'typescript;github',
    Description: 'A test repository',
    Homepage_URL: 'https://example.com',
    Auto_Merge_Allowed: false,
    Delete_Branch_On_Merge: false,
    Merge_Commit_Allowed: true,
    Squash_Merge_Allowed: true,
    Rebase_Merge_Allowed: true,
    Full_URL: 'https://github.com/TestOrg/test-repo',
    Migration_Issue: false,
    Created: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

/**
 * Creates a mock IssueStatsResult with sensible defaults.
 *
 * @param overrides Partial overrides to customize the mock
 * @returns A fully populated IssueStatsResult object
 */
export function createMockIssueStats(
  overrides: Partial<IssueStatsResult> = {},
): IssueStatsResult {
  return {
    totalIssuesCount: 10,
    issueEventCount: 15,
    issueCommentCount: 8,
    ...overrides,
  };
}

/**
 * Creates a mock PullRequestStatsResult with sensible defaults.
 *
 * @param overrides Partial overrides to customize the mock
 * @returns A fully populated PullRequestStatsResult object
 */
export function createMockPrStats(
  overrides: Partial<PullRequestStatsResult> = {},
): PullRequestStatsResult {
  return {
    prReviewCommentCount: 2,
    commitCommentCount: 0,
    issueEventCount: 0,
    issueCommentCount: 0,
    prReviewCount: 3,
    ...overrides,
  };
}
