#!/usr/bin/env node
import { config } from 'dotenv';
import * as commander from 'commander';
import { fetch, ProxyAgent } from 'undici';
import { Octokit, RequestError } from 'octokit';
import { paginateGraphQL } from '@octokit/plugin-paginate-graphql';
import { throttling } from '@octokit/plugin-throttling';
import * as winston from 'winston';
import * as path from 'path';
import { mkdir } from 'fs/promises';
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { createAppAuth } from '@octokit/auth-app';
import { parse } from 'csv-parse/sync';

var VERSION = process.env.NPM_PACKAGE_VERSION ?? '0.0.1-development';

function generateRepoStatsFileName(orgName) {
    const timestamp = new Date()
        .toISOString()
        .replace(/[-:T\.Z]/g, '')
        .slice(0, 12);
    return `${orgName.toLowerCase()}-all_repos-${timestamp}_ts.csv`;
}
/**
 * Converts kilobytes to megabytes
 * @param kb Size in kilobytes, can be null or undefined
 * @returns Size in megabytes
 */
function convertKbToMb(kb) {
    if (kb == null) {
        return 0;
    }
    return kb / 1024;
}
function checkIfHasMigrationIssues({ repoSizeMb, totalRecordCount, }) {
    if (totalRecordCount >= 60000) {
        return true;
    }
    if (repoSizeMb > 1500) {
        return true;
    }
    return false;
}
function parseIntOption(value, defaultValue) {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
        if (defaultValue !== undefined) {
            return defaultValue;
        }
        throw new Error(`Invalid number: ${value}`);
    }
    return parsed;
}
function parseFloatOption(value, defaultValue) {
    const parsed = parseFloat(value);
    if (isNaN(parsed)) {
        if (defaultValue !== undefined) {
            return defaultValue;
        }
        throw new Error(`Invalid number: ${value}`);
    }
    return parsed;
}
function formatElapsedTime(startTime, endTime) {
    const elapsed = endTime.getTime() - startTime.getTime();
    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
}

