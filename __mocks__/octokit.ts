import { vi } from 'vitest';

export const graphql = vi.fn();
// @ts-expect-error The graphql function is mocked, so we can ignore type errors
graphql.paginate = vi.fn();
// @ts-expect-error The graphql function is mocked, so we can ignore type errors
graphql.paginate.iterator = vi.fn();

export const log = {
  warn: vi.fn(),
  info: vi.fn(),
};
export const paginate = vi.fn();
export const request = vi.fn();
export const rest = {
  actions: {
    createOrgVariable: vi.fn(),
  },
  issues: {
    createComment: vi.fn(),
  },
  migrations: {
    startForOrg: vi.fn(),
    getStatusForOrg: vi.fn(),
    downloadArchiveForOrg: vi.fn(),
  },
  orgs: {
    get: vi.fn(),
  },
  repos: {
    createOrUpdateCustomPropertiesValues: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
    getCustomPropertiesValues: vi.fn(),
    getRepoRuleset: vi.fn(),
    removeCollaborator: vi.fn(),
    addCollaborator: vi.fn(),
    listCollaborators: vi.fn(),
    listForOrg: vi.fn(),
  },
  secretScanning: {
    listAlertsForRepo: vi.fn(),
  },
  packages: {
    getPackageForOrganization: vi.fn(),
    deletePackageForOrg: vi.fn(),
  },
};

export const Octokit = vi.fn().mockImplementation(function () {
  return {
    auth: vi.fn(),
    graphql,
    paginate: {
      iterator: vi.fn(),
    },
    request,
    rest,
  };
});

export default {
  Octokit,
  graphql,
  log,
  paginate,
  request,
  rest,
};
