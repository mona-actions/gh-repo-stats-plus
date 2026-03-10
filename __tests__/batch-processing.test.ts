import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockLogger } from './test-utils.js';

// Mock fs module
vi.mock('fs');

import { getRepoListForBatch } from '../src/main.js';
import repoStatsCommand from '../src/commands/repo-stats-command.js';

// Mock the main module's run function to avoid side effects in command tests
vi.mock('../src/main.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/main.js')>();
  return {
    ...mod,
    run: vi.fn(),
  };
});

function createMockClient(repoNames: string[]) {
  return {
    listOrgRepoNames: vi.fn().mockImplementation(async function* () {
      for (const name of repoNames) {
        yield { name, owner: { login: 'test-org' } };
      }
    }),
  } as Pick<import('../src/service.js').OctokitClient, 'listOrgRepoNames'>;
}

describe('getRepoListForBatch', () => {
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
  });

  it('should return the correct slice for batch 0', async () => {
    const repoNames = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];
    const client = createMockClient(repoNames);

    const result = await getRepoListForBatch({
      client,
      orgName: 'test-org',
      batchSize: 2,
      batchIndex: 0,
      pageSize: 10,
      logger,
    });

    expect(result).toEqual(['test-org/alpha', 'test-org/bravo']);
  });

  it('should return the correct slice for batch 1', async () => {
    const repoNames = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];
    const client = createMockClient(repoNames);

    const result = await getRepoListForBatch({
      client,
      orgName: 'test-org',
      batchSize: 2,
      batchIndex: 1,
      pageSize: 10,
      logger,
    });

    expect(result).toEqual(['test-org/charlie', 'test-org/delta']);
  });

  it('should return the remaining repos for the last batch', async () => {
    const repoNames = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];
    const client = createMockClient(repoNames);

    const result = await getRepoListForBatch({
      client,
      orgName: 'test-org',
      batchSize: 2,
      batchIndex: 2,
      pageSize: 10,
      logger,
    });

    expect(result).toEqual(['test-org/echo']);
  });

  it('should return empty array when batch index exceeds total batches', async () => {
    const repoNames = ['alpha', 'bravo', 'charlie'];
    const client = createMockClient(repoNames);

    const result = await getRepoListForBatch({
      client,
      orgName: 'test-org',
      batchSize: 2,
      batchIndex: 5,
      pageSize: 10,
      logger,
    });

    expect(result).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('out of range'),
    );
  });

  it('should return all repos when batch size exceeds total repos', async () => {
    const repoNames = ['alpha', 'bravo'];
    const client = createMockClient(repoNames);

    const result = await getRepoListForBatch({
      client,
      orgName: 'test-org',
      batchSize: 100,
      batchIndex: 0,
      pageSize: 10,
      logger,
    });

    expect(result).toEqual(['test-org/alpha', 'test-org/bravo']);
  });

  it('should return empty array when org has no repos', async () => {
    const client = createMockClient([]);

    const result = await getRepoListForBatch({
      client,
      orgName: 'test-org',
      batchSize: 10,
      batchIndex: 0,
      pageSize: 10,
      logger,
    });

    expect(result).toEqual([]);
  });

  it('should log total repos and batch count', async () => {
    const repoNames = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];
    const client = createMockClient(repoNames);

    await getRepoListForBatch({
      client,
      orgName: 'test-org',
      batchSize: 2,
      batchIndex: 0,
      pageSize: 10,
      logger,
    });

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Total repositories: 5'),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Total batches: 3'),
    );
  });

  it('should log batch range info', async () => {
    const repoNames = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];
    const client = createMockClient(repoNames);

    await getRepoListForBatch({
      client,
      orgName: 'test-org',
      batchSize: 2,
      batchIndex: 1,
      pageSize: 10,
      logger,
    });

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('processing repositories 3-4 of 5'),
    );
  });

  it('should handle batch size of 1', async () => {
    const repoNames = ['alpha', 'bravo', 'charlie'];
    const client = createMockClient(repoNames);

    const result = await getRepoListForBatch({
      client,
      orgName: 'test-org',
      batchSize: 1,
      batchIndex: 1,
      pageSize: 10,
      logger,
    });

    expect(result).toEqual(['test-org/bravo']);
  });

  it('should pass pageSize to listOrgRepoNames', async () => {
    const client = createMockClient(['alpha']);

    await getRepoListForBatch({
      client,
      orgName: 'test-org',
      batchSize: 10,
      batchIndex: 0,
      pageSize: 50,
      logger,
    });

    expect(client.listOrgRepoNames).toHaveBeenCalledWith('test-org', 50);
  });
});

describe('repo-stats-command batch options', () => {
  it('should have batch-size option defined', () => {
    const options = repoStatsCommand.options;
    const optionNames = options.map((opt) => opt.long);
    expect(optionNames).toContain('--batch-size');
  });

  it('should have batch-index option defined', () => {
    const options = repoStatsCommand.options;
    const optionNames = options.map((opt) => opt.long);
    expect(optionNames).toContain('--batch-index');
  });

  it('should have batch-index default to 0', () => {
    const batchIndexOption = repoStatsCommand.options.find(
      (opt) => opt.long === '--batch-index',
    );
    expect(batchIndexOption?.defaultValue).toBe(0);
  });

  it('should have environment variable mappings for batch options', () => {
    const batchSizeOption = repoStatsCommand.options.find(
      (opt) => opt.long === '--batch-size',
    );
    expect(batchSizeOption?.envVar).toBe('BATCH_SIZE');

    const batchIndexOption = repoStatsCommand.options.find(
      (opt) => opt.long === '--batch-index',
    );
    expect(batchIndexOption?.envVar).toBe('BATCH_INDEX');
  });
});
