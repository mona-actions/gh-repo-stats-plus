import { describe, it, expect, vi } from 'vitest';
import orgReposCommand from '../src/commands/org-repos-command.js';

vi.mock('../src/org-repos.js', () => ({
  runOrgRepos: vi.fn(),
}));

describe('org-repos-command', () => {
  it('should have the correct name and description', () => {
    expect(orgReposCommand.name()).toBe('org-repos');
    expect(orgReposCommand.description()).toContain('Lists all repositories');
  });

  it('should have required options defined', () => {
    const optionNames = orgReposCommand.options.map((o) => o.long);
    expect(optionNames).toContain('--org-name');
    expect(optionNames).toContain('--access-token');
    expect(optionNames).toContain('--base-url');
    expect(optionNames).toContain('--page-size');
    expect(optionNames).toContain('--output-dir');
    expect(optionNames).toContain('--output-file-name');
    expect(optionNames).toContain('--batch-size');
    expect(optionNames).toContain('--max-batches');
    expect(optionNames).toContain('--ca-cert');
    expect(optionNames).toContain('--verbose');
  });

  it('should have correct defaults', () => {
    const baseUrl = orgReposCommand.options.find(
      (o) => o.long === '--base-url',
    );
    expect(baseUrl?.defaultValue).toBe('https://api.github.com');

    const pageSize = orgReposCommand.options.find(
      (o) => o.long === '--page-size',
    );
    expect(pageSize?.defaultValue).toBe(100);
    expect(typeof pageSize?.defaultValue).toBe('number');

    const outputDir = orgReposCommand.options.find(
      (o) => o.long === '--output-dir',
    );
    expect(outputDir?.defaultValue).toBe('output');

    const maxBatches = orgReposCommand.options.find(
      (o) => o.long === '--max-batches',
    );
    expect(maxBatches?.defaultValue).toBe(256);
    expect(typeof maxBatches?.defaultValue).toBe('number');
  });

  it('should have correct env var mappings', () => {
    const envMappings = [
      { long: '--org-name', env: 'ORG_NAME' },
      { long: '--access-token', env: 'ACCESS_TOKEN' },
      { long: '--base-url', env: 'BASE_URL' },
      { long: '--page-size', env: 'PAGE_SIZE' },
      { long: '--output-dir', env: 'OUTPUT_DIR' },
      { long: '--batch-size', env: 'BATCH_SIZE' },
      { long: '--max-batches', env: 'MAX_BATCHES' },
    ];

    for (const { long, env } of envMappings) {
      const option = orgReposCommand.options.find((o) => o.long === long);
      expect(option?.envVar, `${long} env var`).toBe(env);
    }
  });

  it('should parse numeric options as numbers', () => {
    orgReposCommand.parseOptions(['-o', 'test-org', '-t', 'test-token']);
    const opts = orgReposCommand.opts();
    expect(opts.pageSize).toBeTypeOf('number');
    expect(opts.maxBatches).toBeTypeOf('number');
  });

  it('should be a valid commander command', () => {
    expect(typeof orgReposCommand.parse).toBe('function');
    expect(typeof orgReposCommand.parseAsync).toBe('function');
  });
});
