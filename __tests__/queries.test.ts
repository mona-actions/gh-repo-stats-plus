import { describe, it, expect } from 'vitest';
import {
  ORG_REPO_STATS_QUERY,
  SINGLE_REPO_STATS_QUERY,
  REPO_ISSUES_QUERY,
  REPO_PULL_REQUESTS_QUERY,
} from '../src/queries.js';

describe('GraphQL Queries', () => {
  describe('ORG_REPO_STATS_QUERY', () => {
    it('should be a non-empty string', () => {
      expect(ORG_REPO_STATS_QUERY).toBeDefined();
      expect(typeof ORG_REPO_STATS_QUERY).toBe('string');
      expect(ORG_REPO_STATS_QUERY.length).toBeGreaterThan(0);
    });

    it('should define the orgRepoStats query with correct variables', () => {
      expect(ORG_REPO_STATS_QUERY).toContain('query orgRepoStats');
      expect(ORG_REPO_STATS_QUERY).toContain('$login: String!');
      expect(ORG_REPO_STATS_QUERY).toContain('$pageSize: Int!');
      expect(ORG_REPO_STATS_QUERY).toContain('$cursor: String');
    });

    it('should query organization repositories with pagination', () => {
      expect(ORG_REPO_STATS_QUERY).toContain('organization(login: $login)');
      expect(ORG_REPO_STATS_QUERY).toContain(
        'repositories(first: $pageSize, after: $cursor',
      );
      expect(ORG_REPO_STATS_QUERY).toContain('pageInfo');
      expect(ORG_REPO_STATS_QUERY).toContain('endCursor');
      expect(ORG_REPO_STATS_QUERY).toContain('hasNextPage');
      expect(ORG_REPO_STATS_QUERY).toContain('startCursor');
    });

    it('should contain all new repository fields', () => {
      const newFields = [
        'autoMergeAllowed',
        'defaultBranchRef',
        'deleteBranchOnMerge',
        'description',
        'forkCount',
        'homepageUrl',
        'isTemplate',
        'languages',
        'licenseInfo',
        'mergeCommitAllowed',
        'primaryLanguage',
        'rebaseMergeAllowed',
        'repositoryTopics',
        'squashMergeAllowed',
        'stargazerCount',
        'visibility',
        'watchers',
      ];

      for (const field of newFields) {
        expect(ORG_REPO_STATS_QUERY).toContain(field);
      }
    });

    it('should contain all original repository fields', () => {
      const originalFields = [
        'branches',
        'branchProtectionRules',
        'commitComments',
        'collaborators',
        'createdAt',
        'diskUsage',
        'discussions',
        'hasWikiEnabled',
        'isEmpty',
        'isArchived',
        'isFork',
        'issues',
        'milestones',
        'name',
        'owner',
        'projectsV2',
        'pullRequests',
        'pushedAt',
        'releases',
        'tags',
        'updatedAt',
        'url',
      ];

      for (const field of originalFields) {
        expect(ORG_REPO_STATS_QUERY).toContain(field);
      }
    });

    it('should include language details with size and name', () => {
      expect(ORG_REPO_STATS_QUERY).toContain('totalSize');
      expect(ORG_REPO_STATS_QUERY).toContain('edges');
      expect(ORG_REPO_STATS_QUERY).toContain('size');
    });

    it('should include license fields', () => {
      expect(ORG_REPO_STATS_QUERY).toContain('spdxId');
    });

    it('should include repository topics', () => {
      expect(ORG_REPO_STATS_QUERY).toContain('repositoryTopics');
      expect(ORG_REPO_STATS_QUERY).toContain('topic');
    });
  });

  describe('SINGLE_REPO_STATS_QUERY', () => {
    it('should be a non-empty string', () => {
      expect(SINGLE_REPO_STATS_QUERY).toBeDefined();
      expect(typeof SINGLE_REPO_STATS_QUERY).toBe('string');
      expect(SINGLE_REPO_STATS_QUERY.length).toBeGreaterThan(0);
    });

    it('should define the repoStats query with correct variables', () => {
      expect(SINGLE_REPO_STATS_QUERY).toContain('query repoStats');
      expect(SINGLE_REPO_STATS_QUERY).toContain('$owner: String!');
      expect(SINGLE_REPO_STATS_QUERY).toContain('$name: String!');
      expect(SINGLE_REPO_STATS_QUERY).toContain('$pageSize: Int!');
    });

    it('should query repository by owner and name', () => {
      expect(SINGLE_REPO_STATS_QUERY).toContain(
        'repository(owner: $owner, name: $name)',
      );
    });

    it('should contain all new repository fields', () => {
      const newFields = [
        'autoMergeAllowed',
        'defaultBranchRef',
        'deleteBranchOnMerge',
        'description',
        'forkCount',
        'homepageUrl',
        'isTemplate',
        'languages',
        'licenseInfo',
        'mergeCommitAllowed',
        'primaryLanguage',
        'rebaseMergeAllowed',
        'repositoryTopics',
        'squashMergeAllowed',
        'stargazerCount',
        'visibility',
        'watchers',
      ];

      for (const field of newFields) {
        expect(SINGLE_REPO_STATS_QUERY).toContain(field);
      }
    });

    it('should share the same repository fields as ORG_REPO_STATS_QUERY', () => {
      // Both queries should contain the same core fields
      const sharedFields = [
        'autoMergeAllowed',
        'branches',
        'branchProtectionRules',
        'commitComments',
        'collaborators',
        'createdAt',
        'defaultBranchRef',
        'deleteBranchOnMerge',
        'description',
        'diskUsage',
        'discussions',
        'forkCount',
        'hasWikiEnabled',
        'homepageUrl',
        'isEmpty',
        'isArchived',
        'isFork',
        'isTemplate',
        'issues',
        'languages',
        'licenseInfo',
        'mergeCommitAllowed',
        'milestones',
        'name',
        'owner',
        'primaryLanguage',
        'projectsV2',
        'pullRequests',
        'pushedAt',
        'rebaseMergeAllowed',
        'releases',
        'repositoryTopics',
        'squashMergeAllowed',
        'stargazerCount',
        'tags',
        'updatedAt',
        'url',
        'visibility',
        'watchers',
      ];

      for (const field of sharedFields) {
        expect(ORG_REPO_STATS_QUERY).toContain(field);
        expect(SINGLE_REPO_STATS_QUERY).toContain(field);
      }
    });
  });

  describe('REPO_ISSUES_QUERY', () => {
    it('should be a non-empty string', () => {
      expect(REPO_ISSUES_QUERY).toBeDefined();
      expect(typeof REPO_ISSUES_QUERY).toBe('string');
      expect(REPO_ISSUES_QUERY.length).toBeGreaterThan(0);
    });

    it('should define the repoIssues query with correct variables', () => {
      expect(REPO_ISSUES_QUERY).toContain('query repoIssues');
      expect(REPO_ISSUES_QUERY).toContain('$owner: String!');
      expect(REPO_ISSUES_QUERY).toContain('$repo: String!');
      expect(REPO_ISSUES_QUERY).toContain('$pageSize: Int!');
      expect(REPO_ISSUES_QUERY).toContain('$cursor: String');
    });

    it('should query issues with pagination and timeline/comment nodes', () => {
      expect(REPO_ISSUES_QUERY).toContain('issues(first: $pageSize');
      expect(REPO_ISSUES_QUERY).toContain('timeline');
      expect(REPO_ISSUES_QUERY).toContain('comments');
      expect(REPO_ISSUES_QUERY).toContain('totalCount');
    });
  });

  describe('REPO_PULL_REQUESTS_QUERY', () => {
    it('should be a non-empty string', () => {
      expect(REPO_PULL_REQUESTS_QUERY).toBeDefined();
      expect(typeof REPO_PULL_REQUESTS_QUERY).toBe('string');
      expect(REPO_PULL_REQUESTS_QUERY.length).toBeGreaterThan(0);
    });

    it('should define the repoPullRequests query with correct variables', () => {
      expect(REPO_PULL_REQUESTS_QUERY).toContain('query repoPullRequests');
      expect(REPO_PULL_REQUESTS_QUERY).toContain('$owner: String!');
      expect(REPO_PULL_REQUESTS_QUERY).toContain('$repo: String!');
      expect(REPO_PULL_REQUESTS_QUERY).toContain('$pageSize: Int!');
      expect(REPO_PULL_REQUESTS_QUERY).toContain('$cursor: String');
    });

    it('should query pull requests with nested reviews', () => {
      expect(REPO_PULL_REQUESTS_QUERY).toContain(
        'pullRequests(first: $pageSize',
      );
      expect(REPO_PULL_REQUESTS_QUERY).toContain('reviews');
      expect(REPO_PULL_REQUESTS_QUERY).toContain('commits');
      expect(REPO_PULL_REQUESTS_QUERY).toContain('number');
      expect(REPO_PULL_REQUESTS_QUERY).toContain('timeline');
      expect(REPO_PULL_REQUESTS_QUERY).toContain('comments');
    });
  });
});
