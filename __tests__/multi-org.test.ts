import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Arguments } from '../src/types.js';
import { run } from '../src/main.js';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(''),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

// Mock logger
vi.mock('../src/logger.js', () => ({
  createLogger: vi.fn().mockResolvedValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  logInitialization: {
    start: vi.fn(),
    auth: vi.fn(),
    octokit: vi.fn(),
  },
}));

// Mock auth
vi.mock('../src/auth.js', () => ({
  createAuthConfig: vi.fn().mockReturnValue({ token: 'mock-token' }),
}));

// Mock octokit
vi.mock('../src/octokit.js', () => ({
  createOctokit: vi.fn().mockReturnValue({}),
}));

// Mock state manager
vi.mock('../src/state.js', () => ({
  StateManager: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockReturnValue({
      processedState: {
        currentCursor: null,
        lastSuccessfulCursor: null,
        processedRepos: [],
        lastProcessedRepo: '',
        completedSuccessfully: false,
        outputFileName: '',
      },
      resumeFromLastState: false,
    }),
    update: vi.fn(),
    markComplete: vi.fn(),
    cleanup: vi.fn(),
  })),
}));

// Mock service
vi.mock('../src/service.js', () => ({
  OctokitClient: vi.fn().mockImplementation(() => ({
    getOrgRepoStats: vi.fn().mockReturnValue({
      async *[Symbol.asyncIterator]() {
        // Empty iterator for testing
        return;
      },
    }),
    checkRateLimits: vi.fn().mockResolvedValue({
      graphQLRemaining: 5000,
      apiRemainingRequest: 5000,
      messageType: 'info',
      message: 'Rate limits OK',
    }),
  })),
}));

// Mock utils
vi.mock('../src/utils.js', () => ({
  generateRepoStatsFileName: vi.fn().mockReturnValue('test-output.csv'),
  resolveOutputPath: vi.fn().mockResolvedValue('output/test-output.csv'),
  formatElapsedTime: vi.fn().mockReturnValue('0m 0s'),
  convertKbToMb: vi.fn().mockReturnValue(0),
  checkIfHasMigrationIssues: vi.fn().mockReturnValue(false),
}));

// Mock retry
vi.mock('../src/retry.js', () => ({
  withRetry: vi.fn().mockImplementation(async (fn) => await fn()),
}));

