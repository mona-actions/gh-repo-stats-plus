import { hasEmptyParsedRepoList, hasRepoListInput } from './repo-list.js';
import type { Arguments } from './types.js';

export type RepoStatsSourceMode = 'org-name' | 'org-list' | 'repo-list';

export interface RepoStatsSourceModeStatus {
  readonly hasOrgName: boolean;
  readonly hasOrgList: boolean;
  readonly hasRepoList: boolean;
  readonly hasEmptyRepoList: boolean;
  readonly sourceModeCount: number;
  readonly sourceMode?: RepoStatsSourceMode;
}

export function getRepoStatsSourceModeStatus(
  opts: Pick<Arguments, 'orgName' | 'orgList' | 'repoList'>,
): RepoStatsSourceModeStatus {
  const hasOrgName = Boolean(opts.orgName);
  const hasOrgList = Array.isArray(opts.orgList) && opts.orgList.length > 0;
  const hasRepoList = hasRepoListInput(opts.repoList);
  const hasEmptyRepoList = hasEmptyParsedRepoList(opts.repoList);
  const sourceModes: RepoStatsSourceMode[] = [];

  if (hasOrgName) {
    sourceModes.push('org-name');
  }

  if (hasOrgList) {
    sourceModes.push('org-list');
  }

  if (hasRepoList) {
    sourceModes.push('repo-list');
  }

  return {
    hasOrgName,
    hasOrgList,
    hasRepoList,
    hasEmptyRepoList,
    sourceModeCount: sourceModes.length,
    sourceMode: sourceModes.length === 1 ? sourceModes[0] : undefined,
  };
}

export function isStandaloneRepoListSourceMode(
  opts: Pick<Arguments, 'orgName' | 'orgList' | 'repoList'>,
): boolean {
  return getRepoStatsSourceModeStatus(opts).sourceMode === 'repo-list';
}
