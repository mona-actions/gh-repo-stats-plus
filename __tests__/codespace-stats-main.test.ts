import { describe, it, expect } from 'vitest';
import { codespaceRepositoryToResults } from '../src/codespaces.js';
import { CodespaceRepository } from '../src/types.js';

describe('codespaceRepositoryToResults', () => {
  it('should map a repository with codespaces to results', () => {
    const repo: CodespaceRepository = {
      name: 'my-repo',
      codespaces: {
        totalCount: 2,
        nodes: [
          {
            name: 'codespace-1',
            state: 'Available',
            machine: {
              name: 'basicLinux32gb',
              displayName: 'Basic (32 GB)',
              cpuSize: 2,
              memorySize: 4,
              storage: 32,
            },
            billableOwner: { login: 'org-owner' },
            owner: { login: 'dev-user' },
            repository: { name: 'my-repo' },
            lastUsedAt: '2025-06-15T10:00:00Z',
            createdAt: '2025-06-01T08:00:00Z',
          },
          {
            name: 'codespace-2',
            state: 'Shutdown',
            machine: {
              name: 'premiumLinux',
              displayName: 'Premium',
              cpuSize: 8,
              memorySize: 16,
              storage: 64,
            },
            billableOwner: { login: 'org-owner' },
            owner: { login: 'other-user' },
            repository: { name: 'my-repo' },
            lastUsedAt: '2025-06-10T14:00:00Z',
            createdAt: '2025-05-20T09:00:00Z',
          },
        ],
      },
    };

    const results = codespaceRepositoryToResults('test-org', repo);

    expect(results).toHaveLength(2);

    expect(results[0].Org_Name).toBe('test-org');
    expect(results[0].Repo_Name).toBe('my-repo');
    expect(results[0].Codespace_Name).toBe('codespace-1');
    expect(results[0].State).toBe('Available');
    expect(results[0].Machine_Name).toBe('basicLinux32gb');
    expect(results[0].CPU_Size).toBe('2');
    expect(results[0].Memory_Size_GB).toBe('4');
    expect(results[0].Storage_GB).toBe('32');
    expect(results[0].Billable_Owner).toBe('org-owner');
    expect(results[0].Owner).toBe('dev-user');
    expect(results[0].Last_Used_At).toBe('2025-06-15T10:00:00Z');
    expect(results[0].Created_At).toBe('2025-06-01T08:00:00Z');

    expect(results[1].Codespace_Name).toBe('codespace-2');
    expect(results[1].State).toBe('Shutdown');
    expect(results[1].CPU_Size).toBe('8');
    expect(results[1].Memory_Size_GB).toBe('16');
    expect(results[1].Storage_GB).toBe('64');
    expect(results[1].Owner).toBe('other-user');
  });

  it('should handle repository with no codespaces', () => {
    const repo: CodespaceRepository = {
      name: 'empty-repo',
      codespaces: {
        totalCount: 0,
        nodes: [],
      },
    };

    const results = codespaceRepositoryToResults('test-org', repo);

    expect(results).toHaveLength(1);
    expect(results[0].Org_Name).toBe('test-org');
    expect(results[0].Repo_Name).toBe('empty-repo');
    expect(results[0].Codespace_Name).toBe('N/A');
    expect(results[0].State).toBe('N/A');
    expect(results[0].Machine_Name).toBe('N/A');
    expect(results[0].CPU_Size).toBe('N/A');
    expect(results[0].Memory_Size_GB).toBe('N/A');
    expect(results[0].Storage_GB).toBe('N/A');
    expect(results[0].Billable_Owner).toBe('N/A');
    expect(results[0].Owner).toBe('N/A');
    expect(results[0].Last_Used_At).toBe('N/A');
    expect(results[0].Created_At).toBe('N/A');
  });

  it('should handle codespace with no machine info', () => {
    const repo: CodespaceRepository = {
      name: 'repo-with-null-machine',
      codespaces: {
        totalCount: 1,
        nodes: [
          {
            name: 'codespace-no-machine',
            state: 'Queued',
            machine: null,
            billableOwner: null,
            owner: null,
            repository: { name: 'repo-with-null-machine' },
            lastUsedAt: null,
            createdAt: '2025-06-01T08:00:00Z',
          },
        ],
      },
    };

    const results = codespaceRepositoryToResults('test-org', repo);

    expect(results).toHaveLength(1);
    expect(results[0].Codespace_Name).toBe('codespace-no-machine');
    expect(results[0].State).toBe('Queued');
    expect(results[0].Machine_Name).toBe('N/A');
    expect(results[0].CPU_Size).toBe('N/A');
    expect(results[0].Memory_Size_GB).toBe('N/A');
    expect(results[0].Storage_GB).toBe('N/A');
    expect(results[0].Billable_Owner).toBe('N/A');
    expect(results[0].Owner).toBe('N/A');
    expect(results[0].Last_Used_At).toBe('N/A');
    expect(results[0].Created_At).toBe('2025-06-01T08:00:00Z');
  });

  it('should handle codespace with partial owner info', () => {
    const repo: CodespaceRepository = {
      name: 'partial-repo',
      codespaces: {
        totalCount: 1,
        nodes: [
          {
            name: 'partial-codespace',
            state: 'Available',
            machine: {
              name: 'basicLinux32gb',
              displayName: 'Basic',
              cpuSize: 2,
              memorySize: 4,
              storage: 32,
            },
            billableOwner: { login: 'billing-user' },
            owner: null,
            repository: { name: 'partial-repo' },
            lastUsedAt: '2025-06-15T10:00:00Z',
            createdAt: '2025-06-01T08:00:00Z',
          },
        ],
      },
    };

    const results = codespaceRepositoryToResults('test-org', repo);

    expect(results).toHaveLength(1);
    expect(results[0].Billable_Owner).toBe('billing-user');
    expect(results[0].Owner).toBe('N/A');
  });
});
