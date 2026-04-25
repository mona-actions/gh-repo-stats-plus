import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateBatchMatrix, fetchOrgRepos } from '../src/org-repos.js';
import { createMockLogger } from './test-utils.js';

vi.mock('fs');
vi.mock('../src/utils.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/utils.js')>();
  return {
    ...mod,
    resolveOutputPath: vi.fn(
      async (_dir: string, fileName: string) => `/output/${fileName}`,
    ),
  };
});

import { writeFileSync } from 'fs';

function makeClient(repos: { name: string; owner: { login: string } }[]) {
  return {
    listOrgRepoNames: vi.fn().mockImplementation(async function* () {
      for (const repo of repos) yield repo;
    }),
  } as Pick<import('../src/service.js').OctokitClient, 'listOrgRepoNames'>;
}

describe('calculateBatchMatrix', () => {
  it('returns correct indices for an exact division', () => {
    const repos = Array.from({ length: 10 }, (_, i) => `org/repo-${i}`);
    const { batchSize, totalBatches, matrix } = calculateBatchMatrix(
      repos,
      5,
      256,
    );
    expect(totalBatches).toBe(2);
    expect(batchSize).toBe(5);
    expect(matrix['batch-index']).toEqual([0, 1]);
  });

  it('rounds up when repos do not divide evenly', () => {
    const repos = Array.from({ length: 11 }, (_, i) => `org/repo-${i}`);
    const { totalBatches } = calculateBatchMatrix(repos, 5, 256);
    expect(totalBatches).toBe(3);
  });

  it('adjusts batch size when totalBatches would exceed maxBatches', () => {
    const repos = Array.from({ length: 1000 }, (_, i) => `org/repo-${i}`);
    const { batchSize, totalBatches } = calculateBatchMatrix(repos, 1, 10);
    expect(totalBatches).toBeLessThanOrEqual(10);
    expect(batchSize).toBeGreaterThan(1);
  });

  it('returns a single batch for repos <= batchSize', () => {
    const repos = Array.from({ length: 3 }, (_, i) => `org/repo-${i}`);
    const { totalBatches, matrix } = calculateBatchMatrix(repos, 10, 256);
    expect(totalBatches).toBe(1);
    expect(matrix['batch-index']).toEqual([0]);
  });

  it('handles an empty repo list', () => {
    const { totalBatches, matrix } = calculateBatchMatrix([], 10, 256);
    expect(totalBatches).toBe(0);
    expect(matrix['batch-index']).toEqual([]);
  });
});

describe('fetchOrgRepos', () => {
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
  });

  it('returns all repos as owner/repo strings', async () => {
    const client = makeClient([
      { name: 'alpha', owner: { login: 'my-org' } },
      { name: 'beta', owner: { login: 'my-org' } },
    ]);

    const result = await fetchOrgRepos({
      orgName: 'my-org',
      opts: { pageSize: 100 },
      client,
      logger,
    });

    expect(result.repos).toEqual(['my-org/alpha', 'my-org/beta']);
    expect(result.repoCount).toBe(2);
    expect(result.outputFile).toBeUndefined();
    expect(result.matrix).toBeUndefined();
  });

  it('writes repos to file when outputFileName is provided', async () => {
    const client = makeClient([{ name: 'alpha', owner: { login: 'my-org' } }]);

    const result = await fetchOrgRepos({
      orgName: 'my-org',
      opts: { pageSize: 100, outputFileName: 'repos.txt', outputDir: 'output' },
      client,
      logger,
    });

    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('repos.txt'),
      'my-org/alpha\n',
      'utf-8',
    );
    expect(result.outputFile).toBeDefined();
  });

  it('calculates batch matrix when batchSize is provided', async () => {
    const repos = Array.from({ length: 10 }, (_, i) => ({
      name: `repo-${i}`,
      owner: { login: 'my-org' },
    }));
    const client = makeClient(repos);

    const result = await fetchOrgRepos({
      orgName: 'my-org',
      opts: { pageSize: 100, batchSize: 3, maxBatches: 256 },
      client,
      logger,
    });

    expect(result.matrix).toBeDefined();
    expect(result.totalBatches).toBe(4); // ceil(10/3)
    expect(result.batchSize).toBe(3);
    expect(result.matrix!['batch-index']).toEqual([0, 1, 2, 3]);
  });

  it('respects maxBatches limit', async () => {
    const repos = Array.from({ length: 100 }, (_, i) => ({
      name: `repo-${i}`,
      owner: { login: 'my-org' },
    }));
    const client = makeClient(repos);

    const result = await fetchOrgRepos({
      orgName: 'my-org',
      opts: { pageSize: 100, batchSize: 1, maxBatches: 5 },
      client,
      logger,
    });

    expect(result.totalBatches).toBeLessThanOrEqual(5);
  });

  it('handles an org with no repos', async () => {
    const client = makeClient([]);

    const result = await fetchOrgRepos({
      orgName: 'empty-org',
      opts: { pageSize: 100 },
      client,
      logger,
    });

    expect(result.repos).toEqual([]);
    expect(result.repoCount).toBe(0);
  });
});
