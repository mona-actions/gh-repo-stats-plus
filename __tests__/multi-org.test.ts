import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import type { Arguments } from '../src/types.js';
import { runMultiOrg } from '../src/main.js';

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

describe('Multi-Org Processing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('File validation', () => {
    it('should throw error when org list file does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const mockRun = vi.fn();

      const args: Partial<Arguments> = {
        orgList: 'nonexistent.txt',
      };

      await expect(runMultiOrg(args as Arguments, mockRun)).rejects.toThrow(
        'Organization list file not found',
      );
      expect(mockRun).not.toHaveBeenCalled();
    });

    it('should throw error when org list file is empty', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('');
      const mockRun = vi.fn();

      const args: Partial<Arguments> = {
        orgList: 'empty.txt',
      };

      await expect(runMultiOrg(args as Arguments, mockRun)).rejects.toThrow(
        'No organizations found',
      );
      expect(mockRun).not.toHaveBeenCalled();
    });

    it('should throw error when file contains only comments and empty lines', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(`
# Comment 1
# Comment 2

# Comment 3
`);
      const mockRun = vi.fn();

      const args: Partial<Arguments> = {
        orgList: 'only-comments.txt',
      };

      await expect(runMultiOrg(args as Arguments, mockRun)).rejects.toThrow(
        'No organizations found',
      );
      expect(mockRun).not.toHaveBeenCalled();
    });
  });

  describe('Organization processing', () => {
    it('should process multiple organizations sequentially', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('org1\norg2\norg3');

      const mockRun = vi.fn().mockResolvedValue(undefined);
      const args: Partial<Arguments> = {
        orgList: 'orgs.txt',
        delayBetweenOrgs: 0, // No delay for fast test
      };

      await runMultiOrg(args as Arguments, mockRun);

      // Verify run was called 3 times with correct org names
      expect(mockRun).toHaveBeenCalledTimes(3);
      expect(mockRun).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ orgName: 'org1' }),
      );
      expect(mockRun).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ orgName: 'org2' }),
      );
      expect(mockRun).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({ orgName: 'org3' }),
      );
    });

    it('should filter out comments and empty lines', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(`
# This is a comment
org1

org2
# Another comment

org3
`);

      const mockRun = vi.fn().mockResolvedValue(undefined);
      const args: Partial<Arguments> = {
        orgList: 'orgs.txt',
        delayBetweenOrgs: 0,
      };

      await runMultiOrg(args as Arguments, mockRun);

      // Should only process the 3 actual org names
      expect(mockRun).toHaveBeenCalledTimes(3);
      expect(mockRun).toHaveBeenCalledWith(
        expect.objectContaining({ orgName: 'org1' }),
      );
      expect(mockRun).toHaveBeenCalledWith(
        expect.objectContaining({ orgName: 'org2' }),
      );
      expect(mockRun).toHaveBeenCalledWith(
        expect.objectContaining({ orgName: 'org3' }),
      );
    });

    it('should pass options to each org run and clear orgList', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('org1\norg2');

      const mockRun = vi.fn().mockResolvedValue(undefined);
      const args: Partial<Arguments> = {
        orgList: 'orgs.txt',
        delayBetweenOrgs: 0,
        verbose: true,
        pageSize: 50,
      };

      await runMultiOrg(args as Arguments, mockRun);

      // Verify each call receives the base options but orgList is cleared
      expect(mockRun).toHaveBeenCalledWith(
        expect.objectContaining({
          orgName: 'org1',
          verbose: true,
          pageSize: 50,
          orgList: undefined,
        }),
      );
      expect(mockRun).toHaveBeenCalledWith(
        expect.objectContaining({
          orgName: 'org2',
          verbose: true,
          pageSize: 50,
          orgList: undefined,
        }),
      );
    });
  });

  describe('Error handling', () => {
    it('should stop on first error when continueOnError is false', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('org1\norg2\norg3');

      const mockRun = vi
        .fn()
        .mockResolvedValueOnce(undefined) // org1 succeeds
        .mockRejectedValueOnce(new Error('Processing failed')) // org2 fails
        .mockResolvedValueOnce(undefined); // org3 would succeed

      const args: Partial<Arguments> = {
        orgList: 'orgs.txt',
        delayBetweenOrgs: 0,
        continueOnError: false,
      };

      await expect(runMultiOrg(args as Arguments, mockRun)).rejects.toThrow(
        'Processing failed',
      );

      // Should only call org1 and org2, not org3
      expect(mockRun).toHaveBeenCalledTimes(2);
    });

    it('should continue processing when continueOnError is true', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('org1\norg2\norg3');

      const mockRun = vi
        .fn()
        .mockResolvedValueOnce(undefined) // org1 succeeds
        .mockRejectedValueOnce(new Error('Processing failed')) // org2 fails
        .mockResolvedValueOnce(undefined); // org3 succeeds

      const args: Partial<Arguments> = {
        orgList: 'orgs.txt',
        delayBetweenOrgs: 0,
        continueOnError: true,
      };

      // Should not throw, continues to process all orgs
      await runMultiOrg(args as Arguments, mockRun);

      // All 3 orgs should be attempted
      expect(mockRun).toHaveBeenCalledTimes(3);
    });
  });

  describe('Delay handling', () => {
    it('should wait specified delay between organizations', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('org1\norg2');
      vi.useFakeTimers();

      const mockRun = vi.fn().mockResolvedValue(undefined);
      const delaySeconds = 2;
      const args: Partial<Arguments> = {
        orgList: 'orgs.txt',
        delayBetweenOrgs: delaySeconds,
      };

      const promise = runMultiOrg(args as Arguments, mockRun);

      // Fast-forward through all timers
      await vi.runAllTimersAsync();

      await promise;

      // Verify both orgs were processed
      expect(mockRun).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it('should not delay after the last organization', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('org1\norg2');
      vi.useFakeTimers();

      const mockRun = vi.fn().mockResolvedValue(undefined);
      const args: Partial<Arguments> = {
        orgList: 'orgs.txt',
        delayBetweenOrgs: 5,
      };

      const startTime = Date.now();
      const promise = runMultiOrg(args as Arguments, mockRun);

      // Process both orgs
      await vi.runAllTimersAsync();
      await promise;

      // Total time should be 1 delay (between org1 and org2), not 2
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(10000); // Less than 2 delays worth

      vi.useRealTimers();
    });

    it('should skip delay when delayBetweenOrgs is 0', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('org1\norg2\norg3');

      const mockRun = vi.fn().mockResolvedValue(undefined);
      const args: Partial<Arguments> = {
        orgList: 'orgs.txt',
        delayBetweenOrgs: 0,
      };

      const startTime = Date.now();
      await runMultiOrg(args as Arguments, mockRun);
      const elapsed = Date.now() - startTime;

      // Should complete quickly without delays
      expect(mockRun).toHaveBeenCalledTimes(3);
      expect(elapsed).toBeLessThan(1000); // Should be very fast
    });

    it('should delay even after errors when continueOnError is true', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('org1\norg2\norg3');
      vi.useFakeTimers();

      const mockRun = vi
        .fn()
        .mockResolvedValueOnce(undefined) // org1 succeeds
        .mockRejectedValueOnce(new Error('Failed')) // org2 fails
        .mockResolvedValueOnce(undefined); // org3 succeeds

      const delaySeconds = 3;
      const args: Partial<Arguments> = {
        orgList: 'orgs.txt',
        delayBetweenOrgs: delaySeconds,
        continueOnError: true,
      };

      const promise = runMultiOrg(args as Arguments, mockRun);

      // Fast-forward through all timers
      await vi.runAllTimersAsync();

      await promise;

      // Verify all 3 orgs were processed (including the failed one)
      expect(mockRun).toHaveBeenCalledTimes(3);

      vi.useRealTimers();
    });
  });
});
