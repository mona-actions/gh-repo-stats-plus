import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createOctokit } from '../src/octokit.js';
import { createMockLogger } from './test-utils.js';
import type { AuthConfig } from '../src/auth.js';

// Mock external dependencies
vi.mock('undici', () => ({
  fetch: vi.fn(),
  Agent: vi.fn(),
  ProxyAgent: vi.fn(),
}));

import { Agent, ProxyAgent } from 'undici';

const MockAgent = vi.mocked(Agent);
const MockProxyAgent = vi.mocked(ProxyAgent);

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
      const result = createOctokit(
        mockAuthConfig,
        'https://api.github.com',
        undefined,
        mockLogger,
      );

      expect(result).toBeDefined();
      expect(result.hook).toBeDefined();
      expect(result.hook.after).toBeInstanceOf(Function);
      expect(result.hook.error).toBeInstanceOf(Function);
    });

    it('should not create any dispatcher when no proxy or caCert', () => {
      createOctokit(
        mockAuthConfig,
        'https://api.github.com',
        undefined,
        mockLogger,
      );

      expect(MockAgent).not.toHaveBeenCalled();
      expect(MockProxyAgent).not.toHaveBeenCalled();
    });

    it('should configure ProxyAgent when proxyUrl is provided', () => {
      createOctokit(
        mockAuthConfig,
        'https://api.github.com',
        'http://proxy.example.com:8080',
        mockLogger,
      );

      expect(MockProxyAgent).toHaveBeenCalledWith(
        'http://proxy.example.com:8080',
      );
      expect(MockAgent).not.toHaveBeenCalled();
    });

    it('should use custom fetch function when provided', () => {
      const customFetch = vi.fn();

      const result = createOctokit(
        mockAuthConfig,
        'https://api.github.com',
        undefined,
        mockLogger,
        { fetch: customFetch },
      );

      expect(result).toBeDefined();
    });

    it('should configure auth strategy when provided', () => {
      const mockAuthStrategy = vi.fn();
      const authConfigWithStrategy: AuthConfig = {
        authStrategy: mockAuthStrategy,
        auth: { type: 'installation', appId: 123 },
      };

      const result = createOctokit(
        authConfigWithStrategy,
        'https://api.github.com',
        undefined,
        mockLogger,
      );

      expect(result).toBeDefined();
    });

    it('should create Agent with CA cert when caCert is provided without proxy', () => {
      const caCert =
        '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----';

      createOctokit(
        mockAuthConfig,
        'https://ghes.example.com/api/v3',
        undefined,
        mockLogger,
        {
          caCert,
        },
      );

      expect(MockAgent).toHaveBeenCalledWith({ connect: { ca: caCert } });
      expect(MockProxyAgent).not.toHaveBeenCalled();
    });

    it('should create ProxyAgent with requestTls when both proxy and caCert are provided', () => {
      const caCert =
        '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----';
      const proxyUrl = 'http://proxy.example.com:8080';

      createOctokit(
        mockAuthConfig,
        'https://ghes.example.com/api/v3',
        proxyUrl,
        mockLogger,
        {
          caCert,
        },
      );

      expect(MockProxyAgent).toHaveBeenCalledWith({
        uri: proxyUrl,
        requestTls: { ca: caCert },
      });
      expect(MockAgent).not.toHaveBeenCalled();
    });

    describe('hook handlers', () => {
      it('should have after and error hooks configured', () => {
        const result = createOctokit(
          mockAuthConfig,
          'https://api.github.com',
          undefined,
          mockLogger,
        );

        expect(result.hook.after).toHaveBeenCalled();
        expect(result.hook.error).toHaveBeenCalled();
      });
    });
  });
});
