import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Octokit } from 'octokit';
import { OctokitClient } from '../src/service.js';

vi.mock('octokit');

describe('OctokitClient - Package Stats Methods', () => {
  let mockOctokit: Record<string, unknown>;
  let client: OctokitClient;
  const mockLogger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

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

  describe('getOrgPackageDetails', () => {
    it('should yield package details from a single page', async () => {
      const graphqlFn = mockOctokit.graphql as ReturnType<typeof vi.fn>;
      graphqlFn.mockResolvedValueOnce({
        organization: {
          packages: {
            nodes: [
              {
                name: 'com.example:my-lib',
                packageType: 'MAVEN',
                repository: {
                  name: 'my-repo',
                  isArchived: false,
                  visibility: 'PRIVATE',
                },
                statistics: { downloadsTotalCount: 42 },
                latestVersion: {
                  files: {
                    nodes: [
                      {
                        name: 'my-lib-1.0.jar',
                        size: 1024,
                        updatedAt: '2025-01-15T10:00:00Z',
                      },
                    ],
                  },
                  version: '1.0.0',
                },
                versions: { totalCount: 3 },
              },
            ],
            pageInfo: {
              hasNextPage: false,
              endCursor: null,
            },
          },
        },
      });

      const packages = [];
      for await (const pkg of client.getOrgPackageDetails(
        'test-org',
        'MAVEN',
        100,
        mockLogger,
      )) {
        packages.push(pkg);
      }

      expect(packages).toHaveLength(1);
      expect(packages[0].name).toBe('com.example:my-lib');
      expect(packages[0].packageType).toBe('MAVEN');
      expect(packages[0].repository?.name).toBe('my-repo');
      expect(packages[0].statistics.downloadsTotalCount).toBe(42);
      expect(packages[0].latestVersion?.version).toBe('1.0.0');
      expect(packages[0].versions.totalCount).toBe(3);

      expect(graphqlFn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          organization: 'test-org',
          packageType: 'MAVEN',
          pageSize: 100,
          endCursor: null,
        }),
      );
    });

    it('should paginate through multiple pages', async () => {
      const graphqlFn = mockOctokit.graphql as ReturnType<typeof vi.fn>;
      graphqlFn
        .mockResolvedValueOnce({
          organization: {
            packages: {
              nodes: [
                {
                  name: 'pkg-1',
                  packageType: 'MAVEN',
                  repository: null,
                  statistics: { downloadsTotalCount: 0 },
                  latestVersion: null,
                  versions: { totalCount: 1 },
                },
              ],
              pageInfo: {
                hasNextPage: true,
                endCursor: 'cursor-1',
              },
            },
          },
        })
        .mockResolvedValueOnce({
          organization: {
            packages: {
              nodes: [
                {
                  name: 'pkg-2',
                  packageType: 'MAVEN',
                  repository: null,
                  statistics: { downloadsTotalCount: 5 },
                  latestVersion: null,
                  versions: { totalCount: 2 },
                },
              ],
              pageInfo: {
                hasNextPage: false,
                endCursor: null,
              },
            },
          },
        });

      const packages = [];
      for await (const pkg of client.getOrgPackageDetails(
        'test-org',
        'MAVEN',
        1,
        mockLogger,
      )) {
        packages.push(pkg);
      }

      expect(packages).toHaveLength(2);
      expect(packages[0].name).toBe('pkg-1');
      expect(packages[1].name).toBe('pkg-2');
      expect(graphqlFn).toHaveBeenCalledTimes(2);
    });

    it('should handle empty package list', async () => {
      const graphqlFn = mockOctokit.graphql as ReturnType<typeof vi.fn>;
      graphqlFn.mockResolvedValueOnce({
        organization: {
          packages: {
            nodes: [],
            pageInfo: {
              hasNextPage: false,
              endCursor: null,
            },
          },
        },
      });

      const packages = [];
      for await (const pkg of client.getOrgPackageDetails(
        'empty-org',
        'MAVEN',
        100,
        mockLogger,
      )) {
        packages.push(pkg);
      }

      expect(packages).toHaveLength(0);
    });
  });

  describe('getPackageVersionDetails', () => {
    it('should compute totals from a single version with single file page', async () => {
      const graphqlFn = mockOctokit.graphql as ReturnType<typeof vi.fn>;
      graphqlFn.mockResolvedValueOnce({
        organization: {
          packages: {
            nodes: [
              {
                versions: {
                  nodes: [
                    {
                      id: 'ver-1',
                      files: {
                        nodes: [{ size: 100 }, { size: 200 }],
                        totalCount: 2,
                        pageInfo: {
                          hasNextPage: false,
                          endCursor: null,
                        },
                      },
                    },
                  ],
                  pageInfo: {
                    hasNextPage: false,
                    endCursor: null,
                  },
                },
              },
            ],
          },
        },
      });

      const result = await client.getPackageVersionDetails(
        'test-org',
        'my-package',
        mockLogger,
      );

      expect(result.totalVersions).toBe(1);
      expect(result.totalFiles).toBe(2);
      expect(result.totalSize).toBe(300);
    });

    it('should aggregate across multiple versions', async () => {
      const graphqlFn = mockOctokit.graphql as ReturnType<typeof vi.fn>;
      graphqlFn.mockResolvedValueOnce({
        organization: {
          packages: {
            nodes: [
              {
                versions: {
                  nodes: [
                    {
                      id: 'ver-1',
                      files: {
                        nodes: [{ size: 100 }],
                        totalCount: 1,
                        pageInfo: { hasNextPage: false, endCursor: null },
                      },
                    },
                    {
                      id: 'ver-2',
                      files: {
                        nodes: [{ size: 200 }, { size: 300 }],
                        totalCount: 2,
                        pageInfo: { hasNextPage: false, endCursor: null },
                      },
                    },
                  ],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            ],
          },
        },
      });

      const result = await client.getPackageVersionDetails(
        'test-org',
        'my-package',
        mockLogger,
      );

      expect(result.totalVersions).toBe(2);
      expect(result.totalFiles).toBe(3);
      expect(result.totalSize).toBe(600);
    });

    it('should handle deep file pagination for a version', async () => {
      const graphqlFn = mockOctokit.graphql as ReturnType<typeof vi.fn>;
      // First call: version list with a version that has more files than returned
      graphqlFn.mockResolvedValueOnce({
        organization: {
          packages: {
            nodes: [
              {
                versions: {
                  nodes: [
                    {
                      id: 'ver-1',
                      files: {
                        nodes: [{ size: 50 }],
                        totalCount: 3,
                        pageInfo: {
                          hasNextPage: true,
                          endCursor: 'file-cursor-1',
                        },
                      },
                    },
                  ],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            ],
          },
        },
      });
      // Second call: additional file page
      graphqlFn.mockResolvedValueOnce({
        node: {
          files: {
            nodes: [{ size: 75 }, { size: 25 }],
            pageInfo: {
              hasNextPage: false,
              endCursor: null,
            },
          },
        },
      });

      const result = await client.getPackageVersionDetails(
        'test-org',
        'my-package',
        mockLogger,
      );

      expect(result.totalVersions).toBe(1);
      expect(result.totalFiles).toBe(3);
      expect(result.totalSize).toBe(150); // 50 + 75 + 25
      expect(graphqlFn).toHaveBeenCalledTimes(2);
    });

    it('should return zeros when no package node exists', async () => {
      const graphqlFn = mockOctokit.graphql as ReturnType<typeof vi.fn>;
      graphqlFn.mockResolvedValueOnce({
        organization: {
          packages: {
            nodes: [],
          },
        },
      });

      const result = await client.getPackageVersionDetails(
        'test-org',
        'missing-package',
        mockLogger,
      );

      expect(result.totalVersions).toBe(0);
      expect(result.totalFiles).toBe(0);
      expect(result.totalSize).toBe(0);
    });

    it('should paginate through version pages', async () => {
      const graphqlFn = mockOctokit.graphql as ReturnType<typeof vi.fn>;
      // First call: first version page
      graphqlFn.mockResolvedValueOnce({
        organization: {
          packages: {
            nodes: [
              {
                versions: {
                  nodes: [
                    {
                      id: 'ver-1',
                      files: {
                        nodes: [{ size: 100 }],
                        totalCount: 1,
                        pageInfo: { hasNextPage: false, endCursor: null },
                      },
                    },
                  ],
                  pageInfo: {
                    hasNextPage: true,
                    endCursor: 'version-cursor-1',
                  },
                },
              },
            ],
          },
        },
      });
      // Second call: second version page
      graphqlFn.mockResolvedValueOnce({
        organization: {
          packages: {
            nodes: [
              {
                versions: {
                  nodes: [
                    {
                      id: 'ver-2',
                      files: {
                        nodes: [{ size: 200 }],
                        totalCount: 1,
                        pageInfo: { hasNextPage: false, endCursor: null },
                      },
                    },
                  ],
                  pageInfo: {
                    hasNextPage: false,
                    endCursor: null,
                  },
                },
              },
            ],
          },
        },
      });

      const result = await client.getPackageVersionDetails(
        'test-org',
        'multi-version-package',
        mockLogger,
      );

      expect(result.totalVersions).toBe(2);
      expect(result.totalFiles).toBe(2);
      expect(result.totalSize).toBe(300);
      expect(graphqlFn).toHaveBeenCalledTimes(2);
    });
  });
});
