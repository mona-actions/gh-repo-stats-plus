// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LoggerFn = (message: string, meta?: any) => unknown;
export interface Logger {
  debug: LoggerFn;
  info: LoggerFn;
  warn: LoggerFn;
  error: LoggerFn;
}

export interface Arguments {
  // context
  orgName: string | undefined;
  orgList: string[];

  // octokit
  baseUrl: string;
  proxyUrl: string | undefined;
  pageSize?: number;
  extraPageSize?: number;

  // logging
  verbose: boolean;

  // auth
  accessToken?: string;
  appId?: string | undefined;
  privateKey?: string | undefined;
  privateKeyFile?: string | undefined;
  appInstallationId?: string | undefined;

  // rate limit check
  rateLimitCheckInterval?: number;

  // retry - exponential backoff
  retryMaxAttempts?: number;
  retryInitialDelay?: number;
  retryMaxDelay?: number;
  retryBackoffFactor?: number;
  retrySuccessThreshold?: number;

  resumeFromLastSave?: boolean;
  forceFreshStart?: boolean;

  // output
  outputFileName?: string;
  outputDir?: string;

  // state management
  cleanState?: boolean;

  repoList: string[] | string | undefined;
  autoProcessMissing?: boolean;

  // multi-org options
  delayBetweenOrgs?: number;
  continueOnError?: boolean;
}

export type AuthResponse = {
  type: string;
  token: string;
  tokenType?: string;
};

export interface ProcessingSummary {
  initiallyProcessed: number;
  totalRetried: number;
  totalSuccess: number;
  totalFailures: number;
  remainingUnprocessed: number;
  totalAttempts: number;
}

export interface ProcessingResult {
  successCount: number;
  failureCount: number;
  filesToRetry: string[];
}

export interface IdentifyFailedReposResult {
  unprocessedRepos: string[];
  processedRepos: string[];
  totalRepos: number;
  countMatches: boolean;
}

export interface PageInfo {
  endCursor: string | null;
  hasNextPage: boolean;
}

export interface TotalCount {
  totalCount: number;
}

export interface TimelineItem {
  timeline: TotalCount;
  comments: TotalCount;
}

export interface IssuesConnection {
  totalCount: number;
  pageInfo: PageInfo;
  nodes: TimelineItem[];
}

export interface PullRequestReview {
  comments: TotalCount;
}

export interface PullRequestNode {
  comments: TotalCount;
  commits: TotalCount;
  number: number;
  reviews: {
    totalCount: number;
    pageInfo: PageInfo;
    nodes: PullRequestReview[];
  };
  timeline: TotalCount;
}

export interface PullRequestsConnection {
  totalCount: number;
  pageInfo: PageInfo;
  nodes: PullRequestNode[];
}

export interface RepositoryOwner {
  login: string;
}

export interface LanguageNode {
  name: string;
  color: string;
}

export interface LanguageEdge {
  size: number;
  node: LanguageNode;
}

export interface LanguageInfo {
  totalCount: number;
  totalSize: number;
  edges: LanguageEdge[];
}

export interface LicenseInfo {
  name: string;
  spdxId: string;
}

export interface RepositoryTopic {
  topic: {
    name: string;
  };
}

export interface RepositoryTopicsConnection {
  totalCount: number;
  nodes: RepositoryTopic[];
}

export interface RepositoryStats {
  pageInfo: PageInfo;
  autoMergeAllowed: boolean;
  branches: TotalCount;
  branchProtectionRules: TotalCount;
  commitComments: TotalCount;
  collaborators: TotalCount;
  createdAt: string;
  defaultBranchRef: { name: string } | null;
  deleteBranchOnMerge: boolean;
  description: string | null;
  diskUsage: number;
  discussions: TotalCount;
  forkCount: number;
  hasWikiEnabled: boolean;
  homepageUrl: string | null;
  isEmpty: boolean;
  isArchived: boolean;
  isFork: boolean;
  isTemplate: boolean;
  issues: IssuesConnection;
  languages: LanguageInfo;
  licenseInfo: LicenseInfo | null;
  mergeCommitAllowed: boolean;
  milestones: TotalCount;
  name: string;
  owner: RepositoryOwner;
  primaryLanguage: { name: string } | null;
  projectsV2: TotalCount;
  pullRequests: PullRequestsConnection;
  pushedAt: string;
  rebaseMergeAllowed: boolean;
  releases: TotalCount;
  repositoryTopics: RepositoryTopicsConnection;
  squashMergeAllowed: boolean;
  stargazerCount: number;
  tags: TotalCount;
  updatedAt: string;
  url: string;
  visibility: string;
  watchers: TotalCount;
}

export interface RepoStatsGraphQLResponse {
  repository: Omit<RepositoryStats, 'pageInfo'>;
}

