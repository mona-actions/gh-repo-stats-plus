import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkForMissingRepos } from '../src/main.js';
import { readFileSync, appendFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { createLogger } from '../src/logger.js';
import { createOctokit } from '../src/octokit.js';
import { OctokitClient } from '../src/service.js';

vi.mock('fs');
vi.mock('csv-parse/sync', () => ({
  parse: vi.fn(),
}));
vi.mock('../src/logger.js');
vi.mock('../src/auth.js', () => ({
  createAuthConfig: vi.fn(() => ({ type: 'token', token: 'test-token' })),
}));
vi.mock('../src/octokit.js');
vi.mock('../src/service.js');
vi.mock('../src/utils.js', async () => {
  const actual =
    await vi.importActual<typeof import('../src/utils.js')>('../src/utils.js');
  return {
    ...actual,
    resolveOutputPath: vi.fn((dir, file) => `${dir}/${file}`),
  };
});

describe('checkForMissingRepos', () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const mockOctokit = {};
  const mockClient = {
    listReposForOrg: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createLogger).mockResolvedValue(
      mockLogger as unknown as Awaited<ReturnType<typeof createLogger>>,
    );
    vi.mocked(createOctokit).mockReturnValue(
      mockOctokit as unknown as ReturnType<typeof createOctokit>,
    );
    vi.mocked(OctokitClient).mockImplementation(function () {
      return mockClient as unknown as InstanceType<typeof OctokitClient>;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('with REPO_LIST provided', () => {
    it('should only check missing repos from the provided repo list', async () => {
      const opts = {
        orgName: 'test-org',
        verbose: false,
        pageSize: 10,
        outputDir: 'output',
        repoList: ['test-org/repo1', 'test-org/repo2', 'test-org/repo3'],
      };

      // Mock CSV file with only repo1 processed
      vi.mocked(readFileSync).mockReturnValue(
        'Org_Name,Repo_Name\ntest-org,repo1',
      );
      vi.mocked(parse).mockReturnValue([
        { Org_Name: 'test-org', Repo_Name: 'repo1' },
      ] as unknown as ReturnType<typeof parse>);

      const result = await checkForMissingRepos({
        opts: opts as unknown as Parameters<
          typeof checkForMissingRepos
        >[0]['opts'],
        processedFile: 'test.csv',
      });

      // Should find repo2 and repo3 as missing
      expect(result.missingRepos).toEqual(['repo2', 'repo3']);

      // Should NOT call listReposForOrg when repoList is provided
      expect(mockClient.listReposForOrg).not.toHaveBeenCalled();

      // Should append missing repos to file
      expect(vi.mocked(appendFileSync)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(appendFileSync)).toHaveBeenCalledWith(
        expect.stringContaining('missing-repos'),
        'repo2\n',
      );
      expect(vi.mocked(appendFileSync)).toHaveBeenCalledWith(
        expect.stringContaining('missing-repos'),
        'repo3\n',
      );
    });

    it('should handle repo list with owner/repo format', async () => {
      const opts = {
        orgName: 'test-org',
        verbose: false,
        pageSize: 10,
        outputDir: 'output',
        repoList: ['test-org/repo-a', 'test-org/repo-b'],
      };

      vi.mocked(readFileSync).mockReturnValue(
        'Org_Name,Repo_Name\ntest-org,repo-a',
      );
      vi.mocked(parse).mockReturnValue([
        { Org_Name: 'test-org', Repo_Name: 'repo-a' },
      ] as unknown as ReturnType<typeof parse>);

      const result = await checkForMissingRepos({
        opts: opts as unknown as Parameters<
          typeof checkForMissingRepos
        >[0]['opts'],
        processedFile: 'test.csv',
      });

      expect(result.missingRepos).toEqual(['repo-b']);
    });

    it('should find no missing repos when all are processed', async () => {
      const opts = {
        orgName: 'test-org',
        verbose: false,
        pageSize: 10,
        outputDir: 'output',
        repoList: ['repo1', 'repo2'],
      };

      vi.mocked(readFileSync).mockReturnValue(
        'Org_Name,Repo_Name\ntest-org,repo1\ntest-org,repo2',
      );
      vi.mocked(parse).mockReturnValue([
        { Org_Name: 'test-org', Repo_Name: 'repo1' },
        { Org_Name: 'test-org', Repo_Name: 'repo2' },
      ] as unknown as ReturnType<typeof parse>);

      const result = await checkForMissingRepos({
        opts: opts as unknown as Parameters<
          typeof checkForMissingRepos
        >[0]['opts'],
        processedFile: 'test.csv',
      });

      expect(result.missingRepos).toEqual([]);
      expect(vi.mocked(appendFileSync)).not.toHaveBeenCalled();
    });
  });

  describe('without REPO_LIST (org-wide check)', () => {
    it('should check all org repos when REPO_LIST is not provided', async () => {
      const opts = {
        orgName: 'test-org',
        verbose: false,
        pageSize: 10,
        outputDir: 'output',
      };

      vi.mocked(readFileSync).mockReturnValue(
        'Org_Name,Repo_Name\ntest-org,repo1',
      );
      vi.mocked(parse).mockReturnValue([
        { Org_Name: 'test-org', Repo_Name: 'repo1' },
      ] as unknown as ReturnType<typeof parse>);

      // Mock org repos iterator
      async function* mockRepoIterator(): AsyncGenerator<{ name: string }> {
        yield { name: 'repo1' };
        yield { name: 'repo2' };
        yield { name: 'repo3' };
      }

      vi.mocked(mockClient.listReposForOrg).mockReturnValue(
        mockRepoIterator() as unknown as ReturnType<
          typeof mockClient.listReposForOrg
        >,
      );

      const result = await checkForMissingRepos({
        opts: opts as unknown as Parameters<
          typeof checkForMissingRepos
        >[0]['opts'],
        processedFile: 'test.csv',
      });

      // Should call listReposForOrg when no repoList
      expect(mockClient.listReposForOrg).toHaveBeenCalledWith('test-org', 10);

      // Should find repo2 and repo3 as missing
      expect(result.missingRepos).toEqual(['repo2', 'repo3']);
    });

    it('should check all org repos when REPO_LIST is empty array', async () => {
      const opts = {
        orgName: 'test-org',
        verbose: false,
        pageSize: 10,
        outputDir: 'output',
        repoList: [],
      };

      vi.mocked(readFileSync).mockReturnValue(
        'Org_Name,Repo_Name\ntest-org,repo1',
      );
      vi.mocked(parse).mockReturnValue([
        { Org_Name: 'test-org', Repo_Name: 'repo1' },
      ] as unknown as ReturnType<typeof parse>);

      async function* mockRepoIterator(): AsyncGenerator<{ name: string }> {
        yield { name: 'repo1' };
        yield { name: 'repo2' };
      }

      vi.mocked(mockClient.listReposForOrg).mockReturnValue(
        mockRepoIterator() as unknown as ReturnType<
          typeof mockClient.listReposForOrg
        >,
      );

      const result = await checkForMissingRepos({
        opts: opts as unknown as Parameters<
          typeof checkForMissingRepos
        >[0]['opts'],
        processedFile: 'test.csv',
      });

      expect(mockClient.listReposForOrg).toHaveBeenCalled();
      expect(result.missingRepos).toEqual(['repo2']);
    });
  });
});
