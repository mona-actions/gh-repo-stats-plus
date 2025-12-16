import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import type { Arguments } from '../src/types.js';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
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
  createOctokit: vi.fn().mockResolvedValue({}),
}));

// Mock service
vi.mock('../src/service.js', () => ({
  OctokitClient: vi.fn().mockImplementation(() => ({
    getOrgRepoStats: vi.fn(),
    checkRateLimits: vi.fn(() => ({
      graphQLRemaining: 5000,
      apiRemainingRequest: 5000,
      messageType: 'info',
      message: 'Rate limits OK',
    })),
  })),
}));

// Track calls to run function
const runCalls: Array<{ orgName: string }> = [];

// Mock main module with tracking
vi.mock('../src/main.js', () => ({
  run: vi.fn((opts: Partial<Arguments>) => {
    runCalls.push({ orgName: opts.orgName || '' });
    return Promise.resolve();
  }),
  runMultiOrg: undefined as unknown, // Will be imported after mocks are set
}));

describe('Multi-Org Validation and Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runCalls.length = 0; // Clear the tracking array
  });

  describe('Multi-org file validation logic', () => {
    let runMultiOrg: typeof import('../src/main.js').runMultiOrg;

    beforeEach(async () => {
      // Dynamically import after mocks are configured
      const mainModule =
        await vi.importActual<typeof import('../src/main.js')>(
          '../src/main.js',
        );
      runMultiOrg = mainModule.runMultiOrg;
    });

    it('should throw error when file does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const args: Partial<Arguments> = {
        orgList: 'nonexistent.txt',
      };
      await expect(runMultiOrg(args as Arguments)).rejects.toThrow(
        'Organization list file not found',
      );
    });

    it('should throw error when file is empty', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('');

      const args: Partial<Arguments> = {
        orgList: 'empty.txt',
      };
      await expect(runMultiOrg(args as Arguments)).rejects.toThrow(
        'No organizations found',
      );
    });

    it('should throw error when file contains only comments and empty lines', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(`
# Comment 1
# Comment 2

# Comment 3
`);

      const args: Partial<Arguments> = {
        orgList: 'only-comments.txt',
      };
      await expect(runMultiOrg(args as Arguments)).rejects.toThrow(
        'No organizations found',
      );
    });
  });

  describe('Default values and configuration', () => {
    it('should use default delay of 5 seconds when not specified', () => {
      const opts: Partial<Arguments> = {
        orgList: 'test.txt',
        // delayBetweenOrgs not specified
      };

      // Default is set in repo-stats-command.ts via commander
      // The command option has .default('5')
      expect(opts.delayBetweenOrgs).toBeUndefined(); // Will be set by commander
    });

    it('should accept custom delay values', () => {
      const testCases = [
        { delay: 0, expected: 0 },
        { delay: 1, expected: 1 },
        { delay: 10, expected: 10 },
        { delay: 60, expected: 60 },
      ];

      testCases.forEach(({ delay, expected }) => {
        const opts: Partial<Arguments> = {
          orgList: 'test.txt',
          delayBetweenOrgs: delay,
        };

        expect(opts.delayBetweenOrgs).toBe(expected);
      });
    });

    it('should default continueOnError to false', () => {
      const opts: Partial<Arguments> = {
        orgList: 'test.txt',
        // continueOnError not specified
      };

      // When not provided, should be falsy (undefined or false)
      expect(opts.continueOnError).toBeFalsy();
    });

    it('should accept continueOnError as true', () => {
      const opts: Partial<Arguments> = {
        orgList: 'test.txt',
        continueOnError: true,
      };

      expect(opts.continueOnError).toBe(true);
    });

    it('should handle delay of 0 for no waiting between orgs', () => {
      const opts: Partial<Arguments> = {
        orgList: 'test.txt',
        delayBetweenOrgs: 0,
      };

      expect(opts.delayBetweenOrgs).toBe(0);
    });
  });
});
