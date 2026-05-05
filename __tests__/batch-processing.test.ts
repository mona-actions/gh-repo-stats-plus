import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockLogger } from './test-utils.js';

// Mock fs module
vi.mock('fs');

import { existsSync, readFileSync } from 'fs';

import { getRepoListForBatch } from '../src/repo-stats-batch.js';
import repoStatsCommand from '../src/commands/repo-stats-command.js';
import projectStatsCommand from '../src/commands/project-stats-command.js';

// Mock the main module's run function to avoid side effects in command tests
vi.mock('../src/main.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/main.js')>();
  return {
    ...mod,
    run: vi.fn(),
  };
});

// Mock the projects module's runProjectStats function to avoid side effects
vi.mock('../src/projects.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/projects.js')>();
  return {
    ...mod,
    runProjectStats: vi.fn(),
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

describe('getRepoListForBatch with repoListFile', () => {
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
  });

  it('should read repos from file and skip listOrgRepoNames', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      'test-org/alpha\ntest-org/bravo\ntest-org/charlie\n',
    );
    const client = createMockClient(['should-not-be-used']);

    const result = await getRepoListForBatch({
      client,
      orgName: 'test-org',
      batchSize: 2,
      batchIndex: 0,
      pageSize: 10,
      logger,
      repoListFile: '/tmp/repos.txt',
    });

    expect(result).toEqual(['test-org/alpha', 'test-org/bravo']);
    expect(client.listOrgRepoNames).not.toHaveBeenCalled();
  });

  it('should slice the second batch from a file', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      'test-org/alpha\ntest-org/bravo\ntest-org/charlie\ntest-org/delta\n',
    );
    const client = createMockClient([]);

    const result = await getRepoListForBatch({
      client,
      orgName: 'test-org',
      batchSize: 2,
      batchIndex: 1,
      pageSize: 10,
      logger,
      repoListFile: '/tmp/repos.txt',
    });

    expect(result).toEqual(['test-org/charlie', 'test-org/delta']);
  });

  it('should accept bare repo names and prefix them with orgName', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('alpha\nbravo\ncharlie\n');
    const client = createMockClient([]);

    const result = await getRepoListForBatch({
      client,
      orgName: 'test-org',
      batchSize: 10,
      batchIndex: 0,
      pageSize: 10,
      logger,
      repoListFile: '/tmp/repos.txt',
    });

    expect(result).toEqual([
      'test-org/alpha',
      'test-org/bravo',
      'test-org/charlie',
    ]);
  });

  it('should ignore blank lines and comments', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      '# header comment\ntest-org/alpha\n\n# spacer\ntest-org/bravo\n',
    );
    const client = createMockClient([]);

    const result = await getRepoListForBatch({
      client,
      orgName: 'test-org',
      batchSize: 10,
      batchIndex: 0,
      pageSize: 10,
      logger,
      repoListFile: '/tmp/repos.txt',
    });

    expect(result).toEqual(['test-org/alpha', 'test-org/bravo']);
  });

  it('should skip entries whose owner does not match orgName and warn', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      'test-org/alpha\nother-org/bravo\ntest-org/charlie\n',
    );
    const client = createMockClient([]);

    const result = await getRepoListForBatch({
      client,
      orgName: 'test-org',
      batchSize: 10,
      batchIndex: 0,
      pageSize: 10,
      logger,
      repoListFile: '/tmp/repos.txt',
    });

    expect(result).toEqual(['test-org/alpha', 'test-org/charlie']);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("does not match --org-name 'test-org'"),
    );
  });

  it('should be case-insensitive on owner match', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('Test-Org/alpha\nTEST-ORG/bravo\n');
    const client = createMockClient([]);

    const result = await getRepoListForBatch({
      client,
      orgName: 'test-org',
      batchSize: 10,
      batchIndex: 0,
      pageSize: 10,
      logger,
      repoListFile: '/tmp/repos.txt',
    });

    expect(result).toEqual(['Test-Org/alpha', 'TEST-ORG/bravo']);
  });

  it('should throw when the file does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const client = createMockClient([]);

    await expect(
      getRepoListForBatch({
        client,
        orgName: 'test-org',
        batchSize: 10,
        batchIndex: 0,
        pageSize: 10,
        logger,
        repoListFile: '/tmp/missing.txt',
      }),
    ).rejects.toThrow(/Batch repo list file not found/);
  });

  it('should warn on malformed entries and continue', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      'test-org/alpha\ntoo/many/slashes\n/empty-owner\nowner/\ntest-org/bravo\n',
    );
    const client = createMockClient([]);

    const result = await getRepoListForBatch({
      client,
      orgName: 'test-org',
      batchSize: 10,
      batchIndex: 0,
      pageSize: 10,
      logger,
      repoListFile: '/tmp/repos.txt',
    });

    expect(result).toEqual(['test-org/alpha', 'test-org/bravo']);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('malformed entry'),
    );
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

  it('should have batch-repo-list-file option defined', () => {
    const optionNames = repoStatsCommand.options.map((opt) => opt.long);
    expect(optionNames).toContain('--batch-repo-list-file');
  });

  it('should map BATCH_REPO_LIST_FILE env var', () => {
    const opt = repoStatsCommand.options.find(
      (o) => o.long === '--batch-repo-list-file',
    );
    expect(opt?.envVar).toBe('BATCH_REPO_LIST_FILE');
  });
});

describe('project-stats-command batch options', () => {
  it('should have batch-size option defined', () => {
    const options = projectStatsCommand.options;
    const optionNames = options.map((opt) => opt.long);
    expect(optionNames).toContain('--batch-size');
  });

  it('should have batch-index option defined', () => {
    const options = projectStatsCommand.options;
    const optionNames = options.map((opt) => opt.long);
    expect(optionNames).toContain('--batch-index');
  });

  it('should have batch-delay option defined', () => {
    const options = projectStatsCommand.options;
    const optionNames = options.map((opt) => opt.long);
    expect(optionNames).toContain('--batch-delay');
  });

  it('should have batch-index default to 0', () => {
    const batchIndexOption = projectStatsCommand.options.find(
      (opt) => opt.long === '--batch-index',
    );
    expect(batchIndexOption?.defaultValue).toBe(0);
  });

  it('should have batch-delay default to 0', () => {
    const batchDelayOption = projectStatsCommand.options.find(
      (opt) => opt.long === '--batch-delay',
    );
    expect(batchDelayOption?.defaultValue).toBe(0);
  });

  it('should have environment variable mappings for batch options', () => {
    const batchSizeOption = projectStatsCommand.options.find(
      (opt) => opt.long === '--batch-size',
    );
    expect(batchSizeOption?.envVar).toBe('BATCH_SIZE');

    const batchIndexOption = projectStatsCommand.options.find(
      (opt) => opt.long === '--batch-index',
    );
    expect(batchIndexOption?.envVar).toBe('BATCH_INDEX');

    const batchDelayOption = projectStatsCommand.options.find(
      (opt) => opt.long === '--batch-delay',
    );
    expect(batchDelayOption?.envVar).toBe('BATCH_DELAY');
  });

  it('should have batch-repo-list-file option defined', () => {
    const optionNames = projectStatsCommand.options.map((opt) => opt.long);
    expect(optionNames).toContain('--batch-repo-list-file');
  });
});
