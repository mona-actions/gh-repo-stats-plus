import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createAuthConfig,
  createAppLevelAuthConfig,
  needsInstallationLookup,
} from '../src/auth.js';
import { createMockLogger } from './test-utils.js';
import { readFileSync } from 'fs';

// Mock fs module
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}));

// Mock @octokit/auth-app
vi.mock('@octokit/auth-app', () => ({
  createAppAuth: vi.fn(),
}));

describe('auth', () => {
  const mockLogger = createMockLogger();
  let originalEnv: typeof process.env;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('createAuthConfig', () => {
    describe('token authentication', () => {
      it('should create token auth config when access token is provided', () => {
        // Arrange
        const accessToken = 'test-token-123';

        // Act
        const result = createAuthConfig({
          accessToken,
          logger: mockLogger,
        });

        // Assert
        expect(result).toEqual({
          authStrategy: undefined,
          auth: accessToken,
        });
        expect(mockLogger.info).toHaveBeenCalledWith(
          'No GitHub App installation ID detected. Defaulting to authenticating using an access token...',
        );
      });

      it('should use GITHUB_TOKEN environment variable when no access token provided', () => {
        // Arrange
        const envToken = 'env-token-456';
        process.env.GITHUB_TOKEN = envToken;

        // Act
        const result = createAuthConfig({
          logger: mockLogger,
        });

        // Assert
        expect(result).toEqual({
          authStrategy: undefined,
          auth: envToken,
        });
      });

      it('should throw error when no access token is available', () => {
        // Arrange
        delete process.env.GITHUB_TOKEN;

        // Act & Assert
        expect(() =>
          createAuthConfig({
            logger: mockLogger,
          }),
        ).toThrow(
          'You must specify a GitHub access token using the --access-token argument or GITHUB_TOKEN environment variable.',
        );
      });
    });

    describe('GitHub App authentication', () => {
      it('should create app auth config when installation ID is provided', () => {
        // Arrange
        const appId = '12345';
        const privateKey = 'test-private-key';
        const appInstallationId = '67890';

        // Act
        const result = createAuthConfig({
          appId,
          privateKey,
          appInstallationId,
          logger: mockLogger,
        });

        // Assert
        expect(result.authStrategy).toBeDefined();
        expect(result.auth).toEqual({
          type: 'installation',
          appId: 12345,
          privateKey,
          installationId: 67890,
        });
        expect(mockLogger.info).toHaveBeenCalledWith(
          'GitHub App installation ID detected. Authenticating using GitHub App installation...',
        );
      });

      it('should use environment variables for GitHub App auth', () => {
        // Arrange
        process.env.GITHUB_APP_ID = '11111';
        process.env.GITHUB_APP_PRIVATE_KEY = 'env-private-key';
        process.env.GITHUB_APP_INSTALLATION_ID = '22222';

        // Act
        const result = createAuthConfig({
          appInstallationId: process.env.GITHUB_APP_INSTALLATION_ID,
          logger: mockLogger,
        });

        // Assert
        expect(result.auth).toEqual({
          type: 'installation',
          appId: 11111,
          privateKey: 'env-private-key',
          installationId: 22222,
        });
      });

      it('should read private key from file when privateKeyFile is provided', () => {
        // Arrange
        const keyContent = 'file-private-key-content';
        const keyFilePath = '/path/to/private-key.pem';
        vi.mocked(readFileSync).mockReturnValue(keyContent);

        // Act
        const result = createAuthConfig({
          appId: '12345',
          privateKeyFile: keyFilePath,
          appInstallationId: '67890',
          logger: mockLogger,
        });

        // Assert
        expect(readFileSync).toHaveBeenCalledWith(keyFilePath, 'utf-8');
        expect(result.auth).toEqual({
          type: 'installation',
          appId: 12345,
          privateKey: keyContent,
          installationId: 67890,
        });
      });

      it('should read private key from environment file path', () => {
        // Arrange
        const keyContent = 'env-file-private-key';
        const keyFilePath = '/env/path/to/key.pem';
        process.env.GITHUB_APP_PRIVATE_KEY_FILE = keyFilePath;
        process.env.GITHUB_APP_ID = '33333';
        process.env.GITHUB_APP_INSTALLATION_ID = '44444';
        vi.mocked(readFileSync).mockReturnValue(keyContent);

        // Act
        const result = createAuthConfig({
          appInstallationId: process.env.GITHUB_APP_INSTALLATION_ID,
          logger: mockLogger,
        });

        // Assert
        expect(readFileSync).toHaveBeenCalledWith(keyFilePath, 'utf-8');
        expect(result.auth).toEqual({
          type: 'installation',
          appId: 33333,
          privateKey: keyContent,
          installationId: 44444,
        });
      });
    });

    describe('error handling', () => {
      it('should throw error for invalid app ID', () => {
        // Act & Assert
        expect(() =>
          createAuthConfig({
            appId: 'invalid-app-id',
            privateKey: 'test-key',
            appInstallationId: '12345',
            logger: mockLogger,
          }),
        ).toThrow(
          'You must specify a GitHub app ID using the --app-id argument or GITHUB_APP_ID environment variable.',
        );
      });

      it('should reject app ID with trailing non-numeric characters like "123abc"', () => {
        expect(() =>
          createAuthConfig({
            appId: '123abc',
            privateKey: 'test-key',
            appInstallationId: '67890',
            logger: mockLogger,
          }),
        ).toThrow(
          'You must specify a GitHub app ID using the --app-id argument or GITHUB_APP_ID environment variable.',
        );
      });

      it('should reject installation ID with trailing non-numeric characters like "123abc"', () => {
        expect(() =>
          createAuthConfig({
            appId: '12345',
            privateKey: 'test-key',
            appInstallationId: '123abc',
            logger: mockLogger,
          }),
        ).toThrow(
          'You must specify a GitHub app installation ID using the --app-installation-id argument or GITHUB_APP_INSTALLATION_ID environment variable.',
        );
      });

      it('should throw error for missing private key', () => {
        // Act & Assert
        expect(() =>
          createAuthConfig({
            appId: '12345',
            appInstallationId: '67890',
            logger: mockLogger,
          }),
        ).toThrow(
          'You must specify a GitHub app private key using the --private-key argument, --private-key-file argument, GITHUB_APP_PRIVATE_KEY_FILE environment variable, or GITHUB_APP_PRIVATE_KEY environment variable.',
        );
      });

      it('should throw error for invalid installation ID', () => {
        // Act & Assert
        expect(() =>
          createAuthConfig({
            appId: '12345',
            privateKey: 'test-key',
            appInstallationId: 'invalid-installation-id',
            logger: mockLogger,
          }),
        ).toThrow(
          'You must specify a GitHub app installation ID using the --app-installation-id argument or GITHUB_APP_INSTALLATION_ID environment variable.',
        );
      });

      it('should log and re-throw errors', () => {
        // Arrange
        const errorMessage = 'Test auth error';
        vi.mocked(readFileSync).mockImplementation(() => {
          throw new Error(errorMessage);
        });

        // Act & Assert
        expect(() =>
          createAuthConfig({
            appId: '12345',
            privateKeyFile: '/invalid/path',
            appInstallationId: '67890',
            logger: mockLogger,
          }),
        ).toThrow(errorMessage);

        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error creating and validating auth config',
          expect.any(Error),
        );
      });
    });

    describe('edge cases', () => {
      it('should handle empty string values', () => {
        // Act & Assert
        expect(() =>
          createAuthConfig({
            appId: '',
            privateKey: 'test-key',
            appInstallationId: '12345',
            logger: mockLogger,
          }),
        ).toThrow();
      });

      it('should prioritize provided arguments over environment variables', () => {
        // Arrange
        process.env.GITHUB_APP_ID = '99999';
        process.env.GITHUB_APP_PRIVATE_KEY = 'env-key';
        process.env.GITHUB_APP_INSTALLATION_ID = '88888';

        const providedAppId = '12345';
        const providedKey = 'provided-key';
        const providedInstallationId = '67890';

        // Act
        const result = createAuthConfig({
          appId: providedAppId,
          privateKey: providedKey,
          appInstallationId: providedInstallationId,
          logger: mockLogger,
        });

        // Assert
        expect(result.auth).toEqual({
          type: 'installation',
          appId: 12345,
          privateKey: providedKey,
          installationId: 67890,
        });
      });
    });
  });

  describe('createAppLevelAuthConfig', () => {
    it('should create app-level auth config with valid inputs', () => {
      const result = createAppLevelAuthConfig('12345', 'test-private-key');

      expect(result.authStrategy).toBeDefined();
      expect(result.auth).toEqual({
        type: 'app',
        appId: 12345,
        privateKey: 'test-private-key',
      });
    });

    it('should throw when appId is invalid', () => {
      expect(() =>
        createAppLevelAuthConfig('not-a-number', 'test-key'),
      ).toThrow(
        'You must specify a GitHub app ID using the --app-id argument or GITHUB_APP_ID environment variable.',
      );
    });

    it('should fall back to GITHUB_APP_ID env var', () => {
      process.env.GITHUB_APP_ID = '99999';
      const result = createAppLevelAuthConfig('', 'test-key');

      expect(result.auth).toEqual({
        type: 'app',
        appId: 99999,
        privateKey: 'test-key',
      });
    });
  });

  describe('needsInstallationLookup', () => {
    it('should return true when app credentials present but no installation ID', () => {
      expect(
        needsInstallationLookup({
          appId: '12345',
          privateKey: 'test-key',
        }),
      ).toBe(true);
    });

    it('should return false when installation ID is provided', () => {
      expect(
        needsInstallationLookup({
          appId: '12345',
          privateKey: 'test-key',
          appInstallationId: '67890',
        }),
      ).toBe(false);
    });

    it('should return false when no app credentials', () => {
      expect(needsInstallationLookup({})).toBe(false);
    });

    it('should return false when only appId is provided (no private key)', () => {
      expect(needsInstallationLookup({ appId: '12345' })).toBe(false);
    });

    it('should return true when using privateKeyFile instead of privateKey', () => {
      expect(
        needsInstallationLookup({
          appId: '12345',
          privateKeyFile: '/path/to/key.pem',
        }),
      ).toBe(true);
    });

    it('should pick up app credentials from environment variables', () => {
      process.env.GITHUB_APP_ID = '12345';
      process.env.GITHUB_APP_PRIVATE_KEY = 'env-key';

      expect(needsInstallationLookup({})).toBe(true);
    });

    it('should return false when GITHUB_APP_INSTALLATION_ID env var is set', () => {
      process.env.GITHUB_APP_ID = '12345';
      process.env.GITHUB_APP_PRIVATE_KEY = 'env-key';
      process.env.GITHUB_APP_INSTALLATION_ID = '67890';

      expect(needsInstallationLookup({})).toBe(false);
    });
  });
});
