import { Logger } from './types.js';
import { isGitHubDotCom } from './url-utils.js';

export class TlsBypassError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TlsBypassError';
  }
}

/**
 * Configures SSL/TLS bypass for GHES connections with self-signed certificates.
 * Sets environment variables that affect Node.js (Octokit), Git, and downstream processes.
 *
 * Must be called **before** creating any Octokit clients or making HTTPS requests.
 *
 * @param baseUrl - The GitHub API base URL (used to guard against disabling TLS for github.com)
 * @param logger - Logger instance for diagnostic output
 * @throws {TlsBypassError} If the base URL resolves to github.com
 */
export function configureSslBypass(baseUrl: string, logger: Logger): void {
  if (isGitHubDotCom(baseUrl)) {
    throw new TlsBypassError(
      'Refusing to disable TLS verification for public github.com. ' +
        "Remove '--skip-tls-verification' or use a GHES base-url.",
    );
  }

  logger.info('Disabling SSL verification for GHES connection');

  // Disable SSL verification for Node.js (Octokit, fetch, etc.)
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  // Disable SSL verification for Git operations
  process.env.GIT_SSL_NO_VERIFY = '1';

  // Suppress Node.js TLS deprecation warnings in downstream processes
  process.env.NODE_NO_WARNINGS = '1';

  logger.info('SSL bypass configured for Node.js and Git');
}
