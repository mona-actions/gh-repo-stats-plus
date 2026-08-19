import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Octokit } from 'octokit';
import type { components } from '@octokit/openapi-types';
import { OctokitClient } from '../src/service.js';

vi.mock('octokit');

type RepoHook = components['schemas']['hook'];
type OrgHook = components['schemas']['org-hook'];

function makeRepoHook(overrides: Partial<RepoHook> = {}): RepoHook {
  return {
    id: 1,
    name: 'web',
    active: true,
    events: ['push'],
    config: { url: 'https://example.com/hook' },
    updated_at: '2024-01-02T00:00:00Z',
    created_at: '2024-01-01T00:00:00Z',
    last_response: { code: 200, status: 'active', message: 'OK' },
    ...overrides,
  } as unknown as RepoHook;
}

function makeOrgHook(overrides: Partial<OrgHook> = {}): OrgHook {
  return {
    id: 10,
    name: 'web',
    active: true,
    events: ['repository'],
    config: { url: 'https://org.example.com/hook' },
    updated_at: '2024-02-02T00:00:00Z',
    created_at: '2024-02-01T00:00:00Z',
    ...overrides,
  } as unknown as OrgHook;
}

describe('OctokitClient - Webhook Methods', () => {
  let mockOctokit: Record<string, unknown>;
  let client: OctokitClient;

  beforeEach(() => {
    vi.clearAllMocks();

    const paginateIteratorFn = vi.fn();

    mockOctokit = {
      rest: {
        repos: {
          listForOrg: vi.fn(),
          listWebhooks: vi.fn(),
        },
        orgs: {
          listWebhooks: vi.fn(),
        },
      },
      auth: vi.fn(),
      graphql: vi.fn(),
      paginate: Object.assign(vi.fn(), {
        iterator: paginateIteratorFn,
      }),
      request: vi.fn(),
    };

    client = new OctokitClient(mockOctokit as unknown as Octokit);
  });

  it('listOrgWebhooks yields hooks across paginated pages', async () => {
    const iteratorFn = (
      mockOctokit.paginate as { iterator: ReturnType<typeof vi.fn> }
    ).iterator;
    iteratorFn.mockImplementation(async function* () {
      yield { data: [makeOrgHook({ id: 1 }), makeOrgHook({ id: 2 })] };
      yield { data: [makeOrgHook({ id: 3 })] };
    });

    const results = [];
    for await (const hook of client.listOrgWebhooks('my-org', 100)) {
      results.push(hook);
    }

    expect(results.map((h) => h.id)).toEqual([1, 2, 3]);
    expect(iteratorFn).toHaveBeenCalledWith(
      (mockOctokit.rest as { orgs: { listWebhooks: unknown } }).orgs
        .listWebhooks,
      expect.objectContaining({ org: 'my-org', per_page: 100 }),
    );
  });

  it('listRepoWebhooks yields hooks for a repository', async () => {
    const iteratorFn = (
      mockOctokit.paginate as { iterator: ReturnType<typeof vi.fn> }
    ).iterator;
    iteratorFn.mockImplementation(async function* () {
      yield { data: [makeRepoHook({ id: 5 })] };
    });

    const results = [];
    for await (const hook of client.listRepoWebhooks('my-org', 'my-repo', 50)) {
      results.push(hook);
    }

    expect(results.map((h) => h.id)).toEqual([5]);
    expect(iteratorFn).toHaveBeenCalledWith(
      (mockOctokit.rest as { repos: { listWebhooks: unknown } }).repos
        .listWebhooks,
      expect.objectContaining({
        owner: 'my-org',
        repo: 'my-repo',
        per_page: 50,
      }),
    );
  });
});
