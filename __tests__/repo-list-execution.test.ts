import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Arguments, ProcessedPageState } from '../src/types.js';
import { createMockLogger, createMockRepositoryStats } from './test-utils.js';

const mockLogger = createMockLogger();
const mockClient = {
  getRepoStats: vi.fn(),
  checkRateLimits: vi.fn().mockResolvedValue({
    graphQLRemaining: 5000,
    apiRemainingRequest: 5000,
    messageType: 'info',
    message: 'Rate limits OK',
  }),
};
const mockStateUpdate = vi.fn();
const mockStateCleanup = vi.fn();

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

vi.mock('../src/csv.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/csv.js')>();
  return {
    ...actual,
    readCsvFile: vi.fn(),
  };
});

vi.mock('../src/init.js', () => ({
  initCommand: vi.fn(),
  executeCommand: vi.fn(),
  createClientFromOpts: vi.fn().mockResolvedValue({
    logger: mockLogger,
    client: mockClient,
  }),
}));

vi.mock('../src/state.js', () => ({
  StateManager: vi.fn().mockImplementation(function () {
    return {
      initialize: vi.fn().mockReturnValue({
        processedState: {
          organizationName: 'repo-list',
          currentCursor: null,
          processedRepos: [],
          lastSuccessfulCursor: null,
          lastProcessedRepo: null,
          lastUpdated: null,
          completedSuccessfully: false,
          outputFileName: null,
        },
        resumeFromLastState: false,
      }),
      update: mockStateUpdate,
      cleanup: mockStateCleanup,
    };
  }),
}));

vi.mock('../src/retry.js', () => ({
  withRetry: vi.fn().mockImplementation(async (fn) => await fn()),
}));

vi.mock('../src/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils.js')>();
  return {
    ...actual,
    resolveOutputPath: vi.fn(
      async (_dir: string, fileName: string) => fileName,
    ),
    formatElapsedTime: vi.fn().mockReturnValue('0m 0s'),
  };
});

function createRepo(owner: string, repo: string) {
  return createMockRepositoryStats({
    owner: { login: owner },
    name: repo,
    issues: {
      totalCount: 0,
      pageInfo: { endCursor: null, hasNextPage: false },
      nodes: [],
    },
    pullRequests: {
      totalCount: 0,
      pageInfo: { endCursor: null, hasNextPage: false },
      nodes: [],
    },
  });
}

function createArgs(overrides: Partial<Arguments> = {}): Arguments {
  return {
    orgName: undefined,
    orgList: [],
    baseUrl: 'https://api.github.com',
    proxyUrl: undefined,
    pageSize: 10,
    extraPageSize: 25,
    verbose: false,
    accessToken: 'token',
    outputDir: 'output',
    repoList: [],
    ...overrides,
  } as Arguments;
}

