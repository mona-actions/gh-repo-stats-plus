/**
 * Shared GraphQL query fragments and constants for GitHub repository statistics.
 *
 * Both getOrgRepoStats and getRepoStats use the same set of repository fields.
 * This file centralizes those field definitions to keep them DRY and makes it
 * easy to add or remove fields in one place.
 */

/**
 * Common repository fields shared by both org-level and single-repo queries.
 * Includes a first page of issues and pull requests (with nested reviews)
 * so the caller can process the initial page inline and then deep-paginate
 * the remainder via getRepoIssues / getRepoPullRequests.
 *
 * Requires $pageSize variable to be defined in the enclosing query.
 */
const REPO_STATS_FIELDS = `
  autoMergeAllowed
  branches: refs(refPrefix: "refs/heads/") {
    totalCount
  }
  branchProtectionRules {
    totalCount
  }
  commitComments {
    totalCount
  }
  collaborators {
    totalCount
  }
  createdAt
  defaultBranchRef {
    name
  }
  deleteBranchOnMerge
  description
  diskUsage
  discussions {
    totalCount
  }
  forkCount
  hasWikiEnabled
  homepageUrl
  isEmpty
  isArchived
  isFork
  isTemplate
  issues(first: $pageSize) {
    totalCount
    pageInfo {
      endCursor
      hasNextPage
    }
    nodes {
      timeline {
        totalCount
      }
      comments {
        totalCount
      }
    }
  }
  languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
    totalCount
    totalSize
    edges {
      size
      node {
        name
        color
      }
    }
  }
  licenseInfo {
    name
    spdxId
  }
  mergeCommitAllowed
  milestones {
    totalCount
  }
  name
  owner {
    login
  }
  primaryLanguage {
    name
  }
  projectsV2 {
    totalCount
  }
  pullRequests(first: $pageSize) {
    totalCount
    pageInfo {
      endCursor
      hasNextPage
    }
    nodes {
      comments {
        totalCount
      }
      commits {
        totalCount
      }
      number
      reviews(first: $pageSize) {
        totalCount
        pageInfo {
          endCursor
          hasNextPage
        }
        nodes {
          comments {
            totalCount
          }
        }
      }
      timeline {
        totalCount
      }
    }
  }
  pushedAt
  rebaseMergeAllowed
  releases {
    totalCount
  }
  repositoryTopics(first: 20) {
    totalCount
    nodes {
      topic {
        name
      }
    }
  }
  squashMergeAllowed
  stargazerCount
  tags: refs(refPrefix: "refs/tags/") {
    totalCount
  }
  updatedAt
  url
  visibility
  watchers {
    totalCount
  }
`;

/**
 * Query for fetching repository stats across all repos in an organization.
 * Paginates through repositories using cursor-based pagination.
 */
export const ORG_REPO_STATS_QUERY = `
  query orgRepoStats($login: String!, $pageSize: Int!, $cursor: String) {
    organization(login: $login) {
      repositories(first: $pageSize, after: $cursor, orderBy: { field: NAME, direction: ASC }) {
        pageInfo {
          endCursor
          hasNextPage
          startCursor
        }
        nodes {
          ${REPO_STATS_FIELDS}
        }
      }
    }
  }
`;

/**
 * Query for fetching stats for a single repository by owner and name.
 */
export const SINGLE_REPO_STATS_QUERY = `
  query repoStats($owner: String!, $name: String!, $pageSize: Int!) {
    repository(owner: $owner, name: $name) {
      ${REPO_STATS_FIELDS}
    }
  }
`;

/**
 * Deep pagination query for repository issues.
 * Used to fetch additional issue pages beyond the first page
 * returned by the main repo stats query.
 */
export const REPO_ISSUES_QUERY = `
  query repoIssues($owner: String!, $repo: String!, $pageSize: Int!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      issues(first: $pageSize, after: $cursor) {
        pageInfo {
          endCursor
          hasNextPage
        }
        nodes {
          timeline {
            totalCount
          }
          comments {
            totalCount
          }
        }
      }
    }
  }
`;

/**
 * Deep pagination query for repository pull requests.
 * Used to fetch additional PR pages beyond the first page
 * returned by the main repo stats query.
 */
export const REPO_PULL_REQUESTS_QUERY = `
  query repoPullRequests($owner: String!, $repo: String!, $pageSize: Int!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      pullRequests(first: $pageSize, after: $cursor) {
        pageInfo {
          endCursor
          hasNextPage
        }
        nodes {
          number
          timeline {
            totalCount
          }
          comments {
            totalCount
          }
          commits {
            totalCount
          }
          reviews(first: $pageSize) {
            totalCount
            nodes {
              comments {
                totalCount
              }
            }
          }
        }
      }
    }
  }
`;
