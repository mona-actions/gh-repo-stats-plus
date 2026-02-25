import { Octokit } from 'octokit';
import { components } from '@octokit/openapi-types';
import {
  AuthResponse,
  IssuesResponse,
  IssueStats,
  OrgRepoNamesResponse,
  ProjectInfo,
  ProjectStatsResult,
  ProjectV2Node,
  PullRequestNode,
  RateLimitCheck,
  RateLimitResponse,
  RateLimitResult,
  RepoProjectCountsResponse,
  RepositoryStats,
  RepoStatsGraphQLResponse,
} from './types.js';
import {
  ORG_REPO_STATS_QUERY,
  ORG_REPO_NAMES_QUERY,
  SINGLE_REPO_STATS_QUERY,
  REPO_ISSUES_QUERY,
  REPO_PULL_REQUESTS_QUERY,
  REPO_PROJECT_COUNTS_QUERY,
} from './queries.js';

type Repository = components['schemas']['repository'];

export class OctokitClient {
  private readonly octokit_headers = {
    'X-GitHub-Api-Version': '2022-11-28',
  };

  constructor(private readonly octokit: Octokit) {}

  async generateAppToken(): Promise<string> {
    const appToken = (await this.octokit.auth({
      type: 'installation',
    })) as AuthResponse;
    process.env.GH_TOKEN = appToken.token;
    return appToken.token;
  }

  async *listReposForOrg(
    org: string,
    per_page: number,
  ): AsyncGenerator<components['schemas']['repository'], void, unknown> {
    const iterator = this.octokit.paginate.iterator(
      this.octokit.rest.repos.listForOrg,
      {
        org,
        type: 'all',
        per_page: per_page,
        page: 1,
        headers: this.octokit_headers,
      },
    );

    for await (const { data: repos } of iterator) {
      for (const repo of repos) {
        yield repo as Repository;
      }
    }
  }

  // all repos in an org
  async *getOrgRepoStats(
    org: string,
    per_page: number,
    cursor: string | null = null,
  ): AsyncGenerator<RepositoryStats, void, unknown> {
    const iterator = this.octokit.graphql.paginate.iterator(
      ORG_REPO_STATS_QUERY,
      {
        login: org,
        pageSize: per_page,
        cursor,
      },
    );

    for await (const response of iterator) {
      const repos = response.organization.repositories.nodes;
      const pageInfo = response.organization.repositories.pageInfo;

      for (const repo of repos) {
        yield { ...repo, pageInfo };
      }
    }
  }

  // individual repo stats
  async getRepoStats(
    owner: string,
    repo: string,
    per_page: number,
  ): Promise<RepositoryStats> {
    const response = await this.octokit.graphql<RepoStatsGraphQLResponse>(
      SINGLE_REPO_STATS_QUERY,
      {
        owner,
        name: repo,
        pageSize: per_page,
      },
    );

    // Create a pageInfo object to maintain consistency with getOrgRepoStats
    const pageInfo = {
      endCursor: null,
      hasNextPage: false,
      startCursor: null,
    };

    return { ...response.repository, pageInfo };
  }

  async *getRepoIssues(
    owner: string,
    repo: string,
    per_page: number,
    cursor: string | null = null,
  ): AsyncGenerator<IssueStats, void, unknown> {
    const iterator = this.octokit.graphql.paginate.iterator<IssuesResponse>(
      REPO_ISSUES_QUERY,
      {
        owner,
        repo,
        pageSize: per_page,
        cursor,
      },
    );

    for await (const response of iterator) {
      const issues = response.repository.issues.nodes;
      for (const issue of issues) {
        yield issue;
      }
    }
  }

  async *getRepoPullRequests(
    owner: string,
    repo: string,
    per_page: number,
    cursor: string | null = null,
  ): AsyncGenerator<PullRequestNode, void, unknown> {
    const iterator = this.octokit.graphql.paginate.iterator(
      REPO_PULL_REQUESTS_QUERY,
      {
        owner,
        repo,
        pageSize: per_page,
        cursor,
      },
    );

    for await (const response of iterator) {
      const prs = response.repository.pullRequests.nodes;
      for (const pr of prs) {
        yield pr;
      }
    }
  }

  /**
   * Lists repository names for an organization using GraphQL.
   * This is a lightweight alternative to listReposForOrg (REST) that only
   * fetches repo name and owner — avoiding REST API rate limits.
   */
  async *listOrgRepoNames(
    org: string,
    per_page: number,
  ): AsyncGenerator<{ name: string; owner: { login: string } }, void, unknown> {
    const iterator =
      this.octokit.graphql.paginate.iterator<OrgRepoNamesResponse>(
        ORG_REPO_NAMES_QUERY,
        {
          login: org,
          pageSize: per_page,
        },
      );

    for await (const response of iterator) {
      const repos = response.organization.repositories.nodes;
      for (const repo of repos) {
        yield repo;
      }
    }
  }