export interface IssueStats {
  totalCount: number;
  timeline: {
    totalCount: number;
  };
  comments: {
    totalCount: number;
  };
}

export interface IssuesResponse {
  repository: {
    issues: {
      pageInfo: {
        endCursor: string;
        hasNextPage: boolean;
      };
      nodes: IssueStats[];
    };
  };
}

export interface PullRequestResponse {
  repository: {
    pullRequests: {
      pageInfo: {
        endCursor: string;
        hasNextPage: boolean;
      };
      nodes: PullRequestNode[];
    };
  };
}

export interface IssueStatsResult {
  totalIssuesCount: number;
  issueEventCount: number;
  issueCommentCount: number;
}

export interface PullRequestStatsResult {
  prReviewCommentCount: number;
  commitCommentCount: number;
  issueEventCount: number;
  issueCommentCount: number;
  prReviewCount: number;
}

export interface RepoStatsResult {
  Org_Name: string;
  Repo_Name: string;
  Is_Empty: boolean;
  Last_Push: string;
  Last_Update: string;
  isFork: boolean;
  isArchived: boolean;
  isTemplate: boolean;
  Visibility: string;
  Repo_Size_mb: number;
  Record_Count: number;
  Collaborator_Count: number;
  Protected_Branch_Count: number;
  PR_Review_Count: number;
  Milestone_Count: number;
  Issue_Count: number;
  PR_Count: number;
  PR_Review_Comment_Count: number;
  Commit_Comment_Count: number;
  Issue_Comment_Count: number;
  Issue_Event_Count: number;
  Release_Count: number;
  Project_Count: number;
  Branch_Count: number;
  Tag_Count: number;
  Discussion_Count: number;
  Star_Count: number;
  Fork_Count: number;
  Watcher_Count: number;
  Has_Wiki: boolean;
  Default_Branch: string;
  Primary_Language: string;
  Languages: string;
  License: string;
  Topics: string;
  Description: string;
  Homepage_URL: string;
  Auto_Merge_Allowed: boolean;
  Delete_Branch_On_Merge: boolean;
  Merge_Commit_Allowed: boolean;
  Squash_Merge_Allowed: boolean;
  Rebase_Merge_Allowed: boolean;
  Full_URL: string;
  Migration_Issue: boolean;
  Created: string;
}

export interface RateLimitCheck {
  graphQLRemaining: number;
  coreRemaining: number;
  message: string;
}

export interface RateLimitResponse {
  message?: string;
  resources?: {
    graphql: {
      remaining: number;
    };
    core: {
      remaining: number;
    };
  };
}

export interface RateLimitResult {
  apiRemainingRequest: number;
  apiRemainingMessage: string;
  graphQLRemaining: number;
  graphQLMessage: string;
  message: string;
  messageType: 'error' | 'info' | 'warning';
}

export interface RetryState {
  attempt: number;
  successCount: number;
  retryCount: number;
  lastProcessedRepo?: string | null;
  error?: Error;
}

export interface RetryableOperation<T> {
  execute: () => Promise<T>;
  onRetry?: (state: RetryState) => void;
  onSuccess?: (result: T) => void;
  shouldRetry?: (error: Error) => boolean;
}

// Organization processing status
export type OrgStatus = 'pending' | 'in-progress' | 'completed' | 'failed';

// Reference to an org's state file in session
export interface OrgReference {
  stateFile: string; // filename only, assumes same directory
  status: OrgStatus;
  outputFile: string | null;
  startTime: string | null;
  endTime: string | null;
  reposProcessed: number;
  error: string | null;
}

// Session state for multi-org processing
export interface SessionState {
  version: string;
  sessionId: string;
  mode: 'multi-org';
  sessionStartTime: string;
  orgList: string[];
  currentOrgIndex: number;
  settings: {
    delayBetweenOrgs: number;
    continueOnError: boolean;
    outputDir: string;
  };
  orgReferences: Record<string, OrgReference>; // key = org name
  lastUpdated: string;
}

export interface ProcessedPageState {
  organizationName: string;
  completedSuccessfully: boolean;
  outputFileName: string | null;
  currentCursor: string | null;
  lastSuccessfulCursor: string | null;
  lastProcessedRepo: string | null;
  lastUpdated: string | null;
  processedRepos: string[];
}

export interface RepoProcessingResult {
  cursor: string | null;
  processedRepos: string[];
  processedCount: number;
  isComplete: boolean;
  successCount: number;
  retryCount: number;
}

export interface OrgProcessingResult {
  orgName: string;
  success: boolean;
  error?: string;
  startTime?: Date;
  endTime?: Date;
  elapsedTime?: string;
  reposProcessed?: number;
}
