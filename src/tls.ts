import { readFileSync } from 'fs';
import { Logger } from './types.js';

/**
 * Loads a CA certificate bundle (PEM format) for custom TLS verification.
 *
 * Resolution order:
 * 1. Explicit path from `--ca-cert` CLI option
 * 2. `NODE_EXTRA_CA_CERTS` environment variable
 *
 * @param caCertPath - Optional path to a PEM-encoded CA certificate file
 * @param logger - Logger instance for diagnostic messages
 * @returns The PEM content as a string, or undefined if no CA cert is configured
 * @throws Error if the specified file cannot be read
 */
export const loadCaCertificate = (
  caCertPath: string | undefined,
  logger: Logger,
): string | undefined => {
  const resolvedPath = caCertPath || process.env.NODE_EXTRA_CA_CERTS;

  if (!resolvedPath) {
    return undefined;
  }

  const source = caCertPath ? '--ca-cert' : 'NODE_EXTRA_CA_CERTS';

  try {
    const cert = readFileSync(resolvedPath, 'utf-8');
    logger.info(`Loaded CA certificate from ${source}: ${resolvedPath}`);
    return cert;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unknown error reading file';
    throw new Error(
      `Failed to read CA certificate from ${source} (${resolvedPath}): ${message}`,
      { cause: err },
    );
  }
};
