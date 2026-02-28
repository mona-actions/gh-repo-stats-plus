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
  StateManager: vi.fn().mockImplementation(function () {
    return {
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
    };
  }),
}));

vi.mock('../src/session.js', () => ({
  SessionManager: vi.fn().mockImplementation(function () {
    return {
      initialize: vi.fn().mockReturnValue({
        canResume: false,
        currentOrgIndex: 0,
      }),
      getOrCreateOrgReference: vi.fn().mockReturnValue({
        status: 'pending',
      }),
      updateOrgReference: vi.fn(),
    };
  }),
}));

vi.mock('../src/retry.js', () => ({
  withRetry: vi
    .fn()
    .mockImplementation(async (operation: () => Promise<unknown>) => {
      return operation();
    }),
}));

vi.mock('../src/utils.js', () => ({
  generatePerRepoInstallFileName: vi
    .fn()
    .mockReturnValue('test-org-per-repo-installations-20250101_000000_ts.csv'),
  generateRepoAppDetailFileName: vi
    .fn()
    .mockReturnValue('test-org-repo-app-details-20250101_000000_ts.csv'),
  generateAppReposFileName: vi
    .fn()
    .mockReturnValue('test-org-app-repos-20250101_000000_ts.csv'),
  formatElapsedTime: vi.fn().mockReturnValue('0h 0m 1s'),
  resolveOutputPath: vi
    .fn()
    .mockImplementation(async (_dir: string, name: string) => `output/${name}`),
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
  initializePerRepoInstallCsvFile,
  initializeRepoAppDetailCsvFile,
  initializeAppReposCsvFile,
  writePerRepoInstallCsv,
  writeRepoAppDetailCsv,
  writeAppReposCsv,
  preparePerRepoInstallationsData,
  prepareRepoAppDetailsData,
  prepareAppReposData,
  runAppInstallStats,
} from '../src/app-installs.js';
import { createLogger } from '../src/logger.js';
import { OctokitClient } from '../src/service.js';
import { existsSync, writeFileSync, appendFileSync } from 'fs';
import type {
  PerRepoInstallationResult,
  RepoAppDetailResult,
  AppReposResult,
  AppInstallationData,
  Arguments,
} from '../src/types.js';

describe('app-installs', () => {
  const mockLogger = createMockLogger();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createLogger).mockResolvedValue(mockLogger);
  });

  describe('initializePerRepoInstallCsvFile', () => {
    it('should create a new CSV file with headers when file does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      initializePerRepoInstallCsvFile('/tmp/test.csv', mockLogger);

      expect(writeFileSync).toHaveBeenCalledWith(
        '/tmp/test.csv',
        'Org_Name,Repo_Name,App_Installations\n',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Creating new CSV file'),
      );
    });

    it('should not overwrite an existing CSV file', () => {
      vi.mocked(existsSync).mockReturnValue(true);

      initializePerRepoInstallCsvFile('/tmp/test.csv', mockLogger);

      expect(writeFileSync).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Using existing CSV file'),
      );
    });
  });

  describe('initializeRepoAppDetailCsvFile', () => {
    it('should create CSV with correct headers', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      initializeRepoAppDetailCsvFile('/tmp/test.csv', mockLogger);

      expect(writeFileSync).toHaveBeenCalledWith(
        '/tmp/test.csv',
        'Org_Name,Repo_Name,App_Name,Configured\n',
      );
    });
  });

  describe('initializeAppReposCsvFile', () => {
    it('should create CSV with correct headers', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      initializeAppReposCsvFile('/tmp/test.csv', mockLogger);

      expect(writeFileSync).toHaveBeenCalledWith(
        '/tmp/test.csv',
        'Org_Name,App_Name,Repos_Installed_In\n',
      );
    });
  });

  describe('writePerRepoInstallCsv', () => {
    it('should write a result row to the CSV file', () => {
      const result: PerRepoInstallationResult = {
        Org_Name: 'test-org',
        Repo_Name: 'test-repo',
        App_Installations: 5,
      };

      writePerRepoInstallCsv(result, '/tmp/test.csv', mockLogger);

      expect(appendFileSync).toHaveBeenCalledWith(
        '/tmp/test.csv',
        'test-org,test-repo,5\n',
      );
    });

    it('should throw and log error if write fails', () => {
      vi.mocked(appendFileSync).mockImplementation(() => {
        throw new Error('write failed');
      });

      const result: PerRepoInstallationResult = {
        Org_Name: 'test-org',
        Repo_Name: 'test-repo',
        App_Installations: 0,
      };

      expect(() =>
        writePerRepoInstallCsv(result, '/tmp/test.csv', mockLogger),
      ).toThrow('write failed');
      expect(mockLogger.error).toHaveBeenCalled();

      vi.mocked(appendFileSync).mockReset();
    });
  });

  describe('writeRepoAppDetailCsv', () => {
    it('should write a result row to the CSV file', () => {
      const result: RepoAppDetailResult = {
        Org_Name: 'test-org',
        Repo_Name: 'test-repo',
        App_Name: 'my-app',
        Configured: 'TRUE',
      };

      writeRepoAppDetailCsv(result, '/tmp/test.csv', mockLogger);

      expect(appendFileSync).toHaveBeenCalledWith(
        '/tmp/test.csv',
        'test-org,test-repo,my-app,TRUE\n',
      );
    });

    it('should throw and log error if write fails', () => {
      vi.mocked(appendFileSync).mockImplementation(() => {
        throw new Error('write failed');
      });

      const result: RepoAppDetailResult = {
        Org_Name: 'test-org',
        Repo_Name: 'test-repo',
        App_Name: 'my-app',
        Configured: 'TRUE',
      };

      expect(() =>
        writeRepoAppDetailCsv(result, '/tmp/test.csv', mockLogger),
      ).toThrow('write failed');
      expect(mockLogger.error).toHaveBeenCalled();

      vi.mocked(appendFileSync).mockReset();
    });
  });

  describe('writeAppReposCsv', () => {
    it('should write a result row to the CSV file', () => {
      const result: AppReposResult = {
        Org_Name: 'test-org',
        App_Name: 'my-app',
        Repos_Installed_In: 3,
      };

      writeAppReposCsv(result, '/tmp/test.csv', mockLogger);

      expect(appendFileSync).toHaveBeenCalledWith(
        '/tmp/test.csv',
        'test-org,my-app,3\n',
      );
    });
  });

  describe('preparePerRepoInstallationsData', () => {
    it('should create rows for each repo in repoApps', () => {
      const data: AppInstallationData = {
        orgName: 'test-org',
        orgWideInstallations: [],
        repoSpecificInstallations: [],
        installationRepos: {},
        repoApps: {
          'repo-a': ['app-1', 'app-2'],
          'repo-b': ['app-1'],
        },
      };

      const results = preparePerRepoInstallationsData(data);

      expect(results).toHaveLength(2);
      expect(results).toContainEqual({
        Org_Name: 'test-org',
        Repo_Name: 'repo-a',
        App_Installations: 2,
      });
      expect(results).toContainEqual({
        Org_Name: 'test-org',
        Repo_Name: 'repo-b',
        App_Installations: 1,
      });
    });

    it('should add _ORG_LEVEL_ row for org-wide installations', () => {
      const data: AppInstallationData = {
        orgName: 'test-org',
        orgWideInstallations: [
          { id: 1, app_slug: 'org-app', repository_selection: 'all' },
        ],
        repoSpecificInstallations: [],
        installationRepos: {},
        repoApps: {},
      };

      const results = preparePerRepoInstallationsData(data);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        Org_Name: 'test-org',
        Repo_Name: '_ORG_LEVEL_',
        App_Installations: 1,
      });
    });

    it('should return empty array when no installations exist', () => {
      const data: AppInstallationData = {
        orgName: 'test-org',
        orgWideInstallations: [],
        repoSpecificInstallations: [],
        installationRepos: {},
        repoApps: {},
      };

      const results = preparePerRepoInstallationsData(data);

      expect(results).toHaveLength(0);
    });
  });

  describe('prepareRepoAppDetailsData', () => {
    it('should create a row for each repo-app pair', () => {
      const data: AppInstallationData = {
        orgName: 'test-org',
        orgWideInstallations: [],
        repoSpecificInstallations: [],
        installationRepos: {},
        repoApps: {
          'repo-a': ['app-1', 'app-2'],
          'repo-b': ['app-1'],
        },
      };

      const results = prepareRepoAppDetailsData(data);

      expect(results).toHaveLength(3);
      expect(results).toContainEqual({
        Org_Name: 'test-org',
        Repo_Name: 'repo-a',
        App_Name: 'app-1',
        Configured: 'TRUE',
      });
      expect(results).toContainEqual({
        Org_Name: 'test-org',
        Repo_Name: 'repo-a',
        App_Name: 'app-2',
        Configured: 'TRUE',
      });
      expect(results).toContainEqual({
        Org_Name: 'test-org',
        Repo_Name: 'repo-b',
        App_Name: 'app-1',
        Configured: 'TRUE',
      });
    });

    it('should add _ORG_LEVEL_ rows for org-wide apps', () => {
      const data: AppInstallationData = {
        orgName: 'test-org',
        orgWideInstallations: [
          { id: 1, app_slug: 'org-app-1', repository_selection: 'all' },
          { id: 2, app_slug: 'org-app-2', repository_selection: 'all' },
        ],
        repoSpecificInstallations: [],
        installationRepos: {},
        repoApps: {},
      };

      const results = prepareRepoAppDetailsData(data);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        Org_Name: 'test-org',
        Repo_Name: '_ORG_LEVEL_',
        App_Name: 'org-app-1',
        Configured: 'TRUE',
      });
      expect(results[1]).toEqual({
        Org_Name: 'test-org',
        Repo_Name: '_ORG_LEVEL_',
        App_Name: 'org-app-2',
        Configured: 'TRUE',
      });
    });
  });

  describe('prepareAppReposData', () => {
    it('should create a row for each app showing repo count', () => {
      const data: AppInstallationData = {
        orgName: 'test-org',
        orgWideInstallations: [],
        repoSpecificInstallations: [],
        installationRepos: {
          'app-1': ['repo-a', 'repo-b', 'repo-c'],
          'app-2': ['repo-a'],
        },
        repoApps: {},
      };

      const results = prepareAppReposData(data);

      expect(results).toHaveLength(2);
      expect(results).toContainEqual({
        Org_Name: 'test-org',
        App_Name: 'app-1',
        Repos_Installed_In: 3,
      });
      expect(results).toContainEqual({
        Org_Name: 'test-org',
        App_Name: 'app-2',
        Repos_Installed_In: 1,
      });
    });

    it('should return empty array when no installations exist', () => {
      const data: AppInstallationData = {
        orgName: 'test-org',
        orgWideInstallations: [],
        repoSpecificInstallations: [],
        installationRepos: {},
        repoApps: {},
      };

      const results = prepareAppReposData(data);

      expect(results).toHaveLength(0);
    });
  });

  describe('runAppInstallStats', () => {
    it('should throw when no org is specified', async () => {
      const opts: Arguments = {
        orgName: undefined,
        orgList: [],
        baseUrl: 'https://api.github.com',
        proxyUrl: undefined,
        verbose: false,
        outputDir: 'output',
        pageSize: 30,
        repoList: undefined,
      };

      await expect(runAppInstallStats(opts)).rejects.toThrow(
        'Either orgName or orgList must be provided',
      );
    });

    it('should process a single org successfully', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const mockGetOrgAppInstallationData = vi.fn().mockResolvedValue({
        orgName: 'test-org',
        orgWideInstallations: [
          { id: 1, app_slug: 'org-app', repository_selection: 'all' },
        ],
        repoSpecificInstallations: [
          { id: 2, app_slug: 'repo-app', repository_selection: 'selected' },
        ],
        installationRepos: {
          'repo-app': ['repo-a', 'repo-b'],
        },
        repoApps: {
          'repo-a': ['repo-app'],
          'repo-b': ['repo-app'],
        },
      });

      vi.mocked(OctokitClient).mockImplementation(function () {
        return {
          getOrgAppInstallationData: mockGetOrgAppInstallationData,
        } as unknown as OctokitClient;
      });

      const opts: Arguments = {
        orgName: 'test-org',
        orgList: [],
        baseUrl: 'https://api.github.com',
        proxyUrl: undefined,
        verbose: false,
        outputDir: 'output',
        pageSize: 30,
        retryMaxAttempts: 3,
        retryInitialDelay: 1000,
        retryMaxDelay: 30000,
        retryBackoffFactor: 2,
        retrySuccessThreshold: 5,
        repoList: undefined,
      };

      await runAppInstallStats(opts);

      // Should have logged the summary
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('App installation stats processing completed'),
      );
    });

    it('should skip CSV files when skip flags are set', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const mockGetOrgAppInstallationData = vi.fn().mockResolvedValue({
        orgName: 'test-org',
        orgWideInstallations: [],
        repoSpecificInstallations: [],
        installationRepos: {},
        repoApps: {},
      });

      vi.mocked(OctokitClient).mockImplementation(function () {
        return {
          getOrgAppInstallationData: mockGetOrgAppInstallationData,
        } as unknown as OctokitClient;
      });

      const opts: Arguments = {
        orgName: 'test-org',
        orgList: [],
        baseUrl: 'https://api.github.com',
        proxyUrl: undefined,
        verbose: false,
        outputDir: 'output',
        pageSize: 30,
        retryMaxAttempts: 3,
        retryInitialDelay: 1000,
        retryMaxDelay: 30000,
        retryBackoffFactor: 2,
        retrySuccessThreshold: 5,
        repoList: undefined,
        skipPerRepoInstallCsv: true,
        skipRepoAppDetailCsv: true,
        skipAppReposCsv: true,
      };

      await runAppInstallStats(opts);

      // Should have logged skip messages
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Skipping per-repo installations CSV'),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Skipping repo-app details CSV'),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Skipping app-repos CSV'),
      );
    });
  });
});