  /**
   * Paginates through all issues in a repository, collecting their linked
   * ProjectsV2 nodes and computing aggregate project counts.
   *
   * Returns a ProjectStatsResult with:
   * - Issues_Linked_To_Projects: number of issues that have at least one linked ProjectV2
   * - Unique_Projects_Linked_By_Issues: count of distinct ProjectV2 items found across all issues
   * - Projects_Linked_To_Repo: total projectsV2.totalCount on the repository
   */
  async getRepoProjectCounts(
    owner: string,
    repo: string,
    per_page: number,
  ): Promise<ProjectStatsResult> {
    const uniqueProjects = new Map<string, ProjectInfo>();
    let issuesLinkedToProjects = 0;
    let projectsLinkedToRepo = 0;

    const iterator =
      this.octokit.graphql.paginate.iterator<RepoProjectCountsResponse>(
        REPO_PROJECT_COUNTS_QUERY,
        {
          owner,
          repo,
          pageSize: per_page,
        },
      );

    let isFirstPage = true;
    for await (const response of iterator) {
      // Capture repo-level project count from the first page
      if (isFirstPage) {
        projectsLinkedToRepo = response.repository.projectsV2?.totalCount ?? 0;
        isFirstPage = false;
      }

      const issues = response.repository.issues.nodes;
      for (const issue of issues) {
        const projects: ProjectV2Node[] = issue.projectsV2?.nodes ?? [];
        if (projects.length > 0) {
          issuesLinkedToProjects++;
        }
        for (const project of projects) {
          const existing = uniqueProjects.get(project.id);
          if (existing) {
            existing.issueCount++;
          } else {
            uniqueProjects.set(project.id, {
              title: project.title,
              issueCount: 1,
            });
          }
        }
      }
    }

    return {
      Org_Name: owner,
      Repo_Name: repo,
      Issues_Linked_To_Projects: issuesLinkedToProjects,
      Unique_Projects_Linked_By_Issues: uniqueProjects.size,
      Projects_Linked_To_Repo: projectsLinkedToRepo,
    };
  }

  async checkRateLimits(
    sleepSeconds = 60,
    maxRetries = 5,
  ): Promise<RateLimitResult> {
    const result: RateLimitResult = {
      apiRemainingRequest: 0,
      apiRemainingMessage: '',
      graphQLRemaining: 0,
      graphQLMessage: '',
      message: '',
      messageType: 'info',
    };

    try {
      let sleepCounter = 0;
      const rateLimitCheck = await this.getRateLimitData();

      if (!rateLimitCheck) {
        throw new Error('Failed to get rate limit data');
      }

      result.graphQLRemaining = rateLimitCheck.graphQLRemaining;
      result.apiRemainingRequest = rateLimitCheck.coreRemaining;

      if (rateLimitCheck.message) {
        result.apiRemainingMessage = rateLimitCheck.message;
        result.graphQLMessage = rateLimitCheck.message;
        result.message = rateLimitCheck.message;
        return result;
      }

      if (rateLimitCheck.graphQLRemaining === 0) {
        sleepCounter++;
        const warningMessage = `We have run out of GraphQL calls and need to sleep! Sleeping for ${sleepSeconds} seconds before next check`;

        if (sleepCounter > maxRetries) {
          result.message = `Exceeded maximum retry attempts of ${maxRetries}`;
          result.messageType = 'error';
          return result;
        }

        result.message = warningMessage;
        result.messageType = 'warning';
        result.graphQLMessage = warningMessage;

        await new Promise((resolve) =>
          setTimeout(resolve, sleepSeconds * 1000),
        );
      } else {
        const message = `Rate limits remaining: ${rateLimitCheck.graphQLRemaining.toLocaleString()} GraphQL points ${rateLimitCheck.coreRemaining.toLocaleString()} REST calls`;
        result.message = message;
        result.messageType = 'info';
        result.graphQLMessage = message;
      }
    } catch (error) {
      result.message =
        error instanceof Error
          ? error.message
          : 'Failed to get valid response back from GitHub API!';
      result.messageType = 'error';
    }

    return result;
  }

  private async getRateLimitData(): Promise<RateLimitCheck | null> {
    const response = await this.octokit.request('GET /rate_limit');
    const rateLimitData = response.data as RateLimitResponse;

    if (rateLimitData.message === 'Rate limiting is not enabled.') {
      return {
        graphQLRemaining: 9999999999,
        coreRemaining: 9999999999,
        message: 'API rate limiting is not enabled.',
      };
    }

    return {
      graphQLRemaining: rateLimitData.resources?.graphql.remaining || 0,
      coreRemaining: rateLimitData.resources?.core.remaining || 0,
      message: '',
    };
  }
}
