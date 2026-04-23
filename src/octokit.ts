import {
  fetch as undiciFetch,
  Agent,
  ProxyAgent,
  RequestInfo as undiciRequestInfo,
  RequestInit as undiciRequestInit,
} from 'undici';
import { Octokit, RequestError } from 'octokit';
import { paginateGraphQL } from '@octokit/plugin-paginate-graphql';
import { throttling } from '@octokit/plugin-throttling';
import { Logger, LoggerFn } from './types.js';
import { AuthConfig } from './auth.js';

const OctokitWithPlugins = Octokit.plugin(paginateGraphQL).plugin(throttling);

interface OnRateLimitOptions {
  method: string;
  url: string;
}

/**
 * Builds a undici Dispatcher configured for the given proxy and/or CA
 * certificate.  Returns `undefined` when neither is needed (default
 * Node.js behaviour).
 */
const buildDispatcher = (
  proxyUrl: string | undefined,
  caCert: string | undefined,
): Agent | ProxyAgent | undefined => {
  if (proxyUrl && caCert) {
    return new ProxyAgent({ uri: proxyUrl, requestTls: { ca: caCert } });
  }
  if (proxyUrl) {
    return new ProxyAgent(proxyUrl);
  }
  if (caCert) {
    return new Agent({ connect: { ca: caCert } });
  }
  return undefined;
};

export interface CreateOctokitOptions {
  fetch?: any;
  caCert?: string;
}

export const createOctokit = (
  authConfig: AuthConfig,
  baseUrl: string,
  proxyUrl: string | undefined,
  logger: Logger,
  options?: CreateOctokitOptions,
): Octokit => {
  const { fetch, caCert } = options ?? {};
  const dispatcher = buildDispatcher(proxyUrl, caCert);

  const customFetch = (url: undiciRequestInfo, opts: undiciRequestInit) => {
    return undiciFetch(url, {
      ...opts,
      dispatcher,
    });
  };

  const wrappedWarn: LoggerFn = (message: string, meta: unknown) => {
    try {
      // Find and parse all URLs in the message, if present
      const urlRegex = /https?:\/\/[^\s'")]+/g;
      const matches = message.match(urlRegex);
      if (matches) {
        for (const urlStr of matches) {
          try {
            const parsed = new URL(urlStr);
            if (
              parsed.hostname === 'gh.io' &&
              parsed.pathname === '/tag-protection-sunset'
            ) {
              return;
            }
          } catch {
            // Ignore parse errors for individual URLs
          }
        }
      }
    } catch {
      // Ignore parse errors, fall through to warn
    }
    logger.warn(message, meta);
  };

  const octokit = new OctokitWithPlugins({
    auth: authConfig.auth,
    authStrategy: authConfig.authStrategy,
    baseUrl,
    request: {
      fetch: fetch || customFetch,
      log: { ...logger, warn: wrappedWarn },
    },
    retry: {
      enabled: false,
    },
    throttle: {
      onRateLimit: (retryAfter: any, options: any) => {
        const { method, url } = options as OnRateLimitOptions;

        logger.warn(
          `Primary rate limit exceeded for request \`${method} ${url}\` - retrying after ${retryAfter} seconds`,
        );

        return true;
      },
      onSecondaryRateLimit: (retryAfter: any, options: any) => {
        const { method, url } = options as OnRateLimitOptions;

        logger.warn(
          `Secondary rate limit exceeded for request \`${method} ${url}\` - retrying after ${retryAfter} seconds`,
        );

        return true;
      },
    },
  });

  octokit.hook.after('request', async (response: any, options: any) => {
    logger.debug(`${options.method} ${options.url}: ${response.status}`);
  });

  octokit.hook.error('request', async (error: any, options: any) => {
    if (error instanceof RequestError) {
      logger.debug(
        `${options.method} ${options.url}: ${error.status} - ${error.message}`,
      );
    } else {
      logger.debug(
        `${options.method} ${options.url}: ${error.name} - ${error.message}`,
      );
    }

    throw error;
  });

  return octokit;
};
