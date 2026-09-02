import { DEFAULT_API_VERSION, OctokitClient } from './service.js';
import { createOctokit } from './octokit.js';
import { Logger } from './types.js';
import { formatErrorMessage } from './errors.js';
import { checkAndHandleRateLimits } from './repo-stats-service.js';
import { loadCaCertificate } from './tls.js';
import type {
  CompareFinding,
  CompareStatsOptions,
  MatchedRepo,
} from './compare-stats-types.js';

/** Prefix used in the `Column` field for git ref findings. */
export const GIT_REF_COLUMN_PREFIX = 'git_ref:';

/** Column name used for the default branch name comparison. */
export const GIT_DEFAULT_BRANCH_COLUMN = 'git_default_branch';

/** Column name used for the default branch tip SHA comparison. */
export const GIT_DEFAULT_BRANCH_SHA_COLUMN = 'git_default_branch_sha';

export const BRANCH_REF_PREFIX = 'refs/heads/';
export const TAG_REF_PREFIX = 'refs/tags/';

export interface GitVerificationOptions {
  sourceOrg: string;
  targetOrg: string;
  pageSize: number;
  rateLimitCheckInterval: number;
}

export interface GitVerificationClients {
  sourceClient: OctokitClient;
  targetClient: OctokitClient;
}

/** Map of ref name (without prefix) to the SHA it points at. */
export type RefMap = Map<string, string>;

/**
 * Collects all refs for a repository into a `name -> sha` map by consuming the
 * paginated async generator on the client.
 */
export async function collectRefs(
  client: OctokitClient,
  owner: string,
  repo: string,
  refPrefix: string,
  pageSize: number,
): Promise<RefMap> {
  const refs: RefMap = new Map();
  for await (const ref of client.getRepoRefs(
    owner,
    repo,
    refPrefix,
    pageSize,
  )) {
    refs.set(ref.name, ref.oid);
  }
  return refs;
}

/**
 * Compares two `name -> sha` maps and produces findings.
 *
 * - Refs missing from the target are blocking (data loss)
 * - Refs whose SHA differs are blocking (diverged history)
 * - Refs only present on the target are warnings
 */
export function compareRefMaps(
  repo: MatchedRepo,
  refPrefix: string,
  sourceRefs: RefMap,
  targetRefs: RefMap,
): CompareFinding[] {
  const findings: CompareFinding[] = [];

  for (const [name, sourceSha] of sourceRefs) {
    const targetSha = targetRefs.get(name);
    if (targetSha === undefined) {
      findings.push(
        buildGitFinding(repo, {
          column: `${GIT_REF_COLUMN_PREFIX}${refPrefix}${name}`,
          sourceValue: sourceSha,
          targetValue: '',
          severity: 'blocking',
        }),
      );
    } else if (targetSha !== sourceSha) {
      findings.push(
        buildGitFinding(repo, {
          column: `${GIT_REF_COLUMN_PREFIX}${refPrefix}${name}`,
          sourceValue: sourceSha,
          targetValue: targetSha,
          severity: 'blocking',
        }),
      );
    }
  }

  for (const [name, targetSha] of targetRefs) {
    if (!sourceRefs.has(name)) {
      findings.push(
        buildGitFinding(repo, {
          column: `${GIT_REF_COLUMN_PREFIX}${refPrefix}${name}`,
          sourceValue: '',
          targetValue: targetSha,
          severity: 'warning',
        }),
      );
    }
  }

  return findings;
}

function buildGitFinding(
  repo: MatchedRepo,
  finding: {
    column: string;
    sourceValue: string;
    targetValue: string;
    severity: CompareFinding['Severity'];
  },
): CompareFinding {
  return {
    Repo_Name: repo.repoName,
    Source_Org: repo.sourceOrg,
    Target_Org: repo.targetOrg,
    Column: finding.column,
    Source_Value: finding.sourceValue,
    Target_Value: finding.targetValue,
    Delta: '',
    Severity: finding.severity,
    Status: 'matched',
  };
}

/**
 * Compares the default branch name and tip SHA, the highest-signal single
 * git-level check.
 */
export function compareDefaultBranch(
  repo: MatchedRepo,
  source: { name: string | null; oid: string | null },
  target: { name: string | null; oid: string | null },
): CompareFinding[] {
  const findings: CompareFinding[] = [];

  if ((source.name ?? '') !== (target.name ?? '')) {
    findings.push(
      buildGitFinding(repo, {
        column: GIT_DEFAULT_BRANCH_COLUMN,
        sourceValue: source.name ?? '',
        targetValue: target.name ?? '',
        severity: 'warning',
      }),
    );
  }

  if ((source.oid ?? '') !== (target.oid ?? '')) {
    findings.push(
      buildGitFinding(repo, {
        column: GIT_DEFAULT_BRANCH_SHA_COLUMN,
        sourceValue: source.oid ?? '',
        targetValue: target.oid ?? '',
        severity: 'blocking',
      }),
    );
  }

  return findings;
}

/**
 * Yields git-level findings for a single matched repository.
 * Repositories that are empty or inaccessible on either side are logged and
 * skipped rather than failing the whole run.
 */
