import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Octokit } from 'octokit';
import { OctokitClient } from '../src/service.js';

vi.mock('octokit');

describe('OctokitClient - App Installation Methods', () => {
  let mockOctokit: Record<string, unknown>;
  let client: OctokitClient;

  beforeEach(() => {
    vi.clearAllMocks();

    const paginateIteratorFn = vi.fn();

    mockOctokit = {
      rest: {
        repos: {
          listForOrg: vi.fn(),
        },
        orgs: {
          listAppInstallations: vi.fn(),
        },
        apps: {
          listInstallationReposForAuthenticatedUser: vi.fn(),
        },
      },
      auth: vi.fn(),
      graphql: vi.fn(),
      paginate: Object.assign(vi.fn(), {
        iterator: paginateIteratorFn,
      }),
      request: vi.fn(),
    };

    // Add paginate to graphql mock
    (mockOctokit.graphql as Record<string, unknown>).paginate = {
      iterator: vi.fn(),
    };

    client = new OctokitClient(mockOctokit as unknown as Octokit);
  });

  describe('getOrgInstallations', () => {
    it('should categorize installations by repository_selection', async () => {
      const paginateIterator = (
        mockOctokit.paginate as Record<string, ReturnType<typeof vi.fn>>
      ).iterator;
      paginateIterator.mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield {
            data: [
              {
                id: 1,
                app_slug: 'app-org-wide',
                app_id: 100,
                repository_selection: 'all',
              },
              {
                id: 2,
                app_slug: 'app-selected',
                app_id: 200,
                repository_selection: 'selected',
              },
              {
                id: 3,
                app_slug: 'app-also-selected',
                app_id: 300,
                repository_selection: 'selected',
              },
            ],
          };
        },
      });

      const result = await client.getOrgInstallations('test-org');

      expect(result.orgWideInstallations).toHaveLength(1);
      expect(result.orgWideInstallations[0]).toEqual({
        id: 1,
        app_slug: 'app-org-wide',
        repository_selection: 'all',
      });

      expect(result.repoSpecificInstallations).toHaveLength(2);
      expect(result.repoSpecificInstallations[0]).toEqual({
        id: 2,
        app_slug: 'app-selected',
        repository_selection: 'selected',
      });
      expect(result.repoSpecificInstallations[1]).toEqual({
        id: 3,
        app_slug: 'app-also-selected',
        repository_selection: 'selected',
      });

      expect(paginateIterator).toHaveBeenCalledWith(
        (mockOctokit.rest as Record<string, Record<string, unknown>>).orgs
          .listAppInstallations,
        expect.objectContaining({ org: 'test-org', per_page: 100 }),
      );
    });

    it('should use app_id as fallback when app_slug is empty', async () => {
      const paginateIterator = (
        mockOctokit.paginate as Record<string, ReturnType<typeof vi.fn>>
      ).iterator;
      paginateIterator.mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield {
            data: [
              {
                id: 1,
                app_slug: '',
                app_id: 999,
                repository_selection: 'all',
              },
            ],
          };
        },
      });

      const result = await client.getOrgInstallations('test-org');

      expect(result.orgWideInstallations[0].app_slug).toBe('999');
    });

    it('should return empty arrays for no installations', async () => {
      const paginateIterator = (
        mockOctokit.paginate as Record<string, ReturnType<typeof vi.fn>>
      ).iterator;
      paginateIterator.mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield { data: [] };
        },
      });

      const result = await client.getOrgInstallations('test-org');

      expect(result.orgWideInstallations).toHaveLength(0);
      expect(result.repoSpecificInstallations).toHaveLength(0);
    });
  });

  describe('getInstallationRepositories', () => {
    it('should return list of repository names', async () => {
      const paginateIterator = (
        mockOctokit.paginate as Record<string, ReturnType<typeof vi.fn>>
      ).iterator;
      paginateIterator.mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield {
            data: [{ name: 'repo-a' }, { name: 'repo-b' }, { name: 'repo-c' }],
          };
        },
      });

      const result = await client.getInstallationRepositories(123);

      expect(result).toEqual(['repo-a', 'repo-b', 'repo-c']);

      expect(paginateIterator).toHaveBeenCalledWith(
        (mockOctokit.rest as Record<string, Record<string, unknown>>).apps
          .listInstallationReposForAuthenticatedUser,
        expect.objectContaining({
          installation_id: 123,
          per_page: 100,
        }),
      );
    });

    it('should return empty array for no repositories', async () => {
      const paginateIterator = (
        mockOctokit.paginate as Record<string, ReturnType<typeof vi.fn>>
      ).iterator;
      paginateIterator.mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield { data: [] };
        },
      });

      const result = await client.getInstallationRepositories(456);

      expect(result).toEqual([]);
    });
  });

  describe('getOrgAppInstallationData', () => {
    it('should aggregate installations and build repo-app maps', async () => {
      const paginateIterator = (
        mockOctokit.paginate as Record<string, ReturnType<typeof vi.fn>>
      ).iterator;
      // First call: getOrgInstallations
      // Second call: getInstallationRepositories for selected-app
      paginateIterator
        .mockReturnValueOnce({
          async *[Symbol.asyncIterator]() {
            yield {
              data: [
                {
                  id: 1,
                  app_slug: 'org-app',
                  app_id: 100,
                  repository_selection: 'all',
                },
                {
                  id: 2,
                  app_slug: 'selected-app',
                  app_id: 200,
                  repository_selection: 'selected',
                },
              ],
            };
          },
        })
        .mockReturnValueOnce({
          async *[Symbol.asyncIterator]() {
            yield {
              data: [{ name: 'repo-a' }, { name: 'repo-b' }],
            };
          },
        });

      const onInstallationProcessed = vi.fn();

      const result = await client.getOrgAppInstallationData(
        'test-org',
        onInstallationProcessed,
      );

      expect(result.orgName).toBe('test-org');
      expect(result.orgWideInstallations).toHaveLength(1);
      expect(result.orgWideInstallations[0].app_slug).toBe('org-app');
      expect(result.repoSpecificInstallations).toHaveLength(1);
      expect(result.repoSpecificInstallations[0].app_slug).toBe('selected-app');

      expect(result.installationRepos).toEqual({
        'selected-app': ['repo-a', 'repo-b'],
      });

      expect(result.repoApps).toEqual({
        'repo-a': ['selected-app'],
        'repo-b': ['selected-app'],
      });

      expect(onInstallationProcessed).toHaveBeenCalledWith('selected-app', 2);
    });

    it('should handle multiple apps on the same repo', async () => {
      const paginateIterator = (
        mockOctokit.paginate as Record<string, ReturnType<typeof vi.fn>>
      ).iterator;
      paginateIterator
        .mockReturnValueOnce({
          async *[Symbol.asyncIterator]() {
            yield {
              data: [
                {
                  id: 1,
                  app_slug: 'app-x',
                  app_id: 100,
                  repository_selection: 'selected',
                },
                {
                  id: 2,
                  app_slug: 'app-y',
                  app_id: 200,
                  repository_selection: 'selected',
                },
              ],
            };
          },
        })
        .mockReturnValueOnce({
          async *[Symbol.asyncIterator]() {
            yield { data: [{ name: 'shared-repo' }] };
          },
        })
        .mockReturnValueOnce({
          async *[Symbol.asyncIterator]() {
            yield { data: [{ name: 'shared-repo' }] };
          },
        });

      const result = await client.getOrgAppInstallationData('test-org');

      expect(result.repoApps['shared-repo']).toEqual(['app-x', 'app-y']);
      expect(result.installationRepos['app-x']).toEqual(['shared-repo']);
      expect(result.installationRepos['app-y']).toEqual(['shared-repo']);
    });

    it('should handle org with only org-wide installations', async () => {
      const paginateIterator = (
        mockOctokit.paginate as Record<string, ReturnType<typeof vi.fn>>
      ).iterator;
      paginateIterator.mockReturnValueOnce({
        async *[Symbol.asyncIterator]() {
          yield {
            data: [
              {
                id: 1,
                app_slug: 'org-only-app',
                app_id: 100,
                repository_selection: 'all',
              },
            ],
          };
        },
      });

      const result = await client.getOrgAppInstallationData('test-org');

      expect(result.orgWideInstallations).toHaveLength(1);
      expect(result.repoSpecificInstallations).toHaveLength(0);
      expect(result.installationRepos).toEqual({});
      expect(result.repoApps).toEqual({});
    });

    it('should handle org with no installations', async () => {
      const paginateIterator = (
        mockOctokit.paginate as Record<string, ReturnType<typeof vi.fn>>
      ).iterator;
      paginateIterator.mockReturnValueOnce({
        async *[Symbol.asyncIterator]() {
          yield { data: [] };
        },
      });

      const result = await client.getOrgAppInstallationData('test-org');

      expect(result.orgWideInstallations).toHaveLength(0);
      expect(result.repoSpecificInstallations).toHaveLength(0);
      expect(result.installationRepos).toEqual({});
      expect(result.repoApps).toEqual({});
    });

    it('should work without callback', async () => {
      const paginateIterator = (
        mockOctokit.paginate as Record<string, ReturnType<typeof vi.fn>>
      ).iterator;
      paginateIterator
        .mockReturnValueOnce({
          async *[Symbol.asyncIterator]() {
            yield {
              data: [
                {
                  id: 1,
                  app_slug: 'app-1',
                  app_id: 100,
                  repository_selection: 'selected',
                },
              ],
            };
          },
        })
        .mockReturnValueOnce({
          async *[Symbol.asyncIterator]() {
            yield { data: [{ name: 'repo-a' }] };
          },
        });

      const result = await client.getOrgAppInstallationData('test-org');

      expect(result.installationRepos['app-1']).toEqual(['repo-a']);
    });
  });
});
