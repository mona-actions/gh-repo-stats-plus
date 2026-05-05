import { OctokitClient } from './service.js';
import {
  Arguments,
  IssuesConnection,
  IssueStatsResult,
  Logger,
  ProcessedPageState,
  PullRequestsConnection,
  PullRequestStatsResult,
  RepositoryStats,
  RepoStatsResult,
} from './types.js';
import type { StateManager } from './state.js';
import {
  checkIfHasMigrationIssues,
  convertKbToMb,
  hasLfsTracking,
} from './utils.js';
import {
  appendCsvRow,
  initializeCsvFile as initializeCsvFileGeneric,
  REPO_STATS_COLUMNS,
} from './csv.js';

export interface RepoStatsRepositoryEntry {
  owner: string;
  repo: string;
  key: string;
}

export interface RepoStatsProcessingState {
  successCount: number;
  retryCount: number;
}

export function buildProcessedRepoKeySet(
  processedState: ProcessedPageState,
): Set<string> {
  return new Set(
    processedState.processedRepos.map((repoName) => repoName.toLowerCase()),
  );
}

export function initializeCsvFile(fileName: string, logger: Logger): void {
  initializeCsvFileGeneric(fileName, REPO_STATS_COLUMNS, logger);
}

export async function analyzeRepositoryStats({
  repo,
  owner,
  extraPageSize,
  client,
  logger,
}: {
  repo: RepositoryStats;
  owner: string;
  extraPageSize: number;
  client: OctokitClient;
  logger: Logger;
}): Promise<RepoStatsResult> {
  logger.info(`Analyzing repository: ${owner}/${repo.name}`);

  // Run issue and PR analysis concurrently
  const [issueStats, prStats] = await Promise.all([
    analyzeIssues({
      owner,
      repo: repo.name,
      per_page: extraPageSize,
      issues: repo.issues,
      client,
      logger,
    }),
    analyzePullRequests({
      owner,
      repo: repo.name,
      per_page: extraPageSize,
      pullRequests: repo.pullRequests,
      client,
      logger,
    }),
  ]);

  return mapToRepoStatsResult(repo, issueStats, prStats);
}

export async function handleRepoProcessingSuccess({
  result,
  processedState,
  state,
  opts,
  client,
  logger,
  processedCount,
  stateManager,
  processedRepoKey,
}: {
  result: RepoStatsResult;
  processedState: ProcessedPageState;
  state: RepoStatsProcessingState;
  opts: Arguments;
  client: OctokitClient;
  logger: Logger;
  processedCount: number;
  stateManager: StateManager;
  processedRepoKey?: string;
}): Promise<void> {
  const successThreshold = opts.retrySuccessThreshold || 5;

  // Track successful processing
  state.successCount++;
  if (state.successCount >= successThreshold && state.retryCount > 0) {
    logger.info(
      `Reset retry count after ${state.successCount} successful operations`,
    );
    state.retryCount = 0;
    state.successCount = 0;
  }

  stateManager.update(processedState, {
    repoName: processedRepoKey ?? result.Repo_Name,
    lastSuccessfulCursor: processedState.currentCursor,
  });

  // Check rate limits after configured interval
  if (processedCount % (opts.rateLimitCheckInterval || 10) === 0) {
    const rateLimitReached = await checkAndHandleRateLimits({
      client,
      logger,
      processedCount,
    });

    if (rateLimitReached) {
      throw new Error(
        'Rate limit reached. Processing will be paused until limits reset.',
      );
    }
  }
}

