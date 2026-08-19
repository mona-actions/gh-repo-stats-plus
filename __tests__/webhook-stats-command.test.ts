import { describe, it, expect, vi } from 'vitest';
import webhookStatsCommand from '../src/commands/webhook-stats-command.js';

// Mock the webhooks module so the action does not perform real work
vi.mock('../src/webhooks.js', () => ({
  runWebhookStats: vi.fn(),
}));

describe('Commands - webhook-stats-command', () => {
  it('should be defined with correct name and description', () => {
    expect(webhookStatsCommand.name()).toBe('webhook-stats');
    expect(webhookStatsCommand.description()).toContain('webhook');
  });

  it('should have required options defined', () => {
    const optionNames = webhookStatsCommand.options.map((opt) => opt.long);

    expect(optionNames).toContain('--org-name');
    expect(optionNames).toContain('--org-list');
    expect(optionNames).toContain('--repo-list');
    expect(optionNames).toContain('--access-token');
    expect(optionNames).toContain('--app-id');
    expect(optionNames).toContain('--private-key');
    expect(optionNames).toContain('--private-key-file');
    expect(optionNames).toContain('--app-installation-id');
    expect(optionNames).toContain('--base-url');
    expect(optionNames).toContain('--proxy-url');
    expect(optionNames).toContain('--ca-cert');
    expect(optionNames).toContain('--api-version');
    expect(optionNames).toContain('--verbose');
    expect(optionNames).toContain('--page-size');
    expect(optionNames).toContain('--retry-max-attempts');
    expect(optionNames).toContain('--resume-from-last-save');
    expect(optionNames).toContain('--force-fresh-start');
    expect(optionNames).toContain('--output-dir');
    expect(optionNames).toContain('--output-file-name');
    expect(optionNames).toContain('--clean-state');
    expect(optionNames).toContain('--delay-between-orgs');
    expect(optionNames).toContain('--continue-on-error');
    expect(optionNames).toContain('--webhook-scope');
    expect(optionNames).toContain('--only-active-repos');
    expect(optionNames).toContain('--only-active-webhooks');
  });

  it('should default webhook-scope to repo with valid choices', () => {
    const scopeOption = webhookStatsCommand.options.find(
      (opt) => opt.long === '--webhook-scope',
    );
    expect(scopeOption?.defaultValue).toBe('repo');
    expect(scopeOption?.argChoices).toEqual(['repo', 'org', 'both']);
  });

  it('should have sensible default values', () => {
    const baseUrlOption = webhookStatsCommand.options.find(
      (opt) => opt.long === '--base-url',
    );
    expect(baseUrlOption?.defaultValue).toBe('https://api.github.com');

    const pageSizeOption = webhookStatsCommand.options.find(
      (opt) => opt.long === '--page-size',
    );
    expect(pageSizeOption?.defaultValue).toBe(100);

    const outputDirOption = webhookStatsCommand.options.find(
      (opt) => opt.long === '--output-dir',
    );
    expect(outputDirOption?.defaultValue).toBe('output');
  });

  it('should have environment variable mappings', () => {
    const envMappings: Record<string, string> = {
      '--org-name': 'ORG_NAME',
      '--org-list': 'ORG_LIST',
      '--repo-list': 'REPO_LIST',
      '--access-token': 'ACCESS_TOKEN',
      '--webhook-scope': 'WEBHOOK_SCOPE',
      '--only-active-repos': 'ONLY_ACTIVE_REPOS',
      '--only-active-webhooks': 'ONLY_ACTIVE_WEBHOOKS',
    };

    for (const [optionName, expectedEnv] of Object.entries(envMappings)) {
      const option = webhookStatsCommand.options.find(
        (opt) => opt.long === optionName,
      );
      expect(option?.envVar).toBe(expectedEnv);
    }
  });
});
