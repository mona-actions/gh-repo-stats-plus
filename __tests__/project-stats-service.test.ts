import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Octokit } from 'octokit';
import { OctokitClient } from '../src/service.js';

vi.mock('octokit');

describe('OctokitClient - getRepoProjectCounts', () => {
  let mockOctokit: Record<string, unknown>;
  let client: OctokitClient;

  beforeEach(() => {
    vi.clearAllMocks();

    mockOctokit = {
      rest: {
        repos: {
          listForOrg: vi.fn(),
        },
      },
      auth: vi.fn(),
      graphql: vi.fn(),
      paginate: {
        iterator: vi.fn(),
      },
      request: vi.fn(),
    };

    // Add paginate to graphql mock
    (mockOctokit.graphql as Record<string, unknown>).paginate = {
      iterator: vi.fn(),
    };

    client = new OctokitClient(mockOctokit as unknown as Octokit);
  });

  it('should return zero counts for a repo with no issues or projects', async () => {
    (
      (mockOctokit.graphql as Record<string, unknown>).paginate as Record<
        string,
        unknown
      >
    ).iterator = vi.fn().mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield {
          repository: {
            issues: {
              pageInfo: { endCursor: null, hasNextPage: false },
              nodes: [],
            },
            projectsV2: { totalCount: 0 },
          },
        };
      },
    });

    const result = await client.getRepoProjectCounts(
      'testorg',
      'testrepo',
      100,
    );

    expect(result).toEqual({
      Org_Name: 'testorg',
      Repo_Name: 'testrepo',
      Issues_Linked_To_Projects: 0,
      Unique_Projects_Linked_By_Issues: 0,
      Projects_Linked_To_Repo: 0,
    });
  });

  it('should count unique projects linked via issues', async () => {
    (
      (mockOctokit.graphql as Record<string, unknown>).paginate as Record<
        string,
        unknown
      >
    ).iterator = vi.fn().mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield {
          repository: {
            issues: {
              pageInfo: { endCursor: null, hasNextPage: false },
              nodes: [
                {
                  projectsV2: {
                    nodes: [
                      { id: 'PVT_1', number: 1, title: 'Project Alpha' },
                      { id: 'PVT_2', number: 2, title: 'Project Beta' },
                    ],
                  },
                },
                {
                  projectsV2: {
                    nodes: [
                      { id: 'PVT_1', number: 1, title: 'Project Alpha' }, // duplicate
                    ],
                  },
                },
                {
                  projectsV2: {
                    nodes: [], // issue with no projects
                  },
                },
              ],
            },
            projectsV2: { totalCount: 5 },
          },
        };
      },
    });

    const result = await client.getRepoProjectCounts(
      'testorg',
      'testrepo',
      100,
    );

    expect(result).toEqual({
      Org_Name: 'testorg',
      Repo_Name: 'testrepo',
      Issues_Linked_To_Projects: 2, // 2 issues that have at least one project
      Unique_Projects_Linked_By_Issues: 2, // 2 distinct projects (Alpha + Beta)
      Projects_Linked_To_Repo: 5, // from repository.projectsV2.totalCount
    });
  });

  it('should handle multiple pages of issues', async () => {
    (
      (mockOctokit.graphql as Record<string, unknown>).paginate as Record<
        string,
        unknown
      >
    ).iterator = vi.fn().mockReturnValue({
      async *[Symbol.asyncIterator]() {
        // First page
        yield {
          repository: {
            issues: {
              pageInfo: { endCursor: 'cursor1', hasNextPage: true },
              nodes: [
                {
                  projectsV2: {
                    nodes: [{ id: 'PVT_A', number: 1, title: 'Project A' }],
                  },
                },
              ],
            },
            projectsV2: { totalCount: 3 },
          },
        };
        // Second page
        yield {
          repository: {
            issues: {
              pageInfo: { endCursor: null, hasNextPage: false },
              nodes: [
                {
                  projectsV2: {
                    nodes: [
                      { id: 'PVT_B', number: 2, title: 'Project B' },
                      { id: 'PVT_C', number: 3, title: 'Project C' },
                    ],
                  },
                },
              ],
            },
            projectsV2: { totalCount: 3 },
          },
        };
      },
    });

    const result = await client.getRepoProjectCounts(
      'testorg',
      'testrepo',
      100,
    );

    expect(result).toEqual({
      Org_Name: 'testorg',
      Repo_Name: 'testrepo',
      Issues_Linked_To_Projects: 2,
      Unique_Projects_Linked_By_Issues: 3,
      Projects_Linked_To_Repo: 3,
    });
  });

  it('should count issues linked to projects correctly even with overlapping projects', async () => {
    (
      (mockOctokit.graphql as Record<string, unknown>).paginate as Record<
        string,
        unknown
      >
    ).iterator = vi.fn().mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield {
          repository: {
            issues: {
              pageInfo: { endCursor: null, hasNextPage: false },
              nodes: [
                {
                  projectsV2: {
                    nodes: [
                      { id: 'PVT_10', number: 10, title: 'Main Board' },
                      { id: 'PVT_20', number: 20, title: 'Sprint Board' },
                    ],
                  },
                },
                {
                  projectsV2: {
                    nodes: [{ id: 'PVT_10', number: 10, title: 'Main Board' }],
                  },
                },
                {
                  projectsV2: {
                    nodes: [
                      { id: 'PVT_20', number: 20, title: 'Sprint Board' },
                      { id: 'PVT_30', number: 30, title: 'Backlog' },
                    ],
                  },
                },
              ],
            },
            projectsV2: { totalCount: 10 },
          },
        };
      },
    });

    const result = await client.getRepoProjectCounts(
      'testorg',
      'testrepo',
      100,
    );

    // All 3 issues have at least one project
    expect(result.Issues_Linked_To_Projects).toBe(3);
    // 3 unique projects: Main Board (10), Sprint Board (20), Backlog (30)
    expect(result.Unique_Projects_Linked_By_Issues).toBe(3);
    expect(result.Projects_Linked_To_Repo).toBe(10);
  });

  it('should handle issues with null projectsV2.nodes', async () => {
    (
      (mockOctokit.graphql as Record<string, unknown>).paginate as Record<
        string,
        unknown
      >
    ).iterator = vi.fn().mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield {
          repository: {
            issues: {
              pageInfo: { endCursor: null, hasNextPage: false },
              nodes: [
                {
                  projectsV2: {
                    nodes: null,
                  },
                },
                {
                  projectsV2: null,
                },
              ],
            },
            projectsV2: { totalCount: 0 },
          },
        };
      },
    });

    const result = await client.getRepoProjectCounts(
      'testorg',
      'testrepo',
      100,
    );

    expect(result).toEqual({
      Org_Name: 'testorg',
      Repo_Name: 'testrepo',
      Issues_Linked_To_Projects: 0,
      Unique_Projects_Linked_By_Issues: 0,
      Projects_Linked_To_Repo: 0,
    });
  });

  it('should capture projectsV2.totalCount only from the first page', async () => {
    (
      (mockOctokit.graphql as Record<string, unknown>).paginate as Record<
        string,
        unknown
      >
    ).iterator = vi.fn().mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield {
          repository: {
            issues: {
              pageInfo: { endCursor: 'cursor1', hasNextPage: true },
              nodes: [],
            },
            projectsV2: { totalCount: 7 },
          },
        };
        yield {
          repository: {
            issues: {
              pageInfo: { endCursor: null, hasNextPage: false },
              nodes: [],
            },
            projectsV2: { totalCount: 999 }, // different value on second page
          },
        };
      },
    });

    const result = await client.getRepoProjectCounts(
      'testorg',
      'testrepo',
      100,
    );

    // Should use the first page value, not 999
    expect(result.Projects_Linked_To_Repo).toBe(7);
  });
});