export async function processRepositoryByName({
  entry,
  client,
  logger,
  opts,
  processedState,
  processedRepoKeys,
  state,
  fileName,
  stateManager,
  processedCount,
}: {
  entry: RepoStatsRepositoryEntry;
  client: OctokitClient;
  logger: Logger;
  opts: Arguments;
  processedState: ProcessedPageState;
  processedRepoKeys: Set<string>;
  state: RepoStatsProcessingState;
  fileName: string;
  stateManager: StateManager;
  processedCount: number;
}): Promise<void> {
  logger.info(`Processing repository: ${entry.owner}/${entry.repo}`);

  const repoStats = await client.getRepoStats(
    entry.owner,
    entry.repo,
    opts.pageSize != null ? Number(opts.pageSize) : 10,
  );

  const result = await analyzeRepositoryStats({
    repo: repoStats,
    owner: entry.owner,
    extraPageSize: opts.extraPageSize != null ? Number(opts.extraPageSize) : 25,
    client,
    logger,
  });

  await writeResultToCsv(result, fileName, logger);
  await handleRepoProcessingSuccess({
    result,
    processedState,
    state,
    opts,
    client,
    logger,
    processedCount,
    stateManager,
    processedRepoKey: entry.key,
  });
  processedRepoKeys.add(entry.key);
}

export async function checkAndHandleRateLimits({
  client,
  logger,
  processedCount,
}: {
  client: OctokitClient;
  logger: Logger;
  processedCount: number;
}): Promise<boolean> {
  logger.debug(
    `Checking rate limits after processing ${processedCount} repositories`,
  );
  const rateLimits = await client.checkRateLimits();

  if (
    rateLimits.graphQLRemaining === 0 ||
    rateLimits.apiRemainingRequest === 0
  ) {
    const limitType =
      rateLimits.graphQLRemaining === 0 ? 'GraphQL' : 'REST API';
    logger.warn(
      `${limitType} rate limit reached after processing ${processedCount} repositories`,
    );

    if (rateLimits.messageType === 'error') {
      logger.error(`${rateLimits.message}`);
      throw new Error(
        `${limitType} rate limit exceeded and maximum retries reached`,
      );
    }

    logger.warn(`${rateLimits.message}`);
    logger.info(`GraphQL remaining: ${rateLimits.graphQLRemaining}`);
    logger.info(`REST API remaining: ${rateLimits.apiRemainingRequest}`);

    return true; // indicates rate limit was reached
  } else {
    logger.info(
      `GraphQL remaining: ${rateLimits.graphQLRemaining}, REST API remaining: ${rateLimits.apiRemainingRequest}`,
    );
  }

  return false; // indicates rate limit was not reached
}