class OctokitClient {
    octokit;
    octokit_headers = {
        'X-GitHub-Api-Version': '2022-11-28',
    };
    constructor(octokit) {
        this.octokit = octokit;
    }
    async generateAppToken() {
        const appToken = (await this.octokit.auth({
            type: 'installation',
        }));
        process.env.GH_TOKEN = appToken.token;
        return appToken.token;
    }
    async *listReposForOrg(org, per_page) {
        const iterator = this.octokit.paginate.iterator(this.octokit.rest.repos.listForOrg, {
            org,
            type: 'all',
            per_page: per_page,
            page: 1,
            headers: this.octokit_headers,
        });
        for await (const { data: repos } of iterator) {
            for (const repo of repos) {
                yield repo;
            }
        }
    }
    // all repos in an org
    async *getOrgRepoStats(org, per_page, cursor = null) {
        const query = `
      query orgRepoStats($login: String!, $pageSize: Int!, $cursor: String) {
        organization(login: $login) {
          repositories(first: $pageSize, after: $cursor, orderBy: {field: NAME, direction: ASC}) {
            pageInfo {
              endCursor
              hasNextPage
              startCursor
            }
            nodes {
              branches: refs(refPrefix:"refs/heads/") {
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
              diskUsage
              discussions {
                totalCount
              }
              hasWikiEnabled
              isFork
              isArchived
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
              milestones {
                totalCount
              }
              name
              owner {
                login
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
              releases {
                totalCount
              }
              tags: refs(refPrefix: "refs/tags/") {
                totalCount
              }
              updatedAt
              url
            }
          }
        }
      }`;
        const iterator = this.octokit.graphql.paginate.iterator(query, {
            login: org,
            pageSize: per_page,
            cursor,
        });
        for await (const response of iterator) {
            const repos = response.organization.repositories.nodes;
            const pageInfo = response.organization.repositories.pageInfo;
            for (const repo of repos) {
                yield { ...repo, pageInfo };
            }
        }
    }
    // individual repo stats
    async getRepoStats(owner, repo, per_page) {
        const query = `
      query repoStats($owner: String!, $name: String!, $pageSize: Int!) {
        repository(owner: $owner, name: $name) {
          branches: refs(refPrefix:"refs/heads/") {
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
          diskUsage
          discussions {
            totalCount
          }
          hasWikiEnabled
          isFork
          isArchived
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
          milestones {
            totalCount
          }
          name
          owner {
            login
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
          releases {
            totalCount
          }
          tags: refs(refPrefix: "refs/tags/") {
            totalCount
          }
          updatedAt
          url
        }
      }`;
        const response = await this.octokit.graphql(query, {
            owner,
            name: repo,
            pageSize: per_page,
        });
        // Create a pageInfo object to maintain consistency with getOrgRepoStats
        const pageInfo = {
            endCursor: null,
            hasNextPage: false,
            startCursor: null,
        };
        return { ...response.repository, pageInfo };
    }
    async *getRepoIssues(owner, repo, per_page, cursor = null) {
        const query = `
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
      }`;
        const iterator = this.octokit.graphql.paginate.iterator(query, {
            owner,
            repo,
            pageSize: per_page,
            cursor,
        });
        for await (const response of iterator) {
            const issues = response.repository.issues.nodes;
            for (const issue of issues) {
                yield issue;
            }
        }
    }
    async *getRepoPullRequests(owner, repo, per_page, cursor = null) {
        const query = `
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
      }`;
        const iterator = this.octokit.graphql.paginate.iterator(query, {
            owner,
            repo,
            pageSize: per_page,
            cursor,
        });
        for await (const response of iterator) {
            const prs = response.repository.pullRequests.nodes;
            for (const pr of prs) {
                yield pr;
            }
        }
    }
    async checkRateLimits(sleepSeconds = 60, maxRetries = 5) {
        const result = {
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
                await new Promise((resolve) => setTimeout(resolve, sleepSeconds * 1000));
            }
            else {
                const message = `Rate limits remaining: ${rateLimitCheck.graphQLRemaining.toLocaleString()} GraphQL points ${rateLimitCheck.coreRemaining.toLocaleString()} REST calls`;
                result.message = message;
                result.messageType = 'info';
                result.graphQLMessage = message;
            }
        }
        catch (error) {
            result.message =
                error instanceof Error
                    ? error.message
                    : 'Failed to get valid response back from GitHub API!';
            result.messageType = 'error';
        }
        return result;
    }
    async getRateLimitData() {
        const response = await this.octokit.request('GET /rate_limit');
        const rateLimitData = response.data;
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

const OctokitWithPlugins = Octokit.plugin(paginateGraphQL).plugin(throttling);
const createOctokit = (authConfig, baseUrl, proxyUrl, logger, fetch$1) => {
    const customFetch = (url, options) => {
        return fetch(url, {
            ...options,
            dispatcher: proxyUrl ? new ProxyAgent(proxyUrl) : undefined,
        });
    };
    const wrappedWarn = (message, meta) => {
        if (message.includes('https://gh.io/tag-protection-sunset'))
            return;
        logger.warn(message, meta);
    };
    const octokit = new OctokitWithPlugins({
        auth: authConfig.auth,
        authStrategy: authConfig.authStrategy,
        baseUrl,
        request: {
            fetch: customFetch,
            log: { ...logger, warn: wrappedWarn },
        },
        retry: {
            enabled: false,
        },
        throttle: {
            onRateLimit: (retryAfter, options) => {
                const { method, url } = options;
                logger.warn(`Primary rate limit exceeded for request \`${method} ${url}\` - retrying after ${retryAfter} seconds`);
                return true;
            },
            onSecondaryRateLimit: (retryAfter, options) => {
                const { method, url } = options;
                logger.warn(`Secondary rate limit exceeded for request \`${method} ${url}\` - retrying after ${retryAfter} seconds`);
                return true;
            },
        },
    });
    octokit.hook.after('request', async (response, options) => {
        logger.debug(`${options.method} ${options.url}: ${response.status}`);
    });
    octokit.hook.error('request', async (error, options) => {
        if (error instanceof RequestError) {
            logger.debug(`${options.method} ${options.url}: ${error.status} - ${error.message}`);
        }
        else {
            logger.debug(`${options.method} ${options.url}: ${error.name} - ${error.message}`);
        }
        throw error;
    });
    return octokit;
};

const { combine, timestamp, printf, colorize } = winston.format;
const format = printf(({ level, message, timestamp, owner, repo }) => {
    if (owner && repo) {
        return `${timestamp} ${level} [${owner}/${repo}]: ${message}`;
    }
    else {
        return `${timestamp} ${level}: ${message}`;
    }
});
const generateLoggerOptions = async (verbose, logFileName) => {
    // Use absolute path for logs directory
    const logsDir = path.resolve(process.cwd(), 'logs');
    try {
        // Create logs directory if it doesn't exist
        if (!existsSync(logsDir)) {
            await mkdir(logsDir, { recursive: true });
        }
        const defaultLogName = `repo-stats-${new Date().toISOString().split('T')[0]}.log`;
        const logFile = path.resolve(logsDir, logFileName ?? defaultLogName);
        console.debug(`Initializing logger with file: ${logFile}`); // Debug output
        const commonFormat = combine(timestamp(), format);
        return {
            level: verbose ? 'debug' : 'info',
            format: commonFormat,
            transports: [
                new winston.transports.Console({
                    format: combine(colorize(), commonFormat),
                }),
                new winston.transports.File({
                    filename: logFile,
                    format: commonFormat,
                    options: { flags: 'a' }, // Append mode
                }),
            ],
            exitOnError: false,
        };
    }
    catch (error) {
        console.error(`Failed to setup logger: ${error}`);
        throw error;
    }
};
const createLogger = async (verbose, logFileName) => {
    const options = await generateLoggerOptions(verbose, logFileName);
    const logger = winston.createLogger(options);
    // Add error handler
    logger.on('error', (error) => {
        console.error('Logger error:', error);
    });
    return logger;
};
const logInitialization = {
    start: (logger) => {
        logger.info('Initializing repo-stats-queue application...');
    },
    auth: (logger) => {
        logger.debug('Creating auth config...');
    },
    octokit: (logger) => {
        logger.debug('Initializing octokit client...');
    },
    token: (logger) => {
        logger.debug('Generating app token...');
    },
    directories: (logger) => {
        logger.debug('Setting up output directories...');
    },
};

const getAuthAppId = (appId) => {
    const authAppId = appId || process.env.GITHUB_APP_ID;
    if (!authAppId || isNaN(parseInt(authAppId))) {
        throw new Error('You must specify a GitHub app ID using the --app-id argument or GITHUB_APP_ID environment variable.');
    }
    return parseInt(authAppId);
};
const getAuthPrivateKey = (privateKey, privateKeyFile) => {
    let authPrivateKey;
    if (privateKeyFile || process.env.GITHUB_APP_PRIVATE_KEY_FILE) {
        const filePath = privateKeyFile || process.env.GITHUB_APP_PRIVATE_KEY_FILE;
        authPrivateKey = filePath ? readFileSync(filePath, 'utf-8') : undefined;
    }
    else if (privateKey || process.env.GITHUB_APP_PRIVATE_KEY) {
        authPrivateKey = privateKey || process.env.GITHUB_APP_PRIVATE_KEY;
    }
    if (!authPrivateKey) {
        throw new Error('You must specify a GitHub app private key using the --private-key argument, --private-key-file argument, GITHUB_APP_PRIVATE_KEY_FILE environment variable, or GITHUB_APP_PRIVATE_KEY environment variable.');
    }
    return authPrivateKey;
};
const getAuthInstallationId = (appInstallationId) => {
    const authInstallationId = appInstallationId || process.env.GITHUB_APP_INSTALLATION_ID;
    if (!authInstallationId || isNaN(parseInt(authInstallationId))) {
        throw new Error('You must specify a GitHub app installation ID using the --app-installation-id argument or GITHUB_APP_INSTALLATION_ID environment variable.');
    }
    return parseInt(authInstallationId);
};
const getTokenAuthConfig = (accessToken) => {
    const authToken = accessToken || process.env.GITHUB_TOKEN;
    if (!authToken) {
        throw new Error('You must specify a GitHub access token using the --access-token argument or GITHUB_TOKEN environment variable.');
    }
    return { authStrategy: undefined, auth: authToken };
};
const getInstallationAuthConfig = (appId, privateKey, privateKeyFile, appInstallationId) => {
    const auth = {
        type: 'installation',
        appId: getAuthAppId(appId),
        privateKey: getAuthPrivateKey(privateKey, privateKeyFile),
        installationId: getAuthInstallationId(appInstallationId),
    };
    return { authStrategy: createAppAuth, auth };
};
const createAuthConfig = ({ accessToken, appId, privateKey, privateKeyFile, appInstallationId, logger, }) => {
    try {
        if (appInstallationId || process.env.GITHUB_APP_INSTALLATION_ID) {
            logger.info('GitHub App installation ID detected. Authenticating using GitHub App installation...');
            return getInstallationAuthConfig(appId, privateKey, privateKeyFile, appInstallationId);
        }
        else {
            logger.info('No GitHub App installation ID detected. Defaulting to authenticating using an access token...');
            return getTokenAuthConfig(accessToken);
        }
    }
    catch (e) {
        logger.error('Error creating and validating auth config', e);
        throw e;
    }
};

const LAST_STATE_FILE = 'last_known_state.json';
function saveLastState(state, logger) {
    try {
        writeFileSync(LAST_STATE_FILE, JSON.stringify(state, null, 2));
        logger.debug(`Saved last state to ${LAST_STATE_FILE}`);
    }
    catch (error) {
        logger.error(`Failed to save last state: ${error}`);
    }
}
function loadLastState(logger) {
    try {
        if (existsSync(LAST_STATE_FILE)) {
            const data = readFileSync(LAST_STATE_FILE, 'utf-8');
            logger.info(`Loaded last state from ${LAST_STATE_FILE}`);
            const parsedState = JSON.parse(data);
            // Validate processedRepos exists and is an array
            if (!parsedState.processedRepos ||
                !Array.isArray(parsedState.processedRepos)) {
                logger.warn('Invalid state file: processedRepos is missing or not an array');
                parsedState.processedRepos = [];
            }
            // Ensure uniqueness while keeping as array
            parsedState.processedRepos = [...new Set(parsedState.processedRepos)];
            return {
                ...parsedState,
                currentCursor: parsedState.currentCursor || null,
                lastSuccessfulCursor: parsedState.lastSuccessfulCursor || null,
                lastProcessedRepo: parsedState.lastProcessedRepo || null,
                lastUpdated: parsedState.lastSuccessTimestamp || null,
                completedSuccessfully: parsedState.completedSuccessfully || false,
            };
        }
    }
    catch (error) {
        logger.error(`Failed to load last state: ${error instanceof Error ? error.message : String(error)}`);
        logger.debug(`State file contents: ${existsSync(LAST_STATE_FILE)
            ? readFileSync(LAST_STATE_FILE, 'utf-8')
            : 'file not found'}`);
    }
    return null;
}
function initializeState({ resumeFromLastSave, logger, }) {
    let processedState = {
        currentCursor: null,
        processedRepos: [],
        lastSuccessfulCursor: null,
        lastProcessedRepo: null,
        lastUpdated: null,
        completedSuccessfully: false,
        outputFileName: null,
    };
    let resumeFromLastState = false;
    if (existsSync(LAST_STATE_FILE)) {
        const lastState = loadLastState(logger);
        let isNewRun = false;
        if (lastState?.completedSuccessfully) {
            logger.info('All repositories were previously processed successfully. Nothing to resume.');
            isNewRun = true;
        }
        if (!isNewRun && resumeFromLastSave && lastState) {
            processedState = lastState;
            resumeFromLastState = true;
            logger.info(`Resuming from last state that was last updated: ${lastState.lastUpdated}`);
        }
    }
    return { processedState, resumeFromLastState };
}
function updateState({ state, repoName, newCursor, lastSuccessfulCursor, logger, }) {
    // Update cursor if provided and different from current
    if (newCursor && newCursor !== state.currentCursor) {
        state.currentCursor = newCursor;
        logger.debug(`Updated cursor to: ${state.currentCursor} for repo: ${repoName}`);
    }
    // Update last successful cursor if provided
    if (lastSuccessfulCursor) {
        state.lastSuccessfulCursor = lastSuccessfulCursor;
    }
    // Add to processed repos if not already included
    if (repoName && !state.processedRepos.includes(repoName)) {
        state.processedRepos.push(repoName);
    }
    // Update last processed repo and timestamp
    if (repoName) {
        state.lastProcessedRepo = repoName;
    }
    state.lastUpdated = new Date().toISOString();
    // Save state after updates
    saveLastState(state, logger);
}

async function withRetry(operation, config, onRetry) {
    let lastError;
    let currentDelay = config.initialDelayMs;
    let successCount = 0;
    let retryCount = 0;
    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
        try {
            const result = await operation();
            successCount++;
            if (successCount >= (config.successThreshold || 5)) {
                successCount = 0;
                retryCount = 0;
            }
            return result;
        }
        catch (error) {
            successCount = 0;
            retryCount++;
            lastError =
                error instanceof Error
                    ? error
                    : new Error(typeof error === 'object' ? JSON.stringify(error) : String(error));
            if (attempt === config.maxAttempts) {
                break;
            }
            if (onRetry) {
                onRetry({
                    attempt,
                    error: lastError,
                    successCount,
                    retryCount,
                });
            }
            await sleep(currentDelay);
            currentDelay = Math.min(currentDelay * config.backoffFactor, config.maxDelayMs);
        }
    }
    throw new Error(`Operation failed after ${config.maxAttempts} attempts: ${lastError?.message || 'No error message available'}${lastError?.stack ? `\nStack trace: ${lastError.stack}` : ''}`);
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const _init = async (opts) => {
    const logFileName = `${opts.orgName}-repo-stats-${new Date().toISOString().split('T')[0]}.log`;
    const logger = await createLogger(opts.verbose, logFileName);
    logInitialization.start(logger);
    logInitialization.auth(logger);
    const authConfig = createAuthConfig({ ...opts, logger: logger });
    logInitialization.octokit(logger);
    const octokit = createOctokit(authConfig, opts.baseUrl, opts.proxyUrl, logger);
    const client = new OctokitClient(octokit);
    const { processedState, resumeFromLastState } = initializeState({
        resumeFromLastSave: opts.resumeFromLastSave || false,
        logger,
    });
    let fileName = '';
    if (resumeFromLastState) {
        fileName = processedState.outputFileName || '';
        logger.info(`Resuming from last state. Using existing file: ${fileName}`);
    }
    else {
        fileName = generateRepoStatsFileName(opts.orgName);
        initializeCsvFile(fileName, logger);
        logger.info(`Results will be saved to file: ${fileName}`);
        processedState.outputFileName = fileName;
        updateState({ state: processedState, logger });
    }
    const retryConfig = {
        maxAttempts: opts.retryMaxAttempts || 3,
        initialDelayMs: opts.retryInitialDelay || 1000,
        maxDelayMs: opts.retryMaxDelay || 30000,
        backoffFactor: opts.retryBackoffFactor || 2,
        successThreshold: opts.retrySuccessThreshold || 5,
    };
    return {
        logger,
        client,
        fileName,
        processedState,
        retryConfig,
    };
};
async function run(opts) {
    const { logger, client, fileName, processedState, retryConfig } = await _init(opts);
    const startTime = new Date();
    logger.info(`Started processing at: ${startTime.toISOString()}`);
    // Create a state object to track counts that can be modified by reference
    const processingState = {
        successCount: 0,
        retryCount: 0,
    };
    await withRetry(async () => {
        const result = await processRepositories({
            client,
            logger,
            opts,
            processedState,
            state: processingState,
            fileName,
        });
        const endTime = new Date();
        const elapsedTime = formatElapsedTime(startTime, endTime);
        if (result.isComplete) {
            processedState.completedSuccessfully = true;
            logger.info('All repositories have been processed successfully. Marking state as complete.');
        }
        logger.info(`Completed processing ${result.processedCount} repositories. ` +
            `Last cursor: ${result.cursor}, ` +
            `Last repo: ${processedState.lastProcessedRepo}\n` +
            `Start time: ${startTime.toISOString()}\n` +
            `End time: ${endTime.toISOString()}\n` +
            `Total elapsed time: ${elapsedTime}\n` +
            `Consecutive successful operations: ${processingState.successCount}\n` +
            `Total retry attempts: ${processingState.retryCount}\n` +
            `Processing completed successfully: ${processedState.completedSuccessfully}`);
        updateState({ state: processedState, logger });
        // Check for and process missing repositories if enabled
        if (opts.autoProcessMissing && result.isComplete) {
            await processMissingRepositories({
                opts,
                fileName,
                client,
                logger,
                processedState,
                retryConfig,
            });
        }
        return result;
    }, retryConfig, (state) => {
        processingState.retryCount++;
        processingState.successCount = 0;
        logger.warn(`Retry attempt ${state.attempt}: Failed while processing repositories. ` +
            `Current cursor: ${processedState.currentCursor}, ` +
            `Last successful cursor: ${processedState.lastSuccessfulCursor}, ` +
            `Last processed repo: ${processedState.lastProcessedRepo}, ` +
            `Processed repos count: ${processedState.processedRepos.length}, ` +
            `Total retries: ${state.retryCount}, ` +
            `Consecutive successes: ${state.successCount}, ` +
            `Error: ${state.error?.message}\n` +
            `Elapsed time so far: ${formatElapsedTime(startTime, new Date())}`);
        updateState({ state: processedState, logger });
    });
}
async function processMissingRepositories({ opts, fileName, client, logger, processedState, retryConfig, }) {
    logger.info('Checking for missing repositories...');
    const missingReposResult = await checkForMissingRepos({
        opts,
        processedFile: fileName,
    });
    const missingReposCount = missingReposResult.missingRepos.length;
    if (missingReposCount === 0) {
        logger.info('No missing repositories found. All repositories have been processed.');
        return;
    }
    logger.info(`Found ${missingReposCount} missing repositories that need to be processed`);
    // Create temporary file with missing repos
    const missingReposFile = `${opts.orgName}-missing-repos-${new Date().getTime()}.txt`;
    writeFileSync(missingReposFile, missingReposResult.missingRepos
        .map((repo) => `${opts.orgName}/${repo}`)
        .join('\n'));
    logger.info(`Created temporary file with missing repos: ${missingReposFile}`);
    try {
        // Process the missing repos
        logger.info('Processing missing repositories...');
        const missingReposProcessingState = {
            successCount: 0,
            retryCount: 0,
        };
        await withRetry(async () => {
            const missingResult = await processRepositoriesFromFile({
                client,
                logger,
                opts: { ...opts, repoList: missingReposFile },
                processedState,
                state: missingReposProcessingState,
                fileName,
            });
            logger.info(`Completed processing ${missingResult.processedCount} out of ${missingReposCount} missing repositories`);
            return missingResult;
        }, retryConfig, (state) => {
            missingReposProcessingState.retryCount++;
            missingReposProcessingState.successCount = 0;
            logger.warn(`Retry attempt ${state.attempt}: Failed while processing missing repositories. ` +
                `Error: ${state.error?.message}`);
        });
        logger.info('Completed processing of missing repositories');
    }
    finally {
        // Clean up temporary file
        if (existsSync(missingReposFile)) {
            const fs = require('fs');
            fs.unlinkSync(missingReposFile);
            logger.info(`Removed temporary file: ${missingReposFile}`);
        }
    }
}
function initializeCsvFile(fileName, logger) {
    const columns = [
        'Org_Name',
        'Repo_Name',
        'Is_Empty',
        'Last_Push',
        'Last_Update',
        'isFork',
        'isArchived',
        'Repo_Size_mb',
        'Record_Count',
        'Collaborator_Count',
        'Protected_Branch_Count',
        'PR_Review_Count',
        'Milestone_Count',
        'Issue_Count',
        'PR_Count',
        'PR_Review_Comment_Count',
        'Commit_Comment_Count',
        'Issue_Comment_Count',
        'Issue_Event_Count',
        'Release_Count',
        'Project_Count',
        'Branch_Count',
        'Tag_Count',
        'Discussion_Count',
        'Has_Wiki',
        'Full_URL',
        'Migration_Issue',
        'Created',
    ];
    if (!existsSync(fileName)) {
        logger.info(`Creating new CSV file: ${fileName}`);
        // Create header row using same approach as data rows
        const headerRow = `${columns.join(',')}\n`;
        writeFileSync(fileName, headerRow);
    }
    else {
        logger.info(`Using existing CSV file: ${fileName}`);
    }
}
async function analyzeRepositoryStats({ repo, owner, extraPageSize, client, logger, }) {
    // Run issue and PR analysis concurrently
    const [issueStats, prStats] = await Promise.all([
        analyzeIssues({
            owner,
            repo: repo.name,
            per_page: extraPageSize,
            issues: repo.issues,
            client,
            logger,
        }),
        analyzePullRequests({
            owner,
            repo: repo.name,
            per_page: extraPageSize,
            pullRequests: repo.pullRequests,
            client,
            logger,
        }),
    ]);
    return mapToRepoStatsResult(repo, issueStats, prStats);
}
async function* processRepoStats({ reposIterator, client, logger, extraPageSize, processedState, }) {
    for await (const repo of reposIterator) {
        if (repo.pageInfo?.endCursor) {
            updateState({
                state: processedState,
                newCursor: repo.pageInfo.endCursor,
                logger,
            });
        }
        const result = await analyzeRepositoryStats({
            repo,
            owner: repo.owner.login,
            extraPageSize,
            client,
            logger,
        });
        yield result;
    }
}
async function handleRepoProcessingSuccess({ result, processedState, state, opts, client, logger, processedCount, currentCursor = null, }) {
    const successThreshold = opts.retrySuccessThreshold || 5;
    // Track successful processing
    state.successCount++;
    if (state.successCount >= successThreshold && state.retryCount > 0) {
        logger.info(`Reset retry count after ${state.successCount} successful operations`);
        state.retryCount = 0;
        state.successCount = 0;
    }
    updateState({
        state: processedState,
        repoName: result.Repo_Name,
        lastSuccessfulCursor: currentCursor,
        logger,
    });
    // Check rate limits after configured interval
    if (processedCount % (opts.rateLimitCheckInterval || 10) === 0) {
        const rateLimitReached = await checkAndHandleRateLimits({
            client,
            logger,
            processedCount,
        });
        if (rateLimitReached) {
            throw new Error('Rate limit reached. Processing will be paused until limits reset.');
        }
    }
}
async function processRepositoriesFromFile({ client, logger, opts, processedState, state, fileName, }) {
    logger.info(`Processing repositories from list: ${opts.repoList}`);
    const repoList = readFileSync(opts.repoList, 'utf-8')
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => {
        const [owner, repo] = line.trim().split('/');
        return { owner, repo };
    });
    let processedCount = 0;
    for (const { owner, repo } of repoList) {
        try {
            if (processedState.processedRepos.includes(repo)) {
                logger.debug(`Skipping already processed repository: ${repo}`);
                continue;
            }
            const repoStats = await client.getRepoStats(owner, repo, opts.pageSize || 10);
            const result = await analyzeRepositoryStats({
                repo: repoStats,
                owner,
                extraPageSize: opts.extraPageSize || 50,
                client,
                logger,
            });
            await writeResultToCsv(result, fileName, logger);
            await handleRepoProcessingSuccess({
                result,
                processedState,
                state,
                opts,
                client,
                logger,
                processedCount: ++processedCount,
            });
        }
        catch (error) {
            state.successCount = 0;
            logger.error(`Failed processing repo ${repo}: ${error}`);
            throw error;
        }
    }
    return {
        cursor: null,
        processedRepos: processedState.processedRepos,
        processedCount,
        isComplete: true,
        successCount: state.successCount,
        retryCount: state.retryCount,
    };
}
async function processRepositories({ client, logger, opts, processedState, state, fileName, }) {
    logger.debug(`Starting/Resuming from cursor: ${processedState.currentCursor}`);
    if (opts.repoList) {
        return processRepositoriesFromFile({
            client,
            logger,
            opts,
            processedState,
            state,
            fileName,
        });
    }
    // Use lastSuccessfulCursor only if cursor is null (first try)
    const startCursor = processedState.currentCursor || processedState.lastSuccessfulCursor;
    logger.info(`Using start cursor: ${startCursor}`);
    const reposIterator = client.getOrgRepoStats(opts.orgName, opts.pageSize || 10, startCursor);
    let processedCount = 0;
    let iterationComplete = false;
    try {
        for await (const result of processRepoStats({
            reposIterator,
            client,
            logger,
            extraPageSize: opts.extraPageSize || 50,
            processedState,
        })) {
            try {
                if (processedState.processedRepos.includes(result.Repo_Name)) {
                    logger.debug(`Skipping already processed repository: ${result.Repo_Name}`);
                    continue;
                }
                await writeResultToCsv(result, fileName, logger);
                await handleRepoProcessingSuccess({
                    result,
                    processedState,
                    state,
                    opts,
                    client,
                    logger,
                    processedCount: ++processedCount,
                    currentCursor: processedState.currentCursor,
                });
            }
            catch (error) {
                state.successCount = 0;
                logger.error(`Failed processing repo ${result.Repo_Name}: ${error}`);
                processedState.currentCursor = processedState.lastSuccessfulCursor;
                throw error;
            }
        }
        // If we get here, we've completed the iteration without errors
        iterationComplete = true;
        logger.info('Successfully completed processing all repositories');
    }
    catch (error) {
        // If there's an error during iteration, we'll handle it at the caller
        logger.error(`Error during repository processing: ${error}`);
        throw error;
    }
    // Simple completion logic: if we've successfully iterated through all repositories, we're done
    const isComplete = iterationComplete;
    if (isComplete) {
        logger.info('No more repositories to process - processing completed successfully');
    }
    return {
        cursor: processedState.lastSuccessfulCursor,
        processedRepos: processedState.processedRepos,
        processedCount,
        isComplete,
        successCount: state.successCount,
        retryCount: state.retryCount,
    };
}
async function checkAndHandleRateLimits({ client, logger, processedCount, }) {
    logger.debug(`Checking rate limits after processing ${processedCount} repositories`);
    const rateLimits = await client.checkRateLimits();
    if (rateLimits.graphQLRemaining === 0 ||
        rateLimits.apiRemainingRequest === 0) {
        const limitType = rateLimits.graphQLRemaining === 0 ? 'GraphQL' : 'REST API';
        logger.warn(`${limitType} rate limit reached after processing ${processedCount} repositories`);
        if (rateLimits.messageType === 'error') {
            logger.error(rateLimits.message);
            throw new Error(`${limitType} rate limit exceeded and maximum retries reached`);
        }
        logger.warn(rateLimits.message);
        logger.info(`GraphQL remaining: ${rateLimits.graphQLRemaining}`);
        logger.info(`REST API remaining: ${rateLimits.apiRemainingRequest}`);
        return true; // indicates rate limit was reached
    }
    else {
        logger.info(`GraphQL remaining: ${rateLimits.graphQLRemaining}, REST API remaining: ${rateLimits.apiRemainingRequest}`);
    }
    return false; // indicates rate limit was not reached
}
async function writeResultToCsv(result, fileName, logger) {
    try {
        const formattedResult = {
            ...result,
            Is_Empty: result.Is_Empty?.toString().toUpperCase() || 'FALSE',
            isFork: result.isFork?.toString().toUpperCase() || 'FALSE',
            isArchived: result.isArchived?.toString().toUpperCase() || 'FALSE',
            Has_Wiki: result.Has_Wiki?.toString().toUpperCase() || 'FALSE',
            Migration_Issue: result.Migration_Issue?.toString().toUpperCase() || 'FALSE',
        };
        // Create CSV row manually to maintain strict order
        const values = [
            formattedResult.Org_Name,
            formattedResult.Repo_Name,
            formattedResult.Is_Empty,
            formattedResult.Last_Push,
            formattedResult.Last_Update,
            formattedResult.isFork,
            formattedResult.isArchived,
            formattedResult.Repo_Size_mb,
            formattedResult.Record_Count,
            formattedResult.Collaborator_Count,
            formattedResult.Protected_Branch_Count,
            formattedResult.PR_Review_Count,
            formattedResult.Milestone_Count,
            formattedResult.Issue_Count,
            formattedResult.PR_Count,
            formattedResult.PR_Review_Comment_Count,
            formattedResult.Commit_Comment_Count,
            formattedResult.Issue_Comment_Count,
            formattedResult.Issue_Event_Count,
            formattedResult.Release_Count,
            formattedResult.Project_Count,
            formattedResult.Branch_Count,
            formattedResult.Tag_Count,
            formattedResult.Discussion_Count,
            formattedResult.Has_Wiki,
            formattedResult.Full_URL,
            formattedResult.Migration_Issue,
            formattedResult.Created,
        ].map((value) => 
        // Escape values containing commas with quotes
        value?.toString().includes(',') ? `"${value}"` : value ?? '');
        const csvRow = `${values.join(',')}\n`;
        appendFileSync(fileName, csvRow);
        logger.info(`Successfully wrote result for repository: ${result.Repo_Name}`);
    }
    catch (error) {
        logger.error(`Failed to write CSV for repository ${result.Repo_Name}: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}
function mapToRepoStatsResult(repo, issueStats, prStats) {
    const repoSizeMb = convertKbToMb(repo.diskUsage);
    const totalRecordCount = calculateRecordCount(repo, issueStats, prStats);
    const hasMigrationIssues = checkIfHasMigrationIssues({
        repoSizeMb,
        totalRecordCount,
    });
    return {
        Org_Name: repo.owner.login.toLowerCase(),
        Repo_Name: repo.name.toLowerCase(),
        Is_Empty: repo.isEmpty,
        Last_Push: repo.pushedAt,
        Last_Update: repo.updatedAt,
        isFork: repo.isFork,
        isArchived: repo.isArchived,
        Repo_Size_mb: repoSizeMb,
        Record_Count: totalRecordCount,
        Collaborator_Count: repo.collaborators.totalCount,
        Protected_Branch_Count: repo.branchProtectionRules.totalCount,
        PR_Review_Count: prStats.prReviewCount,
        PR_Review_Comment_Count: prStats.prReviewCommentCount,
        Commit_Comment_Count: repo.commitComments.totalCount,
        Milestone_Count: repo.milestones.totalCount,
        PR_Count: repo.pullRequests.totalCount,
        Project_Count: repo.projectsV2.totalCount,
        Branch_Count: repo.branches.totalCount,
        Release_Count: repo.releases.totalCount,
        Issue_Count: issueStats.totalIssuesCount,
        Issue_Event_Count: issueStats.issueEventCount + prStats.issueEventCount,
        Issue_Comment_Count: issueStats.issueCommentCount + prStats.issueCommentCount,
        Tag_Count: repo.tags.totalCount,
        Discussion_Count: repo.discussions.totalCount,
        Has_Wiki: repo.hasWikiEnabled,
        Full_URL: repo.url,
        Migration_Issue: hasMigrationIssues,
        Created: repo.createdAt,
    };
}
function calculateRecordCount(repo, issueStats, prStats) {
    // Match exactly how the bash script calculates record count (line 918)
    return (repo.collaborators.totalCount +
        repo.branchProtectionRules.totalCount +
        prStats.prReviewCount +
        repo.milestones.totalCount +
        issueStats.totalIssuesCount +
        repo.pullRequests.totalCount +
        prStats.prReviewCommentCount +
        repo.commitComments.totalCount +
        issueStats.issueCommentCount +
        prStats.issueCommentCount +
        issueStats.issueEventCount +
        prStats.issueEventCount +
        repo.releases.totalCount +
        repo.projectsV2.totalCount);
}
async function analyzeIssues({ owner, repo, per_page, issues, client, logger, }) {
    logger.debug(`Analyzing issues for repository: ${repo}`);
    if (issues.totalCount <= 0) {
        logger.debug(`No issues found for repository: ${repo}`);
        return {
            totalIssuesCount: issues.totalCount,
            issueEventCount: 0,
            issueCommentCount: 0,
        };
    }
    let totalEventCount = 0;
    let totalCommentCount = 0;
    // Process first page
    for (const issue of issues.nodes) {
        const eventCount = issue.timeline.totalCount;
        const commentCount = issue.comments.totalCount;
        // Calculate non-comment events by subtracting comments from total timeline events
        totalEventCount += eventCount - commentCount;
        totalCommentCount += commentCount;
    }
    // Process additional pages if they exist
    if (issues.pageInfo.hasNextPage && issues.pageInfo.endCursor != null) {
        logger.debug(`More pages of issues found for repository: ${repo}`);
        try {
            // Get next page of issues using iterator
            const nextPagesIterator = client.getRepoIssues(owner, repo, per_page, issues.pageInfo.endCursor);
            // Process each issue from subsequent pages
            for await (const issue of nextPagesIterator) {
                const eventCount = issue.timeline.totalCount;
                const commentCount = issue.comments.totalCount;
                // Calculate non-comment events by subtracting comments from total timeline events
                totalEventCount += eventCount - commentCount;
                totalCommentCount += commentCount;
            }
        }
        catch (error) {
            logger.error(`Error retrieving additional issues for ${owner}/${repo}. ` +
                `Consider reducing page size. Error: ${error}`, error);
            throw error;
        }
    }
    logger.debug(`Gathered all issues from repository: ${repo}`);
    return {
        totalIssuesCount: issues.totalCount,
        issueEventCount: totalEventCount,
        issueCommentCount: totalCommentCount,
    };
}
async function analyzePullRequests({ owner, repo, per_page, pullRequests, client, logger, }) {
    if (pullRequests.totalCount <= 0) {
        return {
            prReviewCommentCount: 0,
            commitCommentCount: 0,
            issueEventCount: 0,
            issueCommentCount: 0,
            prReviewCount: 0,
        };
    }
    let issueEventCount = 0;
    let issueCommentCount = 0;
    let prReviewCount = 0;
    let prReviewCommentCount = 0;
    let commitCommentCount = 0;
    // Process first page
    for (const pr of pullRequests.nodes) {
        const eventCount = pr.timeline.totalCount;
        const commentCount = pr.comments.totalCount;
        const reviewCount = pr.reviews.totalCount;
        const commitCount = pr.commits.totalCount;
        // This matches how the bash script handles event counts
        // It subtracts comments from timeline events, and handles commit limits
        const redundantEventCount = commentCount + (commitCount > 250 ? 250 : commitCount);
        const adjustedEventCount = Math.max(0, eventCount - redundantEventCount);
        issueEventCount += adjustedEventCount;
        issueCommentCount += commentCount;
        prReviewCount += reviewCount;
        // Count review comments by examining each review
        for (const review of pr.reviews.nodes) {
            prReviewCommentCount += review.comments.totalCount;
        }
        commitCommentCount += commitCount;
    }
    // Process additional pages if they exist
    if (pullRequests.pageInfo.hasNextPage &&
        pullRequests.pageInfo.endCursor != null) {
        const cursor = pullRequests.pageInfo.endCursor;
        logger.debug(`Fetching additional pull requests for ${repo} starting from cursor ${cursor}`);
        for await (const pr of client.getRepoPullRequests(owner, repo, per_page, cursor)) {
            const eventCount = pr.timeline.totalCount;
            const commentCount = pr.comments.totalCount;
            const reviewCount = pr.reviews.totalCount;
            const commitCount = pr.commits.totalCount;
            const redundantEventCount = commentCount + (commitCount > 250 ? 250 : commitCount);
            const adjustedEventCount = Math.max(0, eventCount - redundantEventCount);
            issueEventCount += adjustedEventCount;
            issueCommentCount += commentCount;
            prReviewCount += reviewCount;
            // Process review comments for additional pages
            for (const review of pr.reviews.nodes) {
                prReviewCommentCount += review.comments.totalCount;
            }
            commitCommentCount += commitCount;
        }
    }
    return {
        prReviewCommentCount,
        commitCommentCount,
        issueEventCount,
        issueCommentCount,
        prReviewCount,
    };
}
async function checkForMissingRepos({ opts, processedFile, }) {
    const { logger, client } = await _init(opts);
    const org = opts.orgName.toLowerCase();
    const per_page = opts.pageSize || 10;
    logger.debug(`Checking for missing repositories in organization: ${org}`);
    logger.info(`Reading processed file: ${processedFile} to check for missing repositories`);
    const fileContent = readFileSync(processedFile, 'utf-8');
    const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
    });
    logger.debug(`Parsed ${records.length} records from processed file`);
    const processedReposSet = new Set();
    records.forEach((record) => {
        processedReposSet.add(record.Repo_Name.toLowerCase());
    });
    // file name of output file with missing repos with datetime suffix
    const missingReposFileName = `${org}-missing-repos-${new Date().toISOString().split('T')[0]}-${new Date().toISOString().split('T')[1].split(':')[0]}-${new Date().toISOString().split('T')[1].split(':')[1]}.csv`;
    logger.info('Checking for missing repositories in the organization');
    const missingRepos = [];
    for await (const repo of client.listReposForOrg(org, per_page)) {
        if (processedReposSet.has(repo.name.toLowerCase())) {
            continue;
        }
        else {
            missingRepos.push(repo.name);
            // write to csv file append
            const csvRow = `${repo.name}\n`;
            appendFileSync(missingReposFileName, csvRow);
        }
    }
    logger.info(`Found ${missingRepos.length} missing repositories`);
    return { missingRepos };
}

const repoStatsCommand = new commander.Command();
const { Option: Option$1 } = commander;
repoStatsCommand
    .name('repo-stats')
    .description('Gathers repo-stats for all repositories in an organization')
    .version(VERSION)
    .addOption(new Option$1('-o, --org-name <org>', 'The name of the organization to process').env('ORG_NAME'))
    .addOption(new Option$1('-t, --access-token <token>', 'GitHub access token').env('ACCESS_TOKEN'))
    .addOption(new Option$1('-u, --base-url <url>', 'GitHub API base URL')
    .env('BASE_URL')
    .default('https://api.github.com'))
    .addOption(new Option$1('--proxy-url <url>', 'Proxy URL if required').env('PROXY_URL'))
    .addOption(new Option$1('-v, --verbose', 'Enable verbose logging').env('VERBOSE'))
    .addOption(new Option$1('--app-id <id>', 'GitHub App ID').env('APP_ID'))
    .addOption(new Option$1('--private-key <key>', 'GitHub App private key').env('PRIVATE_KEY'))
    .addOption(new Option$1('--private-key-file <file>', 'Path to GitHub App private key file').env('PRIVATE_KEY_FILE'))
    .addOption(new Option$1('--app-installation-id <id>', 'GitHub App installation ID').env('APP_INSTALLATION_ID'))
    .addOption(new Option$1('--page-size <size>', 'Number of items per page')
    .env('PAGE_SIZE')
    .default('10')
    .argParser(parseIntOption))
    .addOption(new Option$1('--extra-page-size <size>', 'Extra page size')
    .env('EXTRA_PAGE_SIZE')
    .default('50')
    .argParser(parseIntOption))
    .addOption(new Option$1('--rate-limit-check-interval <seconds>', 'Interval for rate limit checks in seconds')
    .env('RATE_LIMIT_CHECK_INTERVAL')
    .default('60')
    .argParser(parseIntOption))
    .addOption(new Option$1('--retry-max-attempts <attempts>', 'Maximum number of retry attempts')
    .env('RETRY_MAX_ATTEMPTS')
    .default('3')
    .argParser(parseIntOption))
    .addOption(new Option$1('--retry-initial-delay <milliseconds>', 'Initial delay for retry in milliseconds')
    .env('RETRY_INITIAL_DELAY')
    .default('1000')
    .argParser(parseIntOption))
    .addOption(new Option$1('--retry-max-delay <milliseconds>', 'Maximum delay for retry in milliseconds')
    .env('RETRY_MAX_DELAY')
    .default('30000')
    .argParser(parseIntOption))
    .addOption(new Option$1('--retry-backoff-factor <factor>', 'Backoff factor for retry delays')
    .env('RETRY_BACKOFF_FACTOR')
    .default('2')
    .argParser(parseFloatOption))
    .addOption(new Option$1('--retry-success-threshold <count>', 'Number of successful operations before resetting retry count')
    .env('RETRY_SUCCESS_THRESHOLD')
    .default('5')
    .argParser(parseIntOption))
    .addOption(new Option$1('--resume-from-last-save', 'Resume from the last saved state').env('RESUME_FROM_LAST_SAVE'))
    .addOption(new Option$1('--repo-list <file>', 'Path to file containing list of repositories to process (format: owner/repo_name)').env('REPO_LIST'))
    .addOption(new Option$1('--auto-process-missing', 'Automatically process any missing repositories when main processing is complete').env('AUTO_PROCESS_MISSING'))
    .action(async (options) => {
    console.log('Version:', VERSION);
    console.log('Starting repo-stats...');
    await run(options);
    console.log('Repo-stats completed.');
});

const missingReposCommand = new commander.Command();
const { Option } = commander;
missingReposCommand
    .name('missing-repos')
    .description('Identifies repositories that are part of an organization but not found in a specified file. Can be run after a call to repo-stats-command.')
    .version(VERSION)
    .addOption(new Option('-f, --output-file-name <file>', 'Repo Stats File to check repos against')
    .env('OUTPUT_FILE_NAME')
    .makeOptionMandatory(true))
    .addOption(new Option('-o, --org-name <org>', 'The name of the organization to process').env('ORG_NAME'))
    .addOption(new Option('-t, --access-token <token>', 'GitHub access token').env('ACCESS_TOKEN'))
    .addOption(new Option('-u, --base-url <url>', 'GitHub API base URL')
    .env('BASE_URL')
    .default('https://api.github.com'))
    .addOption(new Option('--proxy-url <url>', 'Proxy URL if required').env('PROXY_URL'))
    .addOption(new Option('-v, --verbose', 'Enable verbose logging').env('VERBOSE'))
    .addOption(new Option('--app-id <id>', 'GitHub App ID').env('APP_ID'))
    .addOption(new Option('--private-key <key>', 'GitHub App private key').env('PRIVATE_KEY'))
    .addOption(new Option('--private-key-file <file>', 'Path to GitHub App private key file').env('PRIVATE_KEY_FILE'))
    .addOption(new Option('--app-installation-id <id>', 'GitHub App installation ID').env('APP_INSTALLATION_ID'))
    .addOption(new Option('--page-size <size>', 'Number of items per page')
    .env('PAGE_SIZE')
    .default('10')
    .argParser(parseIntOption))
    .action(async (options) => {
    console.log('Version:', VERSION);
    const result = await checkForMissingRepos({
        opts: options,
        processedFile: `${options.outputFileName}`,
    });
    const missing = result.missingRepos;
    if (missing.length > 0) {
        console.log('Missing Repositories:');
        missing.forEach((repo) => {
            console.log(`- ${repo}`);
        });
    }
    else {
        console.log('No missing repositories found.');
    }
});

config();
const program = new commander.Command();
program
    .description('Fetches and processes repository statistics from GitHub organizations')
    .version(VERSION)
    .addCommand(repoStatsCommand)
    .addCommand(missingReposCommand);
program.parse(process.argv);
//# sourceMappingURL=index.js.map
