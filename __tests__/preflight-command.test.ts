import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockLogger } from './test-utils.js';

// Mock dependencies
vi.mock('../src/logger.js', () => ({
  createLogger: vi.fn(),
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

vi.mock('../src/service.js', () => {
  const MockOctokitClient = vi.fn();
  return {
    OctokitClient: MockOctokitClient,
    DEFAULT_API_VERSION: '2022-11-28',
  };
});

import { createLogger } from '../src/logger.js';
import { createAuthConfig } from '../src/auth.js';
import { createOctokit } from '../src/octokit.js';
import { OctokitClient } from '../src/service.js';
import { runPreflight } from '../src/commands/preflight-command.js';

describe('preflight-command', () => {
  const mockLogger = createMockLogger();
  let originalEnv: typeof process.env;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let mockClient: {
    validateRepository: ReturnType<typeof vi.fn>;
    validateOrganization: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    originalEnv = { ...process.env };
    mockClient = {
      validateRepository: vi.fn(),
      validateOrganization: vi.fn(),
    };
    vi.mocked(createLogger).mockResolvedValue(mockLogger as any);
    vi.mocked(createAuthConfig).mockReturnValue({
      authStrategy: undefined,
      auth: 'test-token',
    });
    vi.mocked(createOctokit).mockReturnValue({} as any);
    vi.mocked(OctokitClient).mockImplementation(function () {
      return mockClient as unknown as InstanceType<typeof OctokitClient>;
    });
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(createOctokit).mockClear();
    vi.mocked(createAuthConfig).mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('runPreflight', () => {
    describe('host resolution', () => {
      it('should resolve github.com from api.github.com', async () => {
        mockClient.validateOrganization.mockResolvedValue({
          login: 'test-org',
        });

        await runPreflight({
          baseUrl: 'https://api.github.com',
          type: 'organization',
          orgName: 'test-org',
          accessToken: 'token-123',
        });

        expect(consoleLogSpy).toHaveBeenCalledWith('gh_host=github.com');
        expect(consoleLogSpy).toHaveBeenCalledWith('is_github_com=true');
      });

      it('should resolve GHES hostname', async () => {
        mockClient.validateOrganization.mockResolvedValue({
          login: 'test-org',
        });

        await runPreflight({
          baseUrl: 'https://ghes.example.com/api/v3',
          type: 'organization',
          orgName: 'test-org',
          accessToken: 'token-123',
        });

        expect(consoleLogSpy).toHaveBeenCalledWith('gh_host=ghes.example.com');
        expect(consoleLogSpy).toHaveBeenCalledWith('is_github_com=false');
      });
    });

    describe('TLS bypass', () => {
      it('should configure TLS bypass for GHES when requested', async () => {
        mockClient.validateOrganization.mockResolvedValue({
          login: 'test-org',
        });

        await runPreflight({
          baseUrl: 'https://ghes.example.com/api/v3',
          type: 'organization',
          orgName: 'test-org',
          accessToken: 'token-123',
          skipTlsVerification: true,
        });

        expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBe('0');
        expect(consoleLogSpy).toHaveBeenCalledWith('ssl_verify_disabled=true');
      });

      it('should reject TLS bypass for github.com', async () => {
        await expect(
          runPreflight({
            baseUrl: 'https://api.github.com',
            type: 'organization',
            orgName: 'test-org',
            accessToken: 'token-123',
            skipTlsVerification: true,
          }),
        ).rejects.toThrow(
          /Refusing to disable TLS verification for public github.com/,
        );
      });

      it('should not configure TLS bypass when not requested', async () => {
        mockClient.validateOrganization.mockResolvedValue({
          login: 'test-org',
        });

        await runPreflight({
          baseUrl: 'https://ghes.example.com/api/v3',
          type: 'organization',
          orgName: 'test-org',
          accessToken: 'token-123',
          skipTlsVerification: false,
        });

        expect(consoleLogSpy).toHaveBeenCalledWith('ssl_verify_disabled=false');
      });
    });

    describe('repository validation', () => {
      it('should validate repository exists', async () => {
        mockClient.validateRepository.mockResolvedValue({
          fullName: 'test-org/test-repo',
        });

        await runPreflight({
          baseUrl: 'https://api.github.com',
          type: 'repository',
          orgName: 'test-org',
          repository: 'test-repo',
          accessToken: 'token-123',
        });

        expect(mockClient.validateRepository).toHaveBeenCalledWith(
          'test-org',
          'test-repo',
        );
      });

      it('should throw on repository not found (404)', async () => {
        mockClient.validateRepository.mockRejectedValue(
          new Error('Repository not found: test-org/nonexistent'),
        );

        await expect(
          runPreflight({
            baseUrl: 'https://api.github.com',
            type: 'repository',
            orgName: 'test-org',
            repository: 'nonexistent',
            accessToken: 'token-123',
          }),
        ).rejects.toThrow(/Repository not found: test-org\/nonexistent/);
      });

      it('should throw on repository API error', async () => {
        mockClient.validateRepository.mockRejectedValue(
          new Error(
            'Failed to validate repository test-org/test-repo: Network error',
          ),
        );

        await expect(
          runPreflight({
            baseUrl: 'https://api.github.com',
            type: 'repository',
            orgName: 'test-org',
            repository: 'test-repo',
            accessToken: 'token-123',
          }),
        ).rejects.toThrow(/Failed to validate repository/);
      });
    });

    describe('organization validation', () => {
      it('should validate organization exists for org type', async () => {
        mockClient.validateOrganization.mockResolvedValue({
          login: 'test-org',
        });

        await runPreflight({
          baseUrl: 'https://api.github.com',
          type: 'organization',
          orgName: 'test-org',
          accessToken: 'token-123',
        });

        expect(mockClient.validateOrganization).toHaveBeenCalledWith(
          'test-org',
        );
      });

      it('should validate organization for project-stats type', async () => {
        mockClient.validateOrganization.mockResolvedValue({
          login: 'test-org',
        });

        await runPreflight({
          baseUrl: 'https://api.github.com',
          type: 'project-stats',
          orgName: 'test-org',
          accessToken: 'token-123',
        });

        expect(mockClient.validateOrganization).toHaveBeenCalledWith(
          'test-org',
        );
      });

      it('should throw on organization not found (404)', async () => {
        mockClient.validateOrganization.mockRejectedValue(
          new Error('Organization not found: nonexistent-org'),
        );

        await expect(
          runPreflight({
            baseUrl: 'https://api.github.com',
            type: 'organization',
            orgName: 'nonexistent-org',
            accessToken: 'token-123',
          }),
        ).rejects.toThrow(/Organization not found: nonexistent-org/);
      });

      it('should throw on organization API error', async () => {
        mockClient.validateOrganization.mockRejectedValue(
          new Error(
            'Failed to validate organization test-org: Connection refused',
          ),
        );

        await expect(
          runPreflight({
            baseUrl: 'https://api.github.com',
            type: 'organization',
            orgName: 'test-org',
            accessToken: 'token-123',
          }),
        ).rejects.toThrow(/Failed to validate organization/);
      });
    });

    describe('combine type', () => {
      it('should skip validation for combine type', async () => {
        await runPreflight({
          baseUrl: 'https://api.github.com',
          type: 'combine',
        });

        expect(createOctokit).not.toHaveBeenCalled();
        expect(mockClient.validateRepository).not.toHaveBeenCalled();
        expect(mockClient.validateOrganization).not.toHaveBeenCalled();
      });
    });

    describe('app-install-stats auth validation', () => {
      it('should succeed with access token for app-install-stats', async () => {
        mockClient.validateOrganization.mockResolvedValue({
          login: 'test-org',
        });

        await expect(
          runPreflight({
            baseUrl: 'https://api.github.com',
            type: 'app-install-stats',
            orgName: 'test-org',
            accessToken: 'pat-token',
          }),
        ).resolves.not.toThrow();
      });
    });

    describe('authenticated client creation', () => {
      it('should create Octokit with auth config and base URL', async () => {
        mockClient.validateOrganization.mockResolvedValue({
          login: 'test-org',
        });

        await runPreflight({
          baseUrl: 'https://ghes.example.com/api/v3',
          type: 'organization',
          orgName: 'test-org',
          accessToken: 'token-123',
          appId: 'app-123',
          privateKey: 'key-123',
          appInstallationId: 'install-123',
        });

        expect(createAuthConfig).toHaveBeenCalledWith(
          expect.objectContaining({
            accessToken: 'token-123',
            appId: 'app-123',
            privateKey: 'key-123',
            appInstallationId: 'install-123',
          }),
        );

        expect(createOctokit).toHaveBeenCalledWith(
          expect.anything(),
          'https://ghes.example.com/api/v3',
          undefined,
          expect.anything(),
        );
      });
    });
  });

  describe('command definition', () => {
    it('should be defined with correct name', async () => {
      const { default: preflightCommand } =
        await import('../src/commands/preflight-command.js');
      expect(preflightCommand.name()).toBe('preflight');
    });

    it('should have required options', async () => {
      const { default: preflightCommand } =
        await import('../src/commands/preflight-command.js');
      const optionNames = preflightCommand.options.map((opt: any) => opt.long);

      expect(optionNames).toContain('--base-url');
      expect(optionNames).toContain('--skip-tls-verification');
      expect(optionNames).toContain('--org-name');
      expect(optionNames).toContain('--repository');
      expect(optionNames).toContain('--type');
      expect(optionNames).toContain('--access-token');
      expect(optionNames).toContain('--app-id');
      expect(optionNames).toContain('--private-key');
      expect(optionNames).toContain('--app-installation-id');
    });
  });
});