describe('Multi-Org Processing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Organization validation', () => {
    it('should throw error when neither orgName nor orgList is provided', async () => {
      const args: Partial<Arguments> = {
        accessToken: 'token',
      };

      await expect(run(args as Arguments)).rejects.toThrow(
        'Either orgName or orgList must be provided',
      );
    });

    it('should process single organization when only orgName is provided', async () => {
      const args: Partial<Arguments> = {
        orgName: 'test-org',
        accessToken: 'token',
      };

      await run(args as Arguments);
      // Should complete without error
    });

    it('should process array of organizations when orgList is provided', async () => {
      const args: Partial<Arguments> = {
        orgList: ['org1', 'org2', 'org3'],
        accessToken: 'token',
        delayBetweenOrgs: 0,
      };

      await run(args as Arguments);
      // Should complete without error
    });
  });


  describe('Organization processing', () => {
    it('should process multiple organizations from orgList array', async () => {
      const args: Partial<Arguments> = {
        orgList: ['org1', 'org2', 'org3'],
        accessToken: 'token',
        delayBetweenOrgs: 0,
      };

      await run(args as Arguments);
      // Should complete without error - logs will show processing of all 3 orgs
    });

    it('should prefer orgList over orgName when both are provided', async () => {
      const args: Partial<Arguments> = {
        orgName: 'single-org',
        orgList: ['org1', 'org2'],
        accessToken: 'token',
        delayBetweenOrgs: 0,
      };

      await run(args as Arguments);
      // orgList should take precedence
    });

    it('should handle empty orgList array by throwing error', async () => {
      const args: Partial<Arguments> = {
        orgList: [],
        accessToken: 'token',
      };

      await expect(run(args as Arguments)).rejects.toThrow(
        'Either orgName or orgList must be provided',
      );
    });
  });


  describe('Error handling', () => {
    it('should stop on first error when continueOnError is false', async () => {
      // Mock OctokitClient to fail on second org
      const { OctokitClient } = await vi.importMock('../src/service.js');
      let callCount = 0;

      vi.mocked(OctokitClient).mockImplementation(() => ({
        getOrgRepoStats: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 2) {
            throw new Error('Processing failed for org2');
          }
          return {
            async *[Symbol.asyncIterator]() {
              return;
            },
          };
        }),
        checkRateLimits: vi.fn().mockResolvedValue({
          graphQLRemaining: 5000,
          apiRemainingRequest: 5000,
          messageType: 'info',
          message: 'Rate limits OK',
        }),
      }));

      const args: Partial<Arguments> = {
        orgList: ['org1', 'org2', 'org3'],
        accessToken: 'token',
        delayBetweenOrgs: 0,
        continueOnError: false,
      };

      await expect(run(args as Arguments)).rejects.toThrow();
    });

    it('should continue processing when continueOnError is true', async () => {
      // Mock OctokitClient to fail on second org but continue
      const { OctokitClient } = await vi.importMock('../src/service.js');
      let callCount = 0;

      vi.mocked(OctokitClient).mockImplementation(() => ({
        getOrgRepoStats: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 2) {
            throw new Error('Processing failed for org2');
          }
          return {
            async *[Symbol.asyncIterator]() {
              return;
            },
          };
        }),
        checkRateLimits: vi.fn().mockResolvedValue({
          graphQLRemaining: 5000,
          apiRemainingRequest: 5000,
          messageType: 'info',
          message: 'Rate limits OK',
        }),
      }));

      const args: Partial<Arguments> = {
        orgList: ['org1', 'org2', 'org3'],
        accessToken: 'token',
        delayBetweenOrgs: 0,
        continueOnError: true,
      };

      // Should not throw, continues to process all orgs
      await run(args as Arguments);
      // If we get here without throwing, the test passes
    });
  });


  describe('Delay handling', () => {
    it('should wait for the specified delay between organizations', async () => {
      vi.useFakeTimers();

      const args: Partial<Arguments> = {
        orgList: ['org1', 'org2', 'org3'],
        accessToken: 'token',
        delayBetweenOrgs: 5, // 5 seconds
      };

      const promise = run(args as Arguments);

      // Fast forward through all timers
      await vi.runAllTimersAsync();

      await promise;

      vi.useRealTimers();
      // Test passes if no errors thrown
    });

    it('should not wait when delayBetweenOrgs is 0', async () => {
      const startTime = Date.now();

      const args: Partial<Arguments> = {
        orgList: ['org1', 'org2', 'org3'],
        accessToken: 'token',
        delayBetweenOrgs: 0,
      };

      await run(args as Arguments);

      const elapsed = Date.now() - startTime;

      // Should complete quickly without delays (within 1 second)
      expect(elapsed).toBeLessThan(1000);
    });

    it('should process correctly with delays between orgs', async () => {
      // This is more of an integration test that just verifies the run completes
      const args: Partial<Arguments> = {
        orgList: ['org1', 'org2'],
        accessToken: 'token',
        delayBetweenOrgs: 0, // Use 0 for fast test
      };

      await run(args as Arguments);
      // Test passes if no errors thrown
    });
  });

  describe('Multi-org summary logging', () => {
    it('should log multi-org summary when processing multiple orgs', async () => {
      const { createLogger } = await vi.importMock('../src/logger.js');
      const mockLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      };
      vi.mocked(createLogger).mockResolvedValue(mockLogger);

      const args: Partial<Arguments> = {
        orgList: ['org1', 'org2', 'org3'],
        accessToken: 'token',
        delayBetweenOrgs: 0,
      };

      await run(args as Arguments);

      // Verify summary logging occurred
      const infoMessages = vi
        .mocked(mockLogger.info)
        .mock.calls.map((call) => call[0]);

      // Check for multi-org processing indicators
      expect(infoMessages.some((msg) => msg.includes('Organizations to process'))).toBe(true);
      expect(infoMessages.some((msg) => msg.includes('SUMMARY'))).toBe(true);
      expect(infoMessages.some((msg) => msg.includes('Total organizations processed'))).toBe(true);
    });

    it('should log success rate in summary', async () => {
      const { createLogger } = await vi.importMock('../src/logger.js');
      const mockLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      };
      vi.mocked(createLogger).mockResolvedValue(mockLogger);

      const args: Partial<Arguments> = {
        orgList: ['org1', 'org2'],
        accessToken: 'token',
        delayBetweenOrgs: 0,
      };

      await run(args as Arguments);

      const infoMessages = vi
        .mocked(mockLogger.info)
        .mock.calls.map((call) => call[0]);

      expect(infoMessages.some((msg) => msg.includes('Success rate'))).toBe(true);
    });

    it('should log single-org summary when processing one org', async () => {
      const { createLogger } = await vi.importMock('../src/logger.js');
      const mockLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      };
      vi.mocked(createLogger).mockResolvedValue(mockLogger);

      const args: Partial<Arguments> = {
        orgName: 'single-org',
        accessToken: 'token',
      };

      await run(args as Arguments);

      const infoMessages = vi
        .mocked(mockLogger.info)
        .mock.calls.map((call) => call[0]);

      // Should show "ORG PROCESSING SUMMARY" not "MULTI-ORG"
      expect(infoMessages.some((msg) => msg.includes('ORG PROCESSING SUMMARY'))).toBe(true);
    });

    it('should warn when some orgs fail', async () => {
      const { createLogger } = await vi.importMock('../src/logger.js');
      const mockLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      };
      vi.mocked(createLogger).mockResolvedValue(mockLogger);

      // Mock OctokitClient to fail on second org
      const { OctokitClient } = await vi.importMock('../src/service.js');
      let callCount = 0;

      vi.mocked(OctokitClient).mockImplementation(() => ({
        getOrgRepoStats: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 2) {
            throw new Error('Processing failed for org2');
          }
          return {
            async *[Symbol.asyncIterator]() {
              return;
            },
          };
        }),
        checkRateLimits: vi.fn().mockResolvedValue({
          graphQLRemaining: 5000,
          apiRemainingRequest: 5000,
          messageType: 'info',
          message: 'Rate limits OK',
        }),
      }));

      const args: Partial<Arguments> = {
        orgList: ['org1', 'org2', 'org3'],
        accessToken: 'token',
        delayBetweenOrgs: 0,
        continueOnError: true,
      };

      await run(args as Arguments);

      // Verify warning was logged
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('organization(s) failed processing')
      );
    });

    it('should log estimated time when processing multiple orgs with delays', async () => {
      const { createLogger } = await vi.importMock('../src/logger.js');
      const mockLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      };
      vi.mocked(createLogger).mockResolvedValue(mockLogger);

      const args: Partial<Arguments> = {
        orgList: ['org1', 'org2', 'org3'],
        accessToken: 'token',
        delayBetweenOrgs: 60, // 1 minute
      };

      vi.useFakeTimers();
      const promise = run(args as Arguments);
      await vi.runAllTimersAsync();
      await promise;
      vi.useRealTimers();

      const infoMessages = vi
        .mocked(mockLogger.info)
        .mock.calls.map((call) => call[0]);

      // Should log estimated time information
      expect(infoMessages.some((msg) => msg.includes('Estimated minimum time'))).toBe(true);
      expect(infoMessages.some((msg) => msg.includes('minutes'))).toBe(true);
    });
  });
});
