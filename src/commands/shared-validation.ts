import type { Arguments } from '../types.js';

/**
 * Validates that exactly one org source is provided (--org-name or --org-list)
 * and that they are not used together.
 */
export function validateOrgSourceOptions(opts: Arguments): void {
  if (!opts.orgName && !opts.orgList) {
    throw new Error(
      'Either orgName (-o, --org-name <org>) or orgList (--org-list <file>) must be provided',
    );
  }

  if (opts.orgName && opts.orgList) {
    throw new Error(
      'Cannot specify both orgName (-o, --org-name <org>) and orgList (--org-list <file>)',
    );
  }
}

/**
 * Validates batch mode options. Checks that batch-size is valid,
 * batch-index is non-negative, and that batch mode is not combined
 * with incompatible source modes.
 */
export function validateBatchOptions(
  opts: Arguments,
  options?: { allowRepoList?: boolean },
): void {
  if (opts.batchSize != null) {
    if (opts.batchSize < 1) {
      throw new Error('--batch-size must be at least 1');
    }

    if (opts.batchIndex != null && opts.batchIndex < 0) {
      throw new Error('--batch-index must be 0 or greater');
    }

    if (opts.orgList) {
      throw new Error(
        'Batch mode (--batch-size) cannot be used with --org-list. Use with a single --org-name instead.',
      );
    }

    if (!options?.allowRepoList && opts.repoList) {
      throw new Error(
        'Batch mode (--batch-size) cannot be used with --repo-list. Batch mode generates its own repo list.',
      );
    }
  }

  if (opts.batchRepoListFile && opts.batchSize == null) {
    throw new Error(
      '--batch-repo-list-file requires --batch-size. Use --repo-list instead if you want to process a flat list of repos without batching.',
    );
  }
}
