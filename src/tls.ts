import * as fs from 'fs';
import { Agent as UndiciAgent } from 'undici';
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
 * Prefer {@link createCaCertDispatcher} when a CA certificate is available — it verifies
 * TLS against a known CA instead of disabling verification globally.
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
  logger.warn(
    'SSL bypass is active (NODE_TLS_REJECT_UNAUTHORIZED=0). ' +
      'Set GHES_CA_CERT_PATH to a PEM certificate file for proper TLS verification.',
  );

  // Disable SSL verification for Node.js (Octokit, fetch, etc.)
  // This is intentional: users explicitly opt in via --skip-tls-verification,
  // and the github.com guard above prevents misuse against public GitHub.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // lgtm[js/disabling-certificate-validation]

  // Suppress Node.js TLS deprecation warnings in downstream processes
  process.env.NODE_NO_WARNINGS = '1';

  logger.info('SSL bypass configured for Node.js');
}

/**
 * Creates an undici Agent configured with a CA certificate for TLS verification
 * against GHES instances that use a private or self-signed CA.
 *
 * This is the **preferred** alternative to {@link configureSslBypass}: it verifies
 * TLS against a known CA rather than disabling all certificate validation globally.
 * The returned Agent is passed as the `dispatcher` when creating Octokit clients.
 *
 * @param caCertPath - Filesystem path to a PEM-encoded CA certificate
 * @param logger - Logger instance for diagnostic output
 * @returns A configured undici Agent, or `undefined` if the cert could not be read
 */
export function createCaCertDispatcher(
  caCertPath: string,
  logger: Logger,
): UndiciAgent | undefined {
  try {
    const ca = fs.readFileSync(caCertPath, 'utf8');
    logger.info(`Using CA certificate for TLS verification`);
    return new UndiciAgent({ connect: { ca } });
  } catch (err) {
    logger.warn(
      `Failed to read CA certificate from path '${caCertPath}': ${(err as Error).message}. ` +
        'Falling back to SSL bypass.',
    );
    return undefined;
  }
}

/**
 * Resolves the TLS dispatcher for a GHES connection, preferring CA cert-based
 * verification over a global SSL bypass.
 *
 * Resolution order:
 * 1. Explicit `caCertPath` argument
 * 2. `GHES_CA_CERT_PATH` environment variable
 * 3. Global SSL bypass via `configureSslBypass()` (when `skipTlsVerification` is true)
 *
 * Returns an undici Agent when a cert is successfully loaded (use as Octokit
 * `request.fetch` dispatcher). Returns `undefined` when the SSL bypass path is
 * taken or when neither cert nor bypass is requested.
 *
 * @param baseUrl - The GitHub API base URL (guards against disabling TLS for github.com)
 * @param skipTlsVerification - Whether the caller explicitly requested SSL bypass
 * @param logger - Logger instance for diagnostic output
 * @param caCertPath - Optional explicit path to a PEM CA certificate
 */
export function resolveTlsDispatcher(
  baseUrl: string,
  skipTlsVerification: boolean,
  logger: Logger,
  caCertPath?: string,
): UndiciAgent | undefined {
  const certPath = caCertPath ?? process.env['GHES_CA_CERT_PATH'] ?? '';

  if (certPath && !isGitHubDotCom(baseUrl)) {
    const dispatcher = createCaCertDispatcher(certPath, logger);
    if (dispatcher) return dispatcher;
    // cert read failed — fall through to bypass if requested
  }

  if (skipTlsVerification) {
    configureSslBypass(baseUrl, logger);
  }

  return undefined;
}
