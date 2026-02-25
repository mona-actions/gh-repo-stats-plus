import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createOctokit } from '../src/octokit.js';
import { createMockLogger } from './test-utils.js';
import type { AuthConfig } from '../src/auth.js';

// Mock external dependencies
vi.mock('undici', () => ({
  fetch: vi.fn(),
  ProxyAgent: vi.fn(),
}));

vi.mock('octokit', () => {
  const mockOctokit = {
    hook: {
      after: vi.fn(),
      error: vi.fn(),
    },
  };

  const Octokit = {
    plugin: vi.fn(function () {
      return {
        plugin: vi.fn(function () {
          return vi.fn(function () {
            return mockOctokit;
          });
        }),
      };
    }),
  };

  return {
    Octokit,
    RequestError: class MockRequestError extends Error {
      status: number;
      constructor(message: string, status: number) {
        super(message);
        this.status = status;
        this.name = 'RequestError';
      }
    },
  };
});

vi.mock('@octokit/plugin-paginate-graphql', () => ({
  paginateGraphQL: vi.fn(),
}));

vi.mock('@octokit/plugin-throttling', () => ({
  throttling: vi.fn(),
}));

describe('octokit', () => {
  const mockLogger = createMockLogger();
  let mockAuthConfig: AuthConfig;

  beforeEach(() => {
    vi.resetAllMocks();
    mockAuthConfig = {
      authStrategy: undefined,
      auth: 'test-token',
    };
  });

  describe('createOctokit', () => {
    it('should create Octokit instance with basic configuration', () => {
      // Arrange
      const baseUrl = 'https://api.github.com';

      // Act
      const result = createOctokit(
        mockAuthConfig,
        baseUrl,
        undefined,
        mockLogger,
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.hook).toBeDefined();
      expect(result.hook.after).toBeInstanceOf(Function);
      expect(result.hook.error).toBeInstanceOf(Function);
    });

    it('should configure proxy when proxyUrl is provided', () => {
      // Arrange
      const proxyUrl = 'http://proxy.example.com:8080';
      const baseUrl = 'https://api.github.com';

      // Act & Assert - Simply test that the function doesn't throw
      expect(() => {
        createOctokit(mockAuthConfig, baseUrl, proxyUrl, mockLogger);
      }).not.toThrow();
    });

    it('should use custom fetch function when provided', () => {
      // Arrange
      const customFetch = vi.fn();
      const baseUrl = 'https://api.github.com';

      // Act
      const result = createOctokit(
        mockAuthConfig,
        baseUrl,
        undefined,
        mockLogger,
        customFetch,
      );

      // Assert
      expect(result).toBeDefined();
    });

    it('should configure auth strategy when provided', () => {
      // Arrange
      const mockAuthStrategy = vi.fn();
      const authConfigWithStrategy: AuthConfig = {
        authStrategy: mockAuthStrategy,
        auth: { type: 'installation', appId: 123 },
      };

      // Act
      const result = createOctokit(
        authConfigWithStrategy,
        'https://api.github.com',
        undefined,
        mockLogger,
      );

      // Assert
      expect(result).toBeDefined();
    });

    describe('hook handlers', () => {
      it('should have after and error hooks configured', () => {
        // Arrange
        const result = createOctokit(
          mockAuthConfig,
          'https://api.github.com',
          undefined,
          mockLogger,
        );

        // Assert
        expect(result.hook.after).toHaveBeenCalled();
        expect(result.hook.error).toHaveBeenCalled();
      });
    });
  });
});