export async function verifyRepoGitRefs(
  repo: MatchedRepo,
  clients: GitVerificationClients,
  options: GitVerificationOptions,
  logger: Logger,
): Promise<CompareFinding[]> {
  const { sourceClient, targetClient } = clients;
  const { sourceOrg, targetOrg, pageSize } = options;

  const [sourceDefault, targetDefault] = await Promise.all([
    sourceClient.getRepoDefaultBranchRef(sourceOrg, repo.repoName),
    targetClient.getRepoDefaultBranchRef(targetOrg, repo.repoName),
  ]);

  if (sourceDefault.isEmpty || targetDefault.isEmpty) {
    logger.warn(
      `Skipping git verification for ${repo.repoName}: repository is empty on ${
        sourceDefault.isEmpty ? 'source' : 'target'
      }`,
    );
    return [];
  }

  const findings = compareDefaultBranch(repo, sourceDefault, targetDefault);

  for (const refPrefix of [BRANCH_REF_PREFIX, TAG_REF_PREFIX]) {
    const [sourceRefs, targetRefs] = await Promise.all([
      collectRefs(sourceClient, sourceOrg, repo.repoName, refPrefix, pageSize),
      collectRefs(targetClient, targetOrg, repo.repoName, refPrefix, pageSize),
    ]);
    findings.push(...compareRefMaps(repo, refPrefix, sourceRefs, targetRefs));
  }

  return findings;
}

/**
 * Streams git-level findings for every matched repository. Implemented as an
 * async generator so findings can be written to the report incrementally.
 */
export async function* verifyGitRefs(
  repos: MatchedRepo[],
  clients: GitVerificationClients,
  options: GitVerificationOptions,
  logger: Logger,
): AsyncGenerator<CompareFinding, void, unknown> {
  let processedCount = 0;

  for (const repo of repos) {
    processedCount++;

    try {
      const findings = await verifyRepoGitRefs(repo, clients, options, logger);
      for (const finding of findings) {
        yield finding;
      }
    } catch (error) {
      logger.warn(
        `Skipping git verification for ${repo.repoName}: ${formatErrorMessage(
          error,
        )}`,
      );
    }

    if (processedCount % options.rateLimitCheckInterval === 0) {
      await checkAndHandleRateLimits({
        client: clients.sourceClient,
        logger,
        processedCount,
      });
      await checkAndHandleRateLimits({
        client: clients.targetClient,
        logger,
        processedCount,
      });
    }
  }
}

/**
 * Creates an OctokitClient for one side of the comparison. Source and target
 * live on different hosts with independent credentials, so each side gets its
 * own client rather than sharing the one built by `createClientFromOpts`.
 */
export function createComparisonClient(
  {
    token,
    baseUrl,
    proxyUrl,
    apiVersion,
    caCert,
  }: {
    token: string;
    baseUrl: string;
    proxyUrl?: string;
    apiVersion?: string;
    caCert?: string;
  },
  logger: Logger,
): OctokitClient {
  const octokit = createOctokit({ auth: token }, baseUrl, proxyUrl, logger, {
    caCert,
  });
  return new OctokitClient(octokit, apiVersion ?? DEFAULT_API_VERSION);
}

export function resolveComparisonToken(
  explicitToken: string | undefined,
  label: string,
): string {
  const token =
    explicitToken ||
    process.env.ACCESS_TOKEN ||
    process.env.GH_TOKEN ||
    process.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error(
      `A ${label} token is required for --verify-git. Provide --${label}-token or set ACCESS_TOKEN / GH_TOKEN / GITHUB_TOKEN.`,
    );
  }

  return token;
}

export async function* runGitVerification(
  matched: MatchedRepo[],
  options: CompareStatsOptions,
  logger: Logger,
): AsyncGenerator<CompareFinding, void, unknown> {
  const sourceOrg = options.sourceOrg?.trim();
  const targetOrg = options.targetOrg?.trim();

  if (!sourceOrg || !targetOrg) {
    throw new Error(
      '--verify-git requires both --source-org and --target-org so repositories can be addressed on each host.',
    );
  }

  const caCert = loadCaCertificate(options.caCertPath, logger);
  const clients = {
    sourceClient: createComparisonClient(
      {
        token: resolveComparisonToken(options.sourceToken, 'source'),
        baseUrl: options.sourceBaseUrl ?? 'https://api.github.com',
        proxyUrl: options.proxyUrl,
        apiVersion: options.apiVersion,
        caCert,
      },
      logger,
    ),
    targetClient: createComparisonClient(
      {
        token: resolveComparisonToken(options.targetToken, 'target'),
        baseUrl: options.targetBaseUrl ?? 'https://api.github.com',
        proxyUrl: options.proxyUrl,
        apiVersion: options.apiVersion,
        caCert,
      },
      logger,
    ),
  };

  logger.info(
    `Verifying git refs for ${matched.length} matched repositories (${sourceOrg} -> ${targetOrg})`,
  );

  yield* verifyGitRefs(
    matched,
    clients,
    {
      sourceOrg,
      targetOrg,
      pageSize: options.pageSize ?? 100,
      rateLimitCheckInterval: options.rateLimitCheckInterval ?? 10,
    },
    logger,
  );
}