describe('standalone repo-list execution', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    mockStateUpdate.mockImplementation(
      (
        state: ProcessedPageState,
        updates: { repoName?: string | null },
      ): void => {
        if (
          updates.repoName &&
          !state.processedRepos.includes(updates.repoName)
        ) {
          state.processedRepos.push(updates.repoName);
        }
      },
    );
    mockClient.getRepoStats.mockImplementation((owner: string, repo: string) =>
      Promise.resolve(createRepo(owner, repo)),
    );
  });

  it('processes multi-owner repo lists into one combined CSV/state namespace', async () => {
    const { run } = await import('../src/main.js');
    const { appendFileSync, writeFileSync } = await import('fs');
    const { StateManager } = await import('../src/state.js');

    const result = await run(
      createArgs({
        repoList: ['OwnerA/RepoOne', 'OwnerB/RepoTwo'],
        outputFileName: 'combined.csv',
      }),
    );

    expect(result).toEqual(['combined.csv']);
    expect(StateManager).toHaveBeenCalledWith(
      'output',
      'repo-list',
      mockLogger,
    );
    expect(writeFileSync).toHaveBeenCalledTimes(1);
    expect(appendFileSync).toHaveBeenCalledTimes(2);
    expect(mockClient.getRepoStats).toHaveBeenNthCalledWith(
      1,
      'OwnerA',
      'RepoOne',
      10,
    );
    expect(mockClient.getRepoStats).toHaveBeenNthCalledWith(
      2,
      'OwnerB',
      'RepoTwo',
      10,
    );

    const processedRepoKeys = mockStateUpdate.mock.calls
      .map(
        ([, updates]: [ProcessedPageState, { repoName?: string }]) =>
          updates.repoName,
      )
      .filter(Boolean);
    expect(processedRepoKeys).toEqual(['ownera/repoone', 'ownerb/repotwo']);
  });

  it('builds lowercase owner/repo skip keys from saved state', async () => {
    const { buildProcessedRepoKeySet } = await import('../src/main.js');

    const result = buildProcessedRepoKeySet(
      {
        organizationName: 'repo-list',
        currentCursor: null,
        processedRepos: ['OwnerA/RepoOne', 'ownerb/repotwo'],
        lastSuccessfulCursor: null,
        lastProcessedRepo: null,
        lastUpdated: null,
        completedSuccessfully: false,
        outputFileName: null,
      },
      'repo-list',
    );

    expect([...result]).toEqual(['ownera/repoone', 'ownerb/repotwo']);
  });

  it('uses a global rate-limit counter across owner groups', async () => {
    const { run } = await import('../src/main.js');

    await run(
      createArgs({
        repoList: ['OwnerA/One', 'OwnerB/Two'],
        rateLimitCheckInterval: 2,
      }),
    );

    expect(mockClient.checkRateLimits).toHaveBeenCalledTimes(1);
  });

  it('rejects multi-owner repo-list runs with GitHub App installation auth', async () => {
    const { run } = await import('../src/main.js');

    await expect(
      run(
        createArgs({
          repoList: ['OwnerA/One', 'OwnerB/Two'],
          accessToken: undefined,
          appId: '123',
          privateKey: 'private-key',
          appInstallationId: '456',
        }),
      ),
    ).rejects.toThrow(
      'Standalone --repo-list with GitHub App installation auth currently supports one owner per run',
    );
  });

  it('rejects repo-list GitHub App auto installation lookup without token auth', async () => {
    const { run } = await import('../src/main.js');

    await expect(
      run(
        createArgs({
          repoList: ['OwnerA/One'],
          accessToken: undefined,
          appId: '123',
          privateKey: 'private-key',
        }),
      ),
    ).rejects.toThrow(
      'Standalone --repo-list does not currently support GitHub App auto installation lookup',
    );
  });

  it('auto-processes missing standalone repo-list rows from combined CSV owner/repo keys', async () => {
    const { run } = await import('../src/main.js');
    const { appendFileSync } = await import('fs');
    const { readCsvFile } = await import('../src/csv.js');

    vi.mocked(readCsvFile).mockReturnValue([
      { Org_Name: 'OWNERA', Repo_Name: 'Shared' },
    ]);

    const result = await run(
      createArgs({
        repoList: ['OwnerA/Shared', 'OwnerB/Shared'],
        outputFileName: 'combined.csv',
        autoProcessMissing: true,
      }),
    );

    expect(result).toEqual(['combined.csv']);
    expect(readCsvFile).toHaveBeenCalledWith('combined.csv');
    expect(mockClient.getRepoStats).toHaveBeenCalledTimes(3);
    expect(mockClient.getRepoStats).toHaveBeenNthCalledWith(
      1,
      'OwnerA',
      'Shared',
      10,
    );
    expect(mockClient.getRepoStats).toHaveBeenNthCalledWith(
      2,
      'OwnerB',
      'Shared',
      10,
    );
    expect(mockClient.getRepoStats).toHaveBeenNthCalledWith(
      3,
      'OwnerB',
      'Shared',
      10,
    );
    expect(appendFileSync).toHaveBeenCalledTimes(3);
  });

  it('cleans repo-list state after successful standalone processing when requested', async () => {
    const { run } = await import('../src/main.js');

    await run(
      createArgs({
        repoList: ['OwnerA/RepoOne'],
        cleanState: true,
      }),
    );

    expect(mockStateCleanup).toHaveBeenCalledTimes(1);
  });
});