describe('OctokitClient - listOrgRepoNames', () => {
  let mockOctokit: Record<string, unknown>;
  let client: OctokitClient;

  beforeEach(() => {
    vi.clearAllMocks();

    mockOctokit = {
      rest: {
        repos: {
          listForOrg: vi.fn(),
        },
      },
      auth: vi.fn(),
      graphql: vi.fn(),
      paginate: {
        iterator: vi.fn(),
      },
      request: vi.fn(),
    };

    (mockOctokit.graphql as Record<string, unknown>).paginate = {
      iterator: vi.fn(),
    };

    client = new OctokitClient(mockOctokit as unknown as Octokit);
  });

  it('should yield repo names from a single page', async () => {
    (
      (mockOctokit.graphql as Record<string, unknown>).paginate as Record<
        string,
        unknown
      >
    ).iterator = vi.fn().mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield {
          organization: {
            repositories: {
              pageInfo: { endCursor: null, hasNextPage: false },
              nodes: [
                { name: 'repo-a', owner: { login: 'test-org' } },
                { name: 'repo-b', owner: { login: 'test-org' } },
              ],
            },
          },
        };
      },
    });

    const repos: Array<{ name: string; owner: { login: string } }> = [];
    for await (const repo of client.listOrgRepoNames('test-org', 100)) {
      repos.push(repo);
    }

    expect(repos).toHaveLength(2);
    expect(repos[0].name).toBe('repo-a');
    expect(repos[1].name).toBe('repo-b');
    expect(repos[0].owner.login).toBe('test-org');
  });

  it('should yield repos across multiple pages', async () => {
    (
      (mockOctokit.graphql as Record<string, unknown>).paginate as Record<
        string,
        unknown
      >
    ).iterator = vi.fn().mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield {
          organization: {
            repositories: {
              pageInfo: { endCursor: 'cursor1', hasNextPage: true },
              nodes: [{ name: 'repo-1', owner: { login: 'org1' } }],
            },
          },
        };
        yield {
          organization: {
            repositories: {
              pageInfo: { endCursor: null, hasNextPage: false },
              nodes: [{ name: 'repo-2', owner: { login: 'org1' } }],
            },
          },
        };
      },
    });

    const repos: Array<{ name: string; owner: { login: string } }> = [];
    for await (const repo of client.listOrgRepoNames('org1', 10)) {
      repos.push(repo);
    }

    expect(repos).toHaveLength(2);
    expect(repos.map((r) => r.name)).toEqual(['repo-1', 'repo-2']);
  });

  it('should yield nothing for an org with no repos', async () => {
    (
      (mockOctokit.graphql as Record<string, unknown>).paginate as Record<
        string,
        unknown
      >
    ).iterator = vi.fn().mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield {
          organization: {
            repositories: {
              pageInfo: { endCursor: null, hasNextPage: false },
              nodes: [],
            },
          },
        };
      },
    });

    const repos: Array<{ name: string; owner: { login: string } }> = [];
    for await (const repo of client.listOrgRepoNames('empty-org', 100)) {
      repos.push(repo);
    }

    expect(repos).toHaveLength(0);
  });
});
