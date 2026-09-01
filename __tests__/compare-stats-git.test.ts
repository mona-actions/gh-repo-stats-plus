import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/repo-stats-service.js', () => ({
  checkAndHandleRateLimits: vi.fn().mockResolvedValue(false),
}));

import { checkAndHandleRateLimits } from '../src/repo-stats-service.js';
import {
  BRANCH_REF_PREFIX,
  collectRefs,
  compareDefaultBranch,
  compareRefMaps,
  GIT_DEFAULT_BRANCH_COLUMN,
  GIT_DEFAULT_BRANCH_SHA_COLUMN,
  GIT_REF_COLUMN_PREFIX,
  TAG_REF_PREFIX,
  verifyGitRefs,
  verifyRepoGitRefs,
} from '../src/compare-stats-git.js';
import type { CompareFinding, MatchedRepo } from '../src/compare-stats.js';
import type { OctokitClient } from '../src/service.js';

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const repo: MatchedRepo = {
  repoName: 'repo-a',
  sourceOrg: 'src-org',
  targetOrg: 'tgt-org',
  source: {},
  target: {},
};

const options = {
  sourceOrg: 'src-org',
  targetOrg: 'tgt-org',
  pageSize: 100,
  rateLimitCheckInterval: 10,
};

function createClient(
  refs: Record<string, Array<{ name: string; oid: string }>>,
  defaultBranch: {
    isEmpty?: boolean;
    isArchived?: boolean;
    name?: string | null;
    oid?: string | null;
  } = {},
): OctokitClient {
  return {
    getRepoRefs: async function* (
      _owner: string,
      _repo: string,
      refPrefix: string,
    ) {
      for (const ref of refs[refPrefix] ?? []) {
        yield ref;
      }
    },
    getRepoDefaultBranchRef: vi.fn().mockResolvedValue({
      isEmpty: defaultBranch.isEmpty ?? false,
      isArchived: defaultBranch.isArchived ?? false,
      name: defaultBranch.name ?? 'main',
      oid: defaultBranch.oid ?? 'sha-main',
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as OctokitClient;
}

async function collect(
  generator: AsyncGenerator<CompareFinding, void, unknown>,
): Promise<CompareFinding[]> {
  const findings: CompareFinding[] = [];
  for await (const finding of generator) {
    findings.push(finding);
  }
  return findings;
}

describe('compare-stats-git', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('collectRefs', () => {
    it('collects all paginated refs into a name -> sha map', async () => {
      const client = createClient({
        [BRANCH_REF_PREFIX]: [
          { name: 'main', oid: 'sha1' },
          { name: 'dev', oid: 'sha2' },
        ],
      });

      const refs = await collectRefs(
        client,
        'src-org',
        'repo-a',
        BRANCH_REF_PREFIX,
        100,
      );

      expect(refs.get('main')).toBe('sha1');
      expect(refs.get('dev')).toBe('sha2');
      expect(refs.size).toBe(2);
    });
  });

  describe('compareRefMaps', () => {
    it('reports refs missing in target as blocking', () => {
      const findings = compareRefMaps(
        repo,
        BRANCH_REF_PREFIX,
        new Map([['main', 'sha1']]),
        new Map(),
      );

      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        Column: `${GIT_REF_COLUMN_PREFIX}${BRANCH_REF_PREFIX}main`,
        Source_Value: 'sha1',
        Target_Value: '',
        Severity: 'blocking',
      });
    });

    it('reports mismatched SHAs as blocking', () => {
      const findings = compareRefMaps(
        repo,
        TAG_REF_PREFIX,
        new Map([['v1', 'sha1']]),
        new Map([['v1', 'sha2']]),
      );

      expect(findings[0]).toMatchObject({
        Column: `${GIT_REF_COLUMN_PREFIX}${TAG_REF_PREFIX}v1`,
        Source_Value: 'sha1',
        Target_Value: 'sha2',
        Severity: 'blocking',
      });
    });

    it('reports refs only in target as warnings', () => {
      const findings = compareRefMaps(
        repo,
        BRANCH_REF_PREFIX,
        new Map(),
        new Map([['extra', 'sha3']]),
      );

      expect(findings[0]).toMatchObject({
        Source_Value: '',
        Target_Value: 'sha3',
        Severity: 'warning',
      });
    });

    it('returns no findings when ref maps match', () => {
      expect(
        compareRefMaps(
          repo,
          BRANCH_REF_PREFIX,
          new Map([['main', 'sha1']]),
          new Map([['main', 'sha1']]),
        ),
      ).toHaveLength(0);
    });
  });

  describe('compareDefaultBranch', () => {
    it('reports a differing default branch name as a warning', () => {
      const findings = compareDefaultBranch(
        repo,
        { name: 'main', oid: 'sha1' },
        { name: 'master', oid: 'sha1' },
      );

      expect(findings).toEqual([
        expect.objectContaining({
          Column: GIT_DEFAULT_BRANCH_COLUMN,
          Severity: 'warning',
        }),
      ]);
    });

    it('reports a differing default branch tip SHA as blocking', () => {
      const findings = compareDefaultBranch(
        repo,
        { name: 'main', oid: 'sha1' },
        { name: 'main', oid: 'sha2' },
      );

      expect(findings).toEqual([
        expect.objectContaining({
          Column: GIT_DEFAULT_BRANCH_SHA_COLUMN,
          Severity: 'blocking',
        }),
      ]);
    });
  });

  describe('verifyRepoGitRefs', () => {
    it('compares default branch, branches and tags', async () => {
      const sourceClient = createClient(
        {
          [BRANCH_REF_PREFIX]: [{ name: 'main', oid: 'sha1' }],
          [TAG_REF_PREFIX]: [{ name: 'v1', oid: 'tag1' }],
        },
        { oid: 'sha1' },
      );
      const targetClient = createClient(
        {
          [BRANCH_REF_PREFIX]: [{ name: 'main', oid: 'sha1' }],
          [TAG_REF_PREFIX]: [],
        },
        { oid: 'sha1' },
      );

      const findings = await verifyRepoGitRefs(
        repo,
        { sourceClient, targetClient },
        options,
        logger,
      );

      expect(findings).toHaveLength(1);
      expect(findings[0].Column).toBe(
        `${GIT_REF_COLUMN_PREFIX}${TAG_REF_PREFIX}v1`,
      );
    });

    it('skips empty repositories', async () => {
      const sourceClient = createClient({}, { isEmpty: true, oid: null });
      const targetClient = createClient({});

      const findings = await verifyRepoGitRefs(
        repo,
        { sourceClient, targetClient },
        options,
        logger,
      );

      expect(findings).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('repository is empty'),
      );
    });
  });

  describe('verifyGitRefs', () => {
    it('logs and skips repositories that fail rather than crashing', async () => {
      const sourceClient = createClient({});
      vi.mocked(sourceClient.getRepoDefaultBranchRef).mockRejectedValue(
        new Error('Not Found'),
      );
      const targetClient = createClient({});

      const findings = await collect(
        verifyGitRefs([repo], { sourceClient, targetClient }, options, logger),
      );

      expect(findings).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Not Found'),
      );
    });

    it('checks rate limits on both clients at the configured interval', async () => {
      const sourceClient = createClient({}, { oid: 'sha1' });
      const targetClient = createClient({}, { oid: 'sha1' });

      await collect(
        verifyGitRefs(
          [repo],
          { sourceClient, targetClient },
          { ...options, rateLimitCheckInterval: 1 },
          logger,
        ),
      );

      expect(checkAndHandleRateLimits).toHaveBeenCalledTimes(2);
    });
  });
});