export async function writeResultToCsv(
  result: RepoStatsResult,
  fileName: string,
  logger: Logger,
): Promise<void> {
  try {
    const formattedResult = {
      ...result,
      Is_Empty: result.Is_Empty?.toString().toUpperCase() || 'FALSE',
      isFork: result.isFork?.toString().toUpperCase() || 'FALSE',
      isArchived: result.isArchived?.toString().toUpperCase() || 'FALSE',
      isTemplate: result.isTemplate?.toString().toUpperCase() || 'FALSE',
      Has_Wiki: result.Has_Wiki?.toString().toUpperCase() || 'FALSE',
      Has_LFS: result.Has_LFS?.toString().toUpperCase() || 'FALSE',
      Auto_Merge_Allowed:
        result.Auto_Merge_Allowed?.toString().toUpperCase() || 'FALSE',
      Delete_Branch_On_Merge:
        result.Delete_Branch_On_Merge?.toString().toUpperCase() || 'FALSE',
      Merge_Commit_Allowed:
        result.Merge_Commit_Allowed?.toString().toUpperCase() || 'FALSE',
      Squash_Merge_Allowed:
        result.Squash_Merge_Allowed?.toString().toUpperCase() || 'FALSE',
      Rebase_Merge_Allowed:
        result.Rebase_Merge_Allowed?.toString().toUpperCase() || 'FALSE',
      Migration_Issue:
        result.Migration_Issue?.toString().toUpperCase() || 'FALSE',
    };

    // Create CSV row manually to maintain strict order
    const values = [
      formattedResult.Org_Name,
      formattedResult.Repo_Name,
      formattedResult.Is_Empty,
      formattedResult.Last_Push,
      formattedResult.Last_Update,
      formattedResult.isFork,
      formattedResult.isArchived,
      formattedResult.isTemplate,
      formattedResult.Visibility,
      formattedResult.Repo_Size_mb,
      formattedResult.Record_Count,
      formattedResult.Collaborator_Count,
      formattedResult.Protected_Branch_Count,
      formattedResult.Ruleset_Count,
      formattedResult.PR_Review_Count,
      formattedResult.Milestone_Count,
      formattedResult.Issue_Count,
      formattedResult.PR_Count,
      formattedResult.PR_Review_Comment_Count,
      formattedResult.Commit_Comment_Count,
      formattedResult.Issue_Comment_Count,
      formattedResult.Issue_Event_Count,
      formattedResult.Release_Count,
      formattedResult.Project_Count,
      formattedResult.Branch_Count,
      formattedResult.Tag_Count,
      formattedResult.Discussion_Count,
      formattedResult.Star_Count,
      formattedResult.Fork_Count,
      formattedResult.Watcher_Count,
      formattedResult.Has_Wiki,
      formattedResult.Has_LFS,
      formattedResult.Default_Branch,
      formattedResult.Primary_Language,
      formattedResult.Languages,
      formattedResult.License,
      formattedResult.Topics,
      formattedResult.Description,
      formattedResult.Homepage_URL,
      formattedResult.Auto_Merge_Allowed,
      formattedResult.Delete_Branch_On_Merge,
      formattedResult.Merge_Commit_Allowed,
      formattedResult.Squash_Merge_Allowed,
      formattedResult.Rebase_Merge_Allowed,
      formattedResult.Full_URL,
      formattedResult.Migration_Issue,
      formattedResult.Created,
    ];

    appendCsvRow(fileName, values, logger);

    logger.info(
      `Successfully wrote result for repository: ${result.Repo_Name}`,
    );
  } catch (error) {
    logger.error(
      `Failed to write CSV for repository ${result.Repo_Name}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    throw error;
  }
}

export function mapToRepoStatsResult(
  repo: RepositoryStats,
  issueStats: IssueStatsResult,
  prStats: PullRequestStatsResult,
): RepoStatsResult {
  const repoSizeMb = convertKbToMb(repo.diskUsage);
  const totalRecordCount = calculateRecordCount(repo, issueStats, prStats);
  const hasMigrationIssues = checkIfHasMigrationIssues({
    repoSizeMb,
    totalRecordCount,
  });

  // Format languages as a semicolon-separated list with percentages
  const languagesStr =
    repo.languages?.edges
      ?.map((edge) => {
        const pct =
          repo.languages.totalSize > 0
            ? ((edge.size / repo.languages.totalSize) * 100).toFixed(1)
            : '0.0';
        return `${edge.node.name}:${pct}%`;
      })
      .join(';') ?? '';

  // Format topics as a semicolon-separated list
  const topicsStr =
    repo.repositoryTopics?.nodes?.map((t) => t.topic.name).join(';') ?? '';

  return {
    Org_Name: repo.owner.login.toLowerCase(),
    Repo_Name: repo.name.toLowerCase(),
    Is_Empty: repo.isEmpty,
    Last_Push: repo.pushedAt,
    Last_Update: repo.updatedAt,
    isFork: repo.isFork,
    isArchived: repo.isArchived,
    isTemplate: repo.isTemplate,
    Visibility: repo.visibility ?? '',
    Repo_Size_mb: repoSizeMb,
    Record_Count: totalRecordCount,
    Collaborator_Count: repo.collaborators.totalCount,
    Protected_Branch_Count: repo.branchProtectionRules.totalCount,
    Ruleset_Count: repo.rulesets.totalCount,
    PR_Review_Count: prStats.prReviewCount,
    PR_Review_Comment_Count: prStats.prReviewCommentCount,
    Commit_Comment_Count: repo.commitComments.totalCount,
    Milestone_Count: repo.milestones.totalCount,
    PR_Count: repo.pullRequests.totalCount,
    Project_Count: repo.projectsV2.totalCount,
    Branch_Count: repo.branches.totalCount,
    Release_Count: repo.releases.totalCount,
    Issue_Count: issueStats.totalIssuesCount,
    Issue_Event_Count: issueStats.issueEventCount + prStats.issueEventCount,
    Issue_Comment_Count:
      issueStats.issueCommentCount + prStats.issueCommentCount,
    Tag_Count: repo.tags.totalCount,
    Discussion_Count: repo.discussions.totalCount,
    Star_Count: repo.stargazerCount ?? 0,
    Fork_Count: repo.forkCount ?? 0,
    Watcher_Count: repo.watchers?.totalCount ?? 0,
    Has_Wiki: repo.hasWikiEnabled,
    Has_LFS: hasLfsTracking(repo.gitattributes?.text),
    Default_Branch: repo.defaultBranchRef?.name ?? '',
    Primary_Language: repo.primaryLanguage?.name ?? '',
    Languages: languagesStr,
    License: repo.licenseInfo?.spdxId || repo.licenseInfo?.name || '',
    Topics: topicsStr,
    Description: repo.description ?? '',
    Homepage_URL: repo.homepageUrl ?? '',
    Auto_Merge_Allowed: repo.autoMergeAllowed ?? false,
    Delete_Branch_On_Merge: repo.deleteBranchOnMerge ?? false,
    Merge_Commit_Allowed: repo.mergeCommitAllowed ?? false,
    Squash_Merge_Allowed: repo.squashMergeAllowed ?? false,
    Rebase_Merge_Allowed: repo.rebaseMergeAllowed ?? false,
    Full_URL: repo.url,
    Migration_Issue: hasMigrationIssues,
    Created: repo.createdAt,
  };
}

function calculateRecordCount(
  repo: RepositoryStats,
  issueStats: IssueStatsResult,
  prStats: PullRequestStatsResult,
): number {
  // Match exactly how the bash script calculates record count (line 918)
  return (
    repo.collaborators.totalCount +
    repo.branchProtectionRules.totalCount +
    prStats.prReviewCount +
    repo.milestones.totalCount +
    issueStats.totalIssuesCount +
    repo.pullRequests.totalCount +
    prStats.prReviewCommentCount +
    repo.commitComments.totalCount +
    issueStats.issueCommentCount +
    prStats.issueCommentCount +
    issueStats.issueEventCount +
    prStats.issueEventCount +
    repo.releases.totalCount +
    repo.projectsV2.totalCount
  );
}

async function analyzeIssues({
  owner,
  repo,
  per_page,
  issues,
  client,
  logger,
}: {
  owner: string;
  repo: string;
  per_page: number;
  issues: IssuesConnection;
  client: OctokitClient;
  logger: Logger;
}): Promise<IssueStatsResult> {
  logger.debug(`Analyzing issues for repository: ${repo}`);

  if (issues.totalCount <= 0) {
    logger.debug(`No issues found for repository: ${repo}`);
    return {
      totalIssuesCount: issues.totalCount,
      issueEventCount: 0,
      issueCommentCount: 0,
    };
  }

  let totalEventCount = 0;
  let totalCommentCount = 0;

  // Process first page
  for (const issue of issues.nodes) {
    const eventCount = issue.timeline.totalCount;
    const commentCount = issue.comments.totalCount;

    // Calculate non-comment events by subtracting comments from total timeline events
    totalEventCount += eventCount - commentCount;
    totalCommentCount += commentCount;
  }

  // Process additional pages if they exist
  if (issues.pageInfo.hasNextPage && issues.pageInfo.endCursor != null) {
    logger.debug(`More pages of issues found for repository: ${repo}`);

    try {
      // Get next page of issues using iterator
      const nextPagesIterator = client.getRepoIssues(
        owner,
        repo,
        per_page,
        issues.pageInfo.endCursor,
      );

      // Process each issue from subsequent pages
      for await (const issue of nextPagesIterator) {
        const eventCount = issue.timeline.totalCount;
        const commentCount = issue.comments.totalCount;

        // Calculate non-comment events by subtracting comments from total timeline events
        totalEventCount += eventCount - commentCount;
        totalCommentCount += commentCount;
      }
    } catch (error) {
      logger.error(
        `Error retrieving additional issues for ${owner}/${repo}. ` +
          `Consider reducing page size. Error: ${error}`,
        error,
      );
      throw error;
    }
  }

  logger.debug(`Gathered all issues from repository: ${repo}`);
  return {
    totalIssuesCount: issues.totalCount,
    issueEventCount: totalEventCount,
    issueCommentCount: totalCommentCount,
  };
}

async function analyzePullRequests({
  owner,
  repo,
  per_page,
  pullRequests,
  client,
  logger,
}: {
  owner: string;
  repo: string;
  per_page: number;
  pullRequests: PullRequestsConnection;
  client: OctokitClient;
  logger: Logger;
}): Promise<PullRequestStatsResult> {
  if (pullRequests.totalCount <= 0) {
    return {
      prReviewCommentCount: 0,
      commitCommentCount: 0,
      issueEventCount: 0,
      issueCommentCount: 0,
      prReviewCount: 0,
    };
  }

  let issueEventCount = 0;
  let issueCommentCount = 0;
  let prReviewCount = 0;
  let prReviewCommentCount = 0;
  let commitCommentCount = 0;

  // Process first page
  for (const pr of pullRequests.nodes) {
    const eventCount = pr.timeline.totalCount;
    const commentCount = pr.comments.totalCount;
    const reviewCount = pr.reviews.totalCount;
    const commitCount = pr.commits.totalCount;

    // This matches how the bash script handles event counts
    // It subtracts comments from timeline events, and handles commit limits
    const redundantEventCount =
      commentCount + (commitCount > 250 ? 250 : commitCount);

    const adjustedEventCount = Math.max(0, eventCount - redundantEventCount);

    issueEventCount += adjustedEventCount;
    issueCommentCount += commentCount;
    prReviewCount += reviewCount;

    // Count review comments by examining each review
    for (const review of pr.reviews.nodes) {
      prReviewCommentCount += review.comments.totalCount;
    }

    commitCommentCount += commitCount;
  }

  // Process additional pages if they exist
  if (
    pullRequests.pageInfo.hasNextPage &&
    pullRequests.pageInfo.endCursor != null
  ) {
    const cursor = pullRequests.pageInfo.endCursor;
    logger.debug(
      `Fetching additional pull requests for ${repo} starting from cursor ${cursor}`,
    );

    for await (const pr of client.getRepoPullRequests(
      owner,
      repo,
      per_page,
      cursor,
    )) {
      const eventCount = pr.timeline.totalCount;
      const commentCount = pr.comments.totalCount;
      const reviewCount = pr.reviews.totalCount;
      const commitCount = pr.commits.totalCount;

      const redundantEventCount =
        commentCount + (commitCount > 250 ? 250 : commitCount);

      const adjustedEventCount = Math.max(0, eventCount - redundantEventCount);

      issueEventCount += adjustedEventCount;
      issueCommentCount += commentCount;
      prReviewCount += reviewCount;

      // Process review comments for additional pages
      for (const review of pr.reviews.nodes) {
        prReviewCommentCount += review.comments.totalCount;
      }

      commitCommentCount += commitCount;
    }
  }

  return {
    prReviewCommentCount,
    commitCommentCount,
    issueEventCount,
    issueCommentCount,
    prReviewCount,
  };
}
