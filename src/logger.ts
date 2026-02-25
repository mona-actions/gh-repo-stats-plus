import * as winston from 'winston';
import * as path from 'path';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';
const { combine, timestamp, printf, colorize } = winston.format;

import { Logger, ProcessingSummary } from './types.js';

const createFormat = (verbose: boolean) =>
  printf(({ level, message, timestamp, owner, repo, module }): string => {
    const moduleTag = verbose && module ? ` [${module}]` : '';
    if (owner && repo) {
      return `${timestamp} ${level}${moduleTag} [${owner}/${repo}]: ${message}`;
    } else {
      return `${timestamp} ${level}${moduleTag}: ${message}`;
    }
  });

const generateLoggerOptions = async (
  verbose: boolean,
  logFileName?: string,
): Promise<winston.LoggerOptions> => {
  // Use absolute path for logs directory
  const logsDir = path.resolve(process.cwd(), 'logs');

  try {
    // Create logs directory if it doesn't exist
    if (!existsSync(logsDir)) {
      await mkdir(logsDir, { recursive: true });
    }

    const defaultLogName = `repo-stats-${
      new Date().toISOString().split('T')[0]
    }.log`;

    const logFile = path.resolve(logsDir, logFileName ?? defaultLogName);

    console.debug(`Initializing logger with file: ${logFile}`); // Debug output

    const format = createFormat(verbose);
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
  } catch (error) {
    console.error(`Failed to setup logger: ${error}`);
    throw error;
  }
};

export const createLogger = async (
  verbose: boolean,
  logFileName?: string,
): Promise<Logger> => {
  const options = await generateLoggerOptions(verbose, logFileName);
  const logger = winston.createLogger(options);

  // Add error handler
  logger.on('error', (error) => {
    console.error('Logger error:', error);
  });

  return logger;
};

/**
 * Creates a child logger with a module label.
 * When verbose mode is enabled, log output will include `[module]` tags
 * to identify which module produced each message.
 *
 * @param logger - Parent logger instance
 * @param module - Module name to use as the label (e.g., 'state', 'session')
 * @returns A child logger with the module metadata attached, or the original logger if child() is unavailable
 */
export const withModule = (logger: Logger, module: string): Logger => {
  if (logger.child) {
    return logger.child({ module });
  }
  return logger;
};

export const logProcessingSummary = (
  summary: ProcessingSummary,
  logger: Logger,
): void => {
  logger.info('Processing Summary:');
  logger.info(`✓ Initially processed: ${summary.initiallyProcessed} files`);
  if (summary.totalRetried > 0) {
    logger.info(`✓ Successfully retried: ${summary.totalRetried} files`);
  }
  logger.info(`✓ Total successfully processed: ${summary.totalSuccess} files`);
  logger.info(
    `✗ Failed to process: ${summary.totalFailures} files that were attempted to be retried`,
  );
  if (summary.remainingUnprocessed > 0) {
    logger.warn(
      `⚠ Unprocessed files remaining: ${summary.remainingUnprocessed}`,
    );
  }
  logger.debug(`Total processing attempts: ${summary.totalAttempts}`);
  logger.info('Completed repo-stats-queue processing');
};

export const logBatchProcessing = {
  starting: (fileCount: number, logger: Logger): void => {
    logger.info(`Starting batch processing with ${fileCount} files`);
  },
  noFiles: (logger: Logger): void => {
    logger.info('No batch files found for processing');
  },
  attempt: (current: number, max: number, logger: Logger): void => {
    logger.info(`Processing attempt ${current} of ${max}`);
  },
  allSuccess: (logger: Logger): void => {
    logger.info('✓ All files processed successfully');
  },
  maxRetries: (max: number, remaining: number, logger: Logger): void => {
    logger.warn(
      `⚠ Maximum retry attempts (${max}) reached. ${remaining} files remain unprocessed`,
    );
  },
  scheduled: (count: number, logger: Logger): void => {
    logger.info(`⟳ ${count} files scheduled for retry in next attempt`);
  },
  total: (count: number, logger: Logger): void => {
    logger.info(`Total repositories processed: ${count}`);
  },
};

export const logInitialization = {
  start: (logger: Logger): void => {
    logger.info('Initializing repo-stats-queue application...');
  },
  auth: (logger: Logger): void => {
    logger.debug('Creating auth config...');
  },
  octokit: (logger: Logger): void => {
    logger.debug('Initializing octokit client...');
  },
  token: (logger: Logger): void => {
    logger.debug('Generating app token...');
  },
  directories: (logger: Logger): void => {
    logger.debug('Setting up output directories...');
  },
};
