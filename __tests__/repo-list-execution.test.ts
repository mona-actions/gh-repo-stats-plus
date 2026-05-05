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
const mockStateInitialize = vi.fn();
const mockWithRetry = vi.fn().mockImplementation(async (fn) => await fn());

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
  initCommand: vi.fn().mockImplementation(async (opts) => ({
    opts,
    logger: mockLogger,
    client: mockClient,
    fileName: '',
    retryConfig: {
      maxAttempts: opts.retryMaxAttempts || 3,
      initialDelayMs: opts.retryInitialDelay || 1000,
      maxDelayMs: opts.retryMaxDelay || 30000,
      backoffFactor: opts.retryBackoffFactor || 2,
      successThreshold: opts.retrySuccessThreshold || 5,
    },
    orgsToProcess: [],
    resumeFromOrgIndex: 0,
  })),
  executeCommand: vi
    .fn()
    .mockImplementation(async (context, config) =>
      config.processSource(context),
    ),
}));

vi.mock('../src/state.js', () => ({
  StateManager: vi.fn().mockImplementation(function () {
    return {
      initialize: mockStateInitialize,
      update: mockStateUpdate,
      cleanup: mockStateCleanup,
    };
  }),
}));

vi.mock('../src/retry.js', () => ({
  withRetry: mockWithRetry,
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

function createProcessedState(
  overrides: Partial<ProcessedPageState> = {},
): ProcessedPageState {
  return {
    organizationName: 'repo-list',
    currentCursor: null,
    processedRepos: [],
    lastSuccessfulCursor: null,
    lastProcessedRepo: null,
    lastUpdated: null,
    completedSuccessfully: false,
    outputFileName: null,
    ...overrides,
  };
}

function applyMockStateUpdate(
  state: ProcessedPageState,
  updates: { repoName?: string | null; lastSuccessfulCursor?: string | null },
): void {
  if (updates.repoName && !state.processedRepos.includes(updates.repoName)) {
    state.processedRepos.push(updates.repoName);
  }
  if (updates.repoName) {
    state.lastProcessedRepo = updates.repoName;
  }
  if (updates.lastSuccessfulCursor) {
    state.lastSuccessfulCursor = updates.lastSuccessfulCursor;
  }
}

describe('standalone repo-list execution', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    mockWithRetry.mockImplementation(async (fn) => await fn());
    mockStateInitialize.mockReturnValue({
      processedState: createProcessedState(),
      resumeFromLastState: false,
    });
    mockStateUpdate.mockImplementation(applyMockStateUpdate);
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

  it('ignores duplicate repo-list entries without extra API calls', async () => {
    const { run } = await import('../src/main.js');
    const { appendFileSync } = await import('fs');

    await run(
      createArgs({
        repoList: [
          'OwnerA/RepoOne',
          'ownera/repoone',
          'OwnerA/RepoTwo',
          'OWNERA/REPOTWO',
        ],
        outputFileName: 'combined.csv',
      }),
    );

    expect(mockClient.getRepoStats).toHaveBeenCalledTimes(2);
    expect(mockClient.getRepoStats).toHaveBeenNthCalledWith(
      1,
      'OwnerA',
      'RepoOne',
      10,
    );
    expect(mockClient.getRepoStats).toHaveBeenNthCalledWith(
      2,
      'OwnerA',
      'RepoTwo',
      10,
    );
    expect(appendFileSync).toHaveBeenCalledTimes(2);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Ignored 2 duplicate repo-list entries',
    );
  });

  it('builds lowercase owner/repo skip keys from saved state', async () => {
    const { buildProcessedRepoKeySet } =
      await import('../src/repo-stats-service.js');

    const result = buildProcessedRepoKeySet({
      organizationName: 'repo-list',
      currentCursor: null,
      processedRepos: ['OwnerA/RepoOne', 'ownerb/repotwo'],
      lastSuccessfulCursor: null,
      lastProcessedRepo: null,
      lastUpdated: null,
      completedSuccessfully: false,
      outputFileName: null,
    });

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

  it('resumes repo-list runs from the existing output file and skips processed lowercase owner/repo keys', async () => {
    const { run } = await import('../src/main.js');
    const { appendFileSync, writeFileSync } = await import('fs');

    mockStateInitialize.mockReturnValue({
      processedState: createProcessedState({
        processedRepos: ['OwnerA/RepoOne'],
        outputFileName: 'existing.csv',
      }),
      resumeFromLastState: true,
    });

    const result = await run(
      createArgs({
        repoList: ['ownera/repoone', 'OwnerA/RepoTwo'],
        outputFileName: 'new.csv',
        resumeFromLastSave: true,
      }),
    );

    expect(result).toEqual(['existing.csv']);
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(mockClient.getRepoStats).toHaveBeenCalledTimes(1);
    expect(mockClient.getRepoStats).toHaveBeenCalledWith(
      'OwnerA',
      'RepoTwo',
      10,
    );
    expect(appendFileSync).toHaveBeenCalledTimes(1);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Skipping already processed repository: ownera/repoone',
    );
  });

  it('updates repo-list state through the retry callback after a processing failure', async () => {
    const { run } = await import('../src/main.js');
    const updateSnapshots: Array<{
      completedSuccessfully: boolean;
      processedRepos: string[];
      updates: {
        repoName?: string | null;
        lastSuccessfulCursor?: string | null;
      };
    }> = [];

    mockClient.getRepoStats
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockImplementation((owner: string, repo: string) =>
        Promise.resolve(createRepo(owner, repo)),
      );
    mockStateUpdate.mockImplementation((state, updates) => {
      updateSnapshots.push({
        completedSuccessfully: state.completedSuccessfully,
        processedRepos: [...state.processedRepos],
        updates: { ...updates },
      });
      applyMockStateUpdate(state, updates);
    });
    mockWithRetry.mockImplementationOnce(
      async (operation, _config, onRetry) => {
        try {
          return await operation();
        } catch (error) {
          onRetry?.({
            attempt: 1,
            successCount: 0,
            retryCount: 1,
            error: error instanceof Error ? error : new Error(String(error)),
          });
          return await operation();
        }
      },
    );

    await run(createArgs({ repoList: ['OwnerA/RepoOne'] }));

    expect(mockClient.getRepoStats).toHaveBeenCalledTimes(2);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'Retry attempt 1: Failed while processing repo-list.',
      ),
    );
    expect(updateSnapshots[1]).toEqual({
      completedSuccessfully: false,
      processedRepos: [],
      updates: {},
    });
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

  it('does not mark repo-list state complete when missing repo-list processing fails', async () => {
    const { run } = await import('../src/main.js');
    const { readCsvFile } = await import('../src/csv.js');
    const completedValues: boolean[] = [];

    vi.mocked(readCsvFile).mockReturnValue([]);
    mockStateUpdate.mockImplementation((state, updates) => {
      applyMockStateUpdate(state, updates);
      completedValues.push(state.completedSuccessfully);
    });
    mockClient.getRepoStats
      .mockResolvedValueOnce(createRepo('OwnerA', 'RepoOne'))
      .mockRejectedValueOnce(new Error('missing processing failed'));

    await expect(
      run(
        createArgs({
          repoList: ['OwnerA/RepoOne'],
          outputFileName: 'combined.csv',
          autoProcessMissing: true,
        }),
      ),
    ).rejects.toThrow('missing processing failed');

    expect(completedValues.at(-1)).toBe(false);
    expect(mockStateCleanup).not.toHaveBeenCalled();
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

  it('does not clean repo-list state when standalone processing fails', async () => {
    const { run } = await import('../src/main.js');

    mockClient.getRepoStats.mockRejectedValueOnce(new Error('repo failed'));

    await expect(
      run(
        createArgs({
          repoList: ['OwnerA/RepoOne'],
          cleanState: true,
        }),
      ),
    ).rejects.toThrow('repo failed');

    expect(mockStateCleanup).not.toHaveBeenCalled();
  });
});
