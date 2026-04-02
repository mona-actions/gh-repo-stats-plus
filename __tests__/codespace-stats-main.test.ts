import { describe, it, expect } from 'vitest';
import { codespaceToResult } from '../src/codespaces.js';
import { Codespace } from '../src/types.js';

describe('codespaceToResult', () => {
  it('should map a codespace with full details to a result', () => {
    const codespace: Codespace = {
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
    };

    const result = codespaceToResult('test-org', codespace);

    expect(result.Org_Name).toBe('test-org');
    expect(result.Repo_Name).toBe('my-repo');
    expect(result.Codespace_Name).toBe('codespace-1');
    expect(result.State).toBe('Available');
    expect(result.Machine_Name).toBe('basicLinux32gb');
    expect(result.CPU_Size).toBe('2');
    expect(result.Memory_Size_GB).toBe('4');
    expect(result.Storage_GB).toBe('32');
    expect(result.Billable_Owner).toBe('org-owner');
    expect(result.Owner).toBe('dev-user');
    expect(result.Last_Used_At).toBe('2025-06-15T10:00:00Z');
    expect(result.Created_At).toBe('2025-06-01T08:00:00Z');
  });

  it('should handle codespace with no machine info', () => {
    const codespace: Codespace = {
      name: 'codespace-no-machine',
      state: 'Queued',
      machine: null,
      billableOwner: null,
      owner: null,
      repository: { name: 'repo-with-null-machine' },
      lastUsedAt: null,
      createdAt: '2025-06-01T08:00:00Z',
    };

    const result = codespaceToResult('test-org', codespace);

    expect(result.Codespace_Name).toBe('codespace-no-machine');
    expect(result.Repo_Name).toBe('repo-with-null-machine');
    expect(result.State).toBe('Queued');
    expect(result.Machine_Name).toBe('N/A');
    expect(result.CPU_Size).toBe('N/A');
    expect(result.Memory_Size_GB).toBe('N/A');
    expect(result.Storage_GB).toBe('N/A');
    expect(result.Billable_Owner).toBe('N/A');
    expect(result.Owner).toBe('N/A');
    expect(result.Last_Used_At).toBe('N/A');
    expect(result.Created_At).toBe('2025-06-01T08:00:00Z');
  });

  it('should handle codespace with no repository', () => {
    const codespace: Codespace = {
      name: 'orphan-codespace',
      state: 'Available',
      machine: {
        name: 'basicLinux32gb',
        displayName: 'Basic',
        cpuSize: 2,
        memorySize: 4,
        storage: 32,
      },
      billableOwner: { login: 'org-owner' },
      owner: { login: 'dev-user' },
      repository: null,
      lastUsedAt: '2025-06-15T10:00:00Z',
      createdAt: '2025-06-01T08:00:00Z',
    };

    const result = codespaceToResult('test-org', codespace);

    expect(result.Repo_Name).toBe('Unknown');
    expect(result.Codespace_Name).toBe('orphan-codespace');
  });

  it('should handle codespace with partial owner info', () => {
    const codespace: Codespace = {
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
    };

    const result = codespaceToResult('test-org', codespace);

    expect(result.Billable_Owner).toBe('billing-user');
    expect(result.Owner).toBe('N/A');
  });
});
