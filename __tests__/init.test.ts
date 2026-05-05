import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Arguments, CommandConfig, CommandContext } from '../src/types.js';

const mocks = vi.hoisted(() => {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  return {
    logger,
    createLogger: vi.fn().mockResolvedValue(logger),
    logInitialization: {
      start: vi.fn(),
      auth: vi.fn(),
      octokit: vi.fn(),
    },
    createAuthConfig: vi.fn().mockReturnValue({ auth: 'token' }),
    createAppLevelAuthConfig: vi.fn().mockReturnValue({ auth: 'app' }),
    needsInstallationLookup: vi.fn().mockReturnValue(true),
    getAuthPrivateKey: vi.fn().mockReturnValue('resolved-key'),
    createOctokit: vi.fn().mockReturnValue({}),
    lookupInstallationId: vi.fn().mockResolvedValue(123),
    octokitClient: vi.fn().mockImplementation(function () {
      return {};
    }),
    loadCaCertificate: vi.fn().mockReturnValue(undefined),
    stateManager: vi.fn(),
    sessionManager: vi.fn(),
  };
});

vi.mock('../src/logger.js', () => ({
  createLogger: mocks.createLogger,
  logInitialization: mocks.logInitialization,
}));

vi.mock('../src/auth.js', () => ({
  createAuthConfig: mocks.createAuthConfig,
  createAppLevelAuthConfig: mocks.createAppLevelAuthConfig,
  needsInstallationLookup: mocks.needsInstallationLookup,
  getAuthPrivateKey: mocks.getAuthPrivateKey,
}));

vi.mock('../src/octokit.js', () => ({
  createOctokit: mocks.createOctokit,
}));

vi.mock('../src/service.js', () => ({
  OctokitClient: mocks.octokitClient,
  DEFAULT_API_VERSION: '2022-11-28',
  lookupInstallationId: mocks.lookupInstallationId,
}));

vi.mock('../src/tls.js', () => ({
  loadCaCertificate: mocks.loadCaCertificate,
}));

vi.mock('../src/state.js', () => ({
  StateManager: mocks.stateManager,
}));

vi.mock('../src/session.js', () => ({
  SessionManager: mocks.sessionManager,
}));

vi.mock('../src/utils.js', () => ({
  formatElapsedTime: vi.fn().mockReturnValue('0m 0s'),
  resolveOutputPath: vi.fn().mockResolvedValue('output/file.csv'),
}));

function createArgs(overrides: Partial<Arguments> = {}): Arguments {
  return {
    orgName: undefined,
    orgList: [],
    baseUrl: 'https://api.github.com',
    proxyUrl: undefined,
    verbose: false,
    accessToken: 'token',
    appId: '123',
    privateKey: 'private-key',
    repoList: [],
    ...overrides,
  } as Arguments;
}

function createConfig(overrides: Partial<CommandConfig> = {}): CommandConfig {
  return {
    logPrefix: 'test',
    summaryLabel: 'TEST',
    generateFileName: vi.fn().mockReturnValue('test.csv'),
    initializeCsvFile: vi.fn(),
    processOrg: vi.fn(),
    ...overrides,
  };
}

describe('command initialization and execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createLogger.mockResolvedValue(mocks.logger);
    mocks.createAuthConfig.mockReturnValue({ auth: 'token' });
    mocks.needsInstallationLookup.mockReturnValue(true);
    mocks.lookupInstallationId.mockResolvedValue(123);
  });

  it('uses sourceLabel for non-org log naming and skips unsupported installation lookup', async () => {
    const { initCommand } = await import('../src/init.js');

    const context = await initCommand(
      createArgs(),
      createConfig({
        sourceLabel: 'repo-list',
        supportsInstallationLookup: false,
      }),
    );

    expect(context.orgsToProcess).toEqual([]);
    expect(mocks.createLogger).toHaveBeenCalledWith(
      false,
      expect.stringMatching(/^repo-list-test-.+\.log$/),
    );
    expect(mocks.needsInstallationLookup).not.toHaveBeenCalled();
    expect(mocks.lookupInstallationId).not.toHaveBeenCalled();
    expect(mocks.createAuthConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'token',
        appId: '123',
        privateKey: 'private-key',
        logger: mocks.logger,
      }),
    );
    expect(mocks.stateManager).not.toHaveBeenCalled();
    expect(mocks.sessionManager).not.toHaveBeenCalled();
  });

  it('continues to support installation lookup for org processing when source lookup is disabled', async () => {
    const { initCommand } = await import('../src/init.js');

    await initCommand(
      createArgs({ orgList: ['test-org'] }),
      createConfig({
        supportsInstallationLookup: false,
      }),
    );

    expect(mocks.needsInstallationLookup).toHaveBeenCalled();
    expect(mocks.lookupInstallationId).toHaveBeenCalledWith(
      expect.objectContaining({ org: 'test-org' }),
    );
  });

  it('delegates non-org execution to processSource and logs output files', async () => {
    const { executeCommand } = await import('../src/init.js');
    const processSource = vi
      .fn()
      .mockResolvedValue({ outputFiles: ['output/repo-list.csv'] });
    const config = createConfig({ sourceLabel: 'repo-list', processSource });
    const context = {
      opts: createArgs(),
      logger: mocks.logger,
      client: {},
      fileName: '',
      retryConfig: {
        maxAttempts: 3,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffFactor: 2,
        successThreshold: 5,
      },
      orgsToProcess: [],
      resumeFromOrgIndex: 0,
    } as unknown as CommandContext;

    const result = await executeCommand(context, config);

    expect(processSource).toHaveBeenCalledWith(context);
    expect(result).toEqual({ outputFiles: ['output/repo-list.csv'] });
    expect(mocks.logger.info).toHaveBeenCalledWith(
      'Processing source: repo-list',
    );
    expect(mocks.logger.info).toHaveBeenCalledWith(
      'output_file=output/repo-list.csv',
    );
  });

  it('preserves the existing error for commands without an org or source executor', async () => {
    const { executeCommand } = await import('../src/init.js');
    const context = {
      opts: createArgs(),
      logger: mocks.logger,
      client: {},
      fileName: '',
      retryConfig: {
        maxAttempts: 3,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffFactor: 2,
        successThreshold: 5,
      },
      orgsToProcess: [],
      resumeFromOrgIndex: 0,
    } as unknown as CommandContext;

    await expect(executeCommand(context, createConfig())).rejects.toThrow(
      'Either orgName or orgList must be provided',
    );
  });
});
