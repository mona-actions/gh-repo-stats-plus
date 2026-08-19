import { describe, it, expect } from 'vitest';
import type { components } from '@octokit/openapi-types';
import { webhookToResult, isWebhookActive } from '../src/webhooks.js';

type RepoHook = components['schemas']['hook'];
type OrgHook = components['schemas']['org-hook'];

function makeRepoHook(overrides: Partial<RepoHook> = {}): RepoHook {
  return {
    id: 1,
    name: 'web',
    active: true,
    events: ['push', 'pull_request'],
    config: {
      url: 'https://example.com/hook?token=abc',
      content_type: 'json',
      insecure_ssl: '0',
      secret: '********',
    },
    updated_at: '2024-01-02T00:00:00Z',
    created_at: '2024-01-01T00:00:00Z',
    last_response: {
      code: 200,
      status: 'active',
      message: 'OK',
    },
    ...overrides,
  } as unknown as RepoHook;
}

function makeOrgHook(overrides: Partial<OrgHook> = {}): OrgHook {
  return {
    id: 10,
    name: 'web',
    active: true,
    events: ['repository'],
    config: {
      url: 'https://org.example.com/hook',
      content_type: 'form',
      insecure_ssl: '0',
    },
    updated_at: '2024-02-02T00:00:00Z',
    created_at: '2024-02-01T00:00:00Z',
    ...overrides,
  } as unknown as OrgHook;
}

describe('webhooks - data mapping', () => {
  describe('webhookToResult', () => {
    it('maps a repository webhook to a CSV row shape', () => {
      const row = webhookToResult(
        'my-org',
        'my-repo',
        'Repository',
        makeRepoHook(),
      );

      expect(row).toEqual({
        Org_Name: 'my-org',
        Repo_Name: 'my-repo',
        Webhook_Type: 'Repository',
        Webhook_Id: 1,
        Name: 'web',
        Active: true,
        Has_Secret: true,
        Events: 'push;pull_request',
        Url: 'https://example.com/hook?token=abc',
        Content_Type: 'json',
        Insecure_SSL: '0',
        Created_At: '2024-01-01T00:00:00Z',
        Updated_At: '2024-01-02T00:00:00Z',
        Last_Response_Code: '200',
        Last_Response_Status: 'active',
        Last_Response_Message: 'OK',
      });
    });

    it('maps an organization webhook with empty repo name and no last response', () => {
      const row = webhookToResult(
        'my-org',
        undefined,
        'Organization',
        makeOrgHook(),
      );

      expect(row.Org_Name).toBe('my-org');
      expect(row.Repo_Name).toBe('');
      expect(row.Webhook_Type).toBe('Organization');
      expect(row.Has_Secret).toBe(false);
      expect(row.Events).toBe('repository');
      expect(row.Last_Response_Code).toBe('');
      expect(row.Last_Response_Status).toBe('');
      expect(row.Last_Response_Message).toBe('');
    });

    it('handles missing config fields gracefully', () => {
      const row = webhookToResult(
        'my-org',
        'my-repo',
        'Repository',
        makeRepoHook({ config: {} as RepoHook['config'] }),
      );

      expect(row.Url).toBe('');
      expect(row.Content_Type).toBe('');
      expect(row.Insecure_SSL).toBe('');
      expect(row.Has_Secret).toBe(false);
    });
  });

  describe('isWebhookActive', () => {
    it('returns true for a repo webhook whose last response status is active', () => {
      expect(isWebhookActive(makeRepoHook())).toBe(true);
    });

    it('returns false for a repo webhook whose last response status is not active', () => {
      expect(
        isWebhookActive(
          makeRepoHook({
            last_response: {
              code: 500,
              status: 'misconfigured',
              message: 'err',
            },
          }),
        ),
      ).toBe(false);
    });

    it('falls back to the active flag for org webhooks (no last response)', () => {
      expect(isWebhookActive(makeOrgHook({ active: true }))).toBe(true);
      expect(isWebhookActive(makeOrgHook({ active: false }))).toBe(false);
    });
  });
});
