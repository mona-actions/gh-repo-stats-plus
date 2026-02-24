import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockLogger } from './test-utils.js';

// Mock all external dependencies
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(() => []),
}));

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/logger.js', () => ({
  createLogger: vi.fn(),
  logInitialization: {
    start: vi.fn(),
    auth: vi.fn(),
    octokit: vi.fn(),
    token: vi.fn(),
    directories: vi.fn(),
  },
}));

vi.mock('../src/auth.js', () => ({
  createAuthConfig: vi.fn().mockReturnValue({
    authStrategy: undefined,
    auth: 'test-token',
  }),
}));

vi.mock('../src/octokit.js', () => ({
  createOctokit: vi.fn().mockReturnValue({}),
}));

vi.mock('../src/service.js', () => ({
  OctokitClient: vi.fn(),
}));

vi.mock('../src/state.js', () => ({
  StateManager: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockReturnValue({
      processedState: {
        organizationName: 'test-org',
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
    update: vi.fn(),
    cleanup: vi.fn(),
  })),
}));

vi.mock('../src/session.js', () => ({
  SessionManager: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockReturnValue({
      canResume: false,
      currentOrgIndex: 0,
    }),
    getOrCreateOrgReference: vi.fn().mockReturnValue({
      status: 'pending',
    }),
    updateOrgReference: vi.fn(),
  })),
}));

vi.mock('../src/retry.js', () => ({
  withRetry: vi
    .fn()
    .mockImplementation(async (operation: () => Promise<unknown>) => {
      return operation();
    }),
}));

vi.mock('../src/utils.js', () => ({
  generateProjectStatsFileName: vi
    .fn()
    .mockReturnValue('test-org-project-stats-20250101_000000_ts.csv'),
  formatElapsedTime: vi.fn().mockReturnValue('0h 0m 1s'),
  resolveOutputPath: vi
    .fn()
    .mockResolvedValue('output/test-org-project-stats-20250101_000000_ts.csv'),
  escapeCsvField: vi.fn().mockImplementation((value: unknown) => {
    const str = value?.toString() ?? '';
    if (
      str.includes(',') ||
      str.includes('"') ||
      str.includes('\n') ||
      str.includes('\r')
    ) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }),
}));

// Import after mocks are set up
import {
  initializeProjectStatsCsvFile,
  writeProjectStatsToCsv,
  runProjectStats,
} from '../src/projects.js';
import { createLogger } from '../src/logger.js';
import { OctokitClient } from '../src/service.js';
import { existsSync, writeFileSync, appendFileSync } from 'fs';
import type { ProjectStatsResult, Arguments } from '../src/types.js';

describe('projects', () => {
  const mockLogger = createMockLogger();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createLogger).mockResolvedValue(mockLogger);
  });

  describe('initializeProjectStatsCsvFile', () => {
    it('should create a new CSV file with headers when file does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      initializeProjectStatsCsvFile('/tmp/test.csv', mockLogger);

      expect(writeFileSync).toHaveBeenCalledWith(
        '/tmp/test.csv',
        'Org_Name,Repo_Name,Issues_Linked_To_Projects,Unique_Projects_Linked_By_Issues,Projects_Linked_To_Repo\n',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Creating new CSV file'),
      );
    });

    it('should not overwrite an existing CSV file', () => {
      vi.mocked(existsSync).mockReturnValue(true);

      initializeProjectStatsCsvFile('/tmp/test.csv', mockLogger);

      expect(writeFileSync).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Using existing CSV file'),
      );
    });
  });

  describe('writeProjectStatsToCsv', () => {
    it('should write a result row to the CSV file', () => {
      const result: ProjectStatsResult = {
        Org_Name: 'test-org',
        Repo_Name: 'test-repo',
        Issues_Linked_To_Projects: 5,
        Unique_Projects_Linked_By_Issues: 3,
        Projects_Linked_To_Repo: 2,
      };

      writeProjectStatsToCsv(result, '/tmp/test.csv', mockLogger);

      expect(appendFileSync).toHaveBeenCalledWith(
        '/tmp/test.csv',
        'test-org,test-repo,5,3,2\n',
      );
    });

    it('should escape CSV fields with special characters', () => {
      const result: ProjectStatsResult = {
        Org_Name: 'test,org',
        Repo_Name: 'test "repo"',
        Issues_Linked_To_Projects: 0,
        Unique_Projects_Linked_By_Issues: 0,
        Projects_Linked_To_Repo: 0,
      };

      writeProjectStatsToCsv(result, '/tmp/test.csv', mockLogger);

      expect(appendFileSync).toHaveBeenCalledWith(
        '/tmp/test.csv',
        '"test,org","test ""repo""",0,0,0\n',
      );
    });

    it('should throw and log error if write fails', () => {
      vi.mocked(appendFileSync).mockImplementation(() => {
        throw new Error('write failed');
      });

      const result: ProjectStatsResult = {
        Org_Name: 'test-org',
        Repo_Name: 'test-repo',
        Issues_Linked_To_Projects: 0,
        Unique_Projects_Linked_By_Issues: 0,
        Projects_Linked_To_Repo: 0,
      };

      expect(() =>
        writeProjectStatsToCsv(result, '/tmp/test.csv', mockLogger),
      ).toThrow('write failed');
      expect(mockLogger.error).toHaveBeenCalled();

      // Reset the mock to avoid affecting subsequent tests
      vi.mocked(appendFileSync).mockReset();
    });
  });

  describe('runProjectStats', () => {
    it('should throw when no org is specified', async () => {
      const opts: Arguments = {
        orgName: undefined,
        orgList: [],
        baseUrl: 'https://api.github.com',
        proxyUrl: undefined,
        verbose: false,
        outputDir: 'output',
        pageSize: 100,
        repoList: undefined,
      };

      await expect(runProjectStats(opts)).rejects.toThrow(
        'Either orgName or orgList must be provided',
      );
    });

    it('should process a single org successfully', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const mockGetRepoProjectCounts = vi.fn().mockResolvedValue({
        Org_Name: 'test-org',
        Repo_Name: 'repo1',
        Issues_Linked_To_Projects: 2,
        Unique_Projects_Linked_By_Issues: 1,
        Projects_Linked_To_Repo: 3,
      });

      const mockListOrgRepoNames = vi.fn().mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield { name: 'repo1', owner: { login: 'test-org' } };
        },
      });

      vi.mocked(OctokitClient).mockImplementation(
        () =>
          ({
            getRepoProjectCounts: mockGetRepoProjectCounts,
            listOrgRepoNames: mockListOrgRepoNames,
          }) as unknown as OctokitClient,
      );

      const opts: Arguments = {
        orgName: 'test-org',
        orgList: [],
        baseUrl: 'https://api.github.com',
        proxyUrl: undefined,
        verbose: false,
        outputDir: 'output',
        pageSize: 100,
        retryMaxAttempts: 3,
        retryInitialDelay: 1000,
        retryMaxDelay: 30000,
        retryBackoffFactor: 2,
        retrySuccessThreshold: 5,
        repoList: undefined,
      };

      await runProjectStats(opts);

      // Should have logged the summary
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('PROJECT-STATS PROCESSING SUMMARY'),
      );
    });
  });
});
