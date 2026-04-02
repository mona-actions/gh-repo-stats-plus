import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Octokit } from 'octokit';
import { OctokitClient } from '../src/service.js';

vi.mock('octokit');

describe('OctokitClient - Codespace Stats Methods', () => {
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

  describe('getOrgCodespaces', () => {
    it('should yield individual codespaces from a single page', async () => {
      const paginateIterator = (
        mockOctokit.paginate as ReturnType<typeof vi.fn> & {
          iterator: ReturnType<typeof vi.fn>;
        }
      ).iterator;

      paginateIterator.mockReturnValueOnce(
        (async function* () {
          yield {
            data: [
              {
                name: 'codespace-1',
                state: 'Available',
                machine: {
                  name: 'basicLinux32gb',
                  display_name: 'Basic (32 GB)',
                  cpus: 2,
                  memory_in_bytes: 4294967296,
                  storage_in_bytes: 34359738368,
                },
                billable_owner: { login: 'org-owner' },
                owner: { login: 'dev-user' },
                repository: { name: 'my-repo' },
                last_used_at: '2025-06-15T10:00:00Z',
                created_at: '2025-06-01T08:00:00Z',
              },
            ],
          };
        })(),
      );

      const codespaces = [];
      for await (const cs of client.getOrgCodespaces(
        'test-org',
        100,
        mockLogger,
      )) {
        codespaces.push(cs);
      }

      expect(codespaces).toHaveLength(1);
      expect(codespaces[0].name).toBe('codespace-1');
      expect(codespaces[0].state).toBe('Available');
      expect(codespaces[0].machine?.cpuSize).toBe(2);
      expect(codespaces[0].machine?.memorySize).toBe(4);
      expect(codespaces[0].machine?.storage).toBe(32);
      expect(codespaces[0].billableOwner?.login).toBe('org-owner');
      expect(codespaces[0].owner?.login).toBe('dev-user');
      expect(codespaces[0].repository?.name).toBe('my-repo');
    });

    it('should yield multiple codespaces from the same page', async () => {
      const paginateIterator = (
        mockOctokit.paginate as ReturnType<typeof vi.fn> & {
          iterator: ReturnType<typeof vi.fn>;
        }
      ).iterator;

      paginateIterator.mockReturnValueOnce(
        (async function* () {
          yield {
            data: [
              {
                name: 'cs-1',
                state: 'Available',
                machine: {
                  name: 'basic',
                  display_name: 'Basic',
                  cpus: 2,
                  memory_in_bytes: 4294967296,
                  storage_in_bytes: 34359738368,
                },
                billable_owner: { login: 'owner' },
                owner: { login: 'user1' },
                repository: { name: 'repo-a' },
                last_used_at: '2025-06-15T10:00:00Z',
                created_at: '2025-06-01T08:00:00Z',
              },
              {
                name: 'cs-2',
                state: 'Shutdown',
                machine: {
                  name: 'basic',
                  display_name: 'Basic',
                  cpus: 2,
                  memory_in_bytes: 4294967296,
                  storage_in_bytes: 34359738368,
                },
                billable_owner: { login: 'owner' },
                owner: { login: 'user2' },
                repository: { name: 'repo-a' },
                last_used_at: '2025-06-10T14:00:00Z',
                created_at: '2025-05-20T09:00:00Z',
              },
              {
                name: 'cs-3',
                state: 'Available',
                machine: {
                  name: 'premium',
                  display_name: 'Premium',
                  cpus: 8,
                  memory_in_bytes: 17179869184,
                  storage_in_bytes: 68719476736,
                },
                billable_owner: { login: 'owner' },
                owner: { login: 'user3' },
                repository: { name: 'repo-b' },
                last_used_at: '2025-06-14T12:00:00Z',
                created_at: '2025-06-02T10:00:00Z',
              },
            ],
          };
        })(),
      );

      const codespaces = [];
      for await (const cs of client.getOrgCodespaces(
        'test-org',
        100,
        mockLogger,
      )) {
        codespaces.push(cs);
      }

      expect(codespaces).toHaveLength(3);
      expect(codespaces[0].name).toBe('cs-1');
      expect(codespaces[0].repository?.name).toBe('repo-a');
      expect(codespaces[1].name).toBe('cs-2');
      expect(codespaces[1].repository?.name).toBe('repo-a');
      expect(codespaces[2].name).toBe('cs-3');
      expect(codespaces[2].repository?.name).toBe('repo-b');
    });

    it('should handle codespace with null machine', async () => {
      const paginateIterator = (
        mockOctokit.paginate as ReturnType<typeof vi.fn> & {
          iterator: ReturnType<typeof vi.fn>;
        }
      ).iterator;

      paginateIterator.mockReturnValueOnce(
        (async function* () {
          yield {
            data: [
              {
                name: 'cs-no-machine',
                state: 'Queued',
                machine: null,
                billable_owner: null,
                owner: null,
                repository: { name: 'some-repo' },
                last_used_at: null,
                created_at: '2025-06-01T08:00:00Z',
              },
            ],
          };
        })(),
      );

      const codespaces = [];
      for await (const cs of client.getOrgCodespaces(
        'test-org',
        100,
        mockLogger,
      )) {
        codespaces.push(cs);
      }

      expect(codespaces).toHaveLength(1);
      expect(codespaces[0].machine).toBeNull();
      expect(codespaces[0].billableOwner).toBeNull();
      expect(codespaces[0].owner).toBeNull();
      expect(codespaces[0].lastUsedAt).toBeNull();
    });

    it('should handle codespace with no repository', async () => {
      const paginateIterator = (
        mockOctokit.paginate as ReturnType<typeof vi.fn> & {
          iterator: ReturnType<typeof vi.fn>;
        }
      ).iterator;

      paginateIterator.mockReturnValueOnce(
        (async function* () {
          yield {
            data: [
              {
                name: 'orphan-codespace',
                state: 'Available',
                machine: {
                  name: 'basic',
                  display_name: 'Basic',
                  cpus: 2,
                  memory_in_bytes: 4294967296,
                  storage_in_bytes: 34359738368,
                },
                billable_owner: { login: 'owner' },
                owner: { login: 'user1' },
                repository: null,
                last_used_at: '2025-06-15T10:00:00Z',
                created_at: '2025-06-01T08:00:00Z',
              },
            ],
          };
        })(),
      );

      const codespaces = [];
      for await (const cs of client.getOrgCodespaces(
        'test-org',
        100,
        mockLogger,
      )) {
        codespaces.push(cs);
      }

      expect(codespaces).toHaveLength(1);
      expect(codespaces[0].repository).toBeNull();
    });

    it('should handle empty codespaces list', async () => {
      const paginateIterator = (
        mockOctokit.paginate as ReturnType<typeof vi.fn> & {
          iterator: ReturnType<typeof vi.fn>;
        }
      ).iterator;

      paginateIterator.mockReturnValueOnce(
        (async function* () {
          yield {
            data: [],
          };
        })(),
      );

      const codespaces = [];
      for await (const cs of client.getOrgCodespaces(
        'empty-org',
        100,
        mockLogger,
      )) {
        codespaces.push(cs);
      }

      expect(codespaces).toHaveLength(0);
    });

    it('should yield codespaces across multiple pages without duplication', async () => {
      const paginateIterator = (
        mockOctokit.paginate as ReturnType<typeof vi.fn> & {
          iterator: ReturnType<typeof vi.fn>;
        }
      ).iterator;

      paginateIterator.mockReturnValueOnce(
        (async function* () {
          yield {
            data: [
              {
                name: 'cs-page1',
                state: 'Available',
                machine: {
                  name: 'basic',
                  display_name: 'Basic',
                  cpus: 2,
                  memory_in_bytes: 4294967296,
                  storage_in_bytes: 34359738368,
                },
                billable_owner: { login: 'owner' },
                owner: { login: 'user1' },
                repository: { name: 'repo-a' },
                last_used_at: '2025-06-15T10:00:00Z',
                created_at: '2025-06-01T08:00:00Z',
              },
            ],
          };
          yield {
            data: [
              {
                name: 'cs-page2',
                state: 'Shutdown',
                machine: {
                  name: 'premium',
                  display_name: 'Premium',
                  cpus: 8,
                  memory_in_bytes: 17179869184,
                  storage_in_bytes: 68719476736,
                },
                billable_owner: { login: 'owner' },
                owner: { login: 'user2' },
                repository: { name: 'repo-a' },
                last_used_at: '2025-06-10T14:00:00Z',
                created_at: '2025-05-20T09:00:00Z',
              },
            ],
          };
        })(),
      );

      const codespaces = [];
      for await (const cs of client.getOrgCodespaces(
        'test-org',
        1,
        mockLogger,
      )) {
        codespaces.push(cs);
      }

      // Both codespaces from the same repo should be yielded individually
      expect(codespaces).toHaveLength(2);
      expect(codespaces[0].name).toBe('cs-page1');
      expect(codespaces[0].repository?.name).toBe('repo-a');
      expect(codespaces[1].name).toBe('cs-page2');
      expect(codespaces[1].repository?.name).toBe('repo-a');
    });
  });
});
