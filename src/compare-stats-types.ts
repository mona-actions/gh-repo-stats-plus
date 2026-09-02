export type CompareSeverity = 'blocking' | 'warning' | 'info';

export type CompareStatus = 'matched' | 'missing_in_target' | 'extra_in_target';

export interface CompareFinding {
  Repo_Name: string;
  Source_Org: string;
  Target_Org: string;
  Column: string;
  Source_Value: string;
  Target_Value: string;
  Delta: string;
  Severity: CompareSeverity;
  Status: CompareStatus;
}

export interface CompareSummary {
  sourceRepoCount: number;
  targetRepoCount: number;
  matchedRepoCount: number;
  cleanRepoCount: number;
  reposWithBlockingDiffs: number;
  missingInTargetCount: number;
  extraInTargetCount: number;
  blockingFindingCount: number;
  warningFindingCount: number;
  infoFindingCount: number;
}

export interface CompareResult {
  findings: CompareFinding[];
  summary: CompareSummary;
  matched: MatchedRepo[];
}

export interface MatchedRepo {
  repoName: string;
  sourceOrg: string;
  targetOrg: string;
  source: Record<string, string>;
  target: Record<string, string>;
}

export interface CompareConfig {
  sizeTolerancePct: number;
}

export interface JoinResult {
  matched: MatchedRepo[];
  missingInTarget: Record<string, string>[];
  extraInTarget: Record<string, string>[];
}

export interface CompareStatsOptions {
  sourceFile: string;
  targetFile: string;
  outputDir?: string;
  outputFile?: string;
  failOnBlocking?: boolean;
  sizeTolerancePct?: number;
  verbose?: boolean;
  verifyGit?: boolean;
  sourceOrg?: string;
  targetOrg?: string;
  sourceBaseUrl?: string;
  targetBaseUrl?: string;
  sourceToken?: string;
  targetToken?: string;
  proxyUrl?: string;
  caCertPath?: string;
  apiVersion?: string;
  pageSize?: number;
  rateLimitCheckInterval?: number;
}

export interface CompareStatsRunResult {
  outputPath: string;
  summary: CompareSummary;
}
