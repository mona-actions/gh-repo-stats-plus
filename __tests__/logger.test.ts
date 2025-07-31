import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as winston from 'winston';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import {
  createLogger,
  logProcessingSummary,
  logBatchProcessing,
  logInitialization,
} from '../src/logger.js';
import { ProcessingSummary } from '../src/types.js';
import { createMockLogger } from './test-utils.js';

// Mock dependencies
vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  mkdir: vi.fn(),
}));

vi.mock('winston', () => {
  // Create mock functions for winston components
  const format = {
    combine: vi.fn().mockReturnValue('combinedFormat'),
    timestamp: vi.fn().mockReturnValue('timestampFormat'),
    printf: vi.fn().mockImplementation((fn) => fn),
    colorize: vi.fn().mockReturnValue('colorizeFormat'),
  };

  const mockTransport = vi.fn();
  const mockOnError = vi.fn();

  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    on: mockOnError,
  };

  return {
    format,
    createLogger: vi.fn().mockReturnValue(mockLogger),
    transports: {
      Console: mockTransport,
      File: mockTransport,
    },
  };
});

vi.mock('path', () => ({
  resolve: vi.fn().mockImplementation((...args) => args.join('/')),
}));

describe('Logger Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(winston.createLogger).mockReturnValue({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      on: vi.fn(),
    } as winston.Logger);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(mkdir).mockResolvedValue(undefined);
    console.debug = vi.fn();
    console.error = vi.fn();
  });

  describe('createLogger', () => {
    it.each([
      { verbose: true, description: 'verbose mode' },
      { verbose: false, description: 'quiet mode' },
    ])(
      'should create a logger with default configuration in $description',
      async ({ verbose }) => {
        // Act
        const logger = await createLogger(verbose);

        // Assert
        expect(winston.createLogger).toHaveBeenCalledTimes(1);
        expect(logger).toBeDefined();
      },
    );

    it.each([
      { dirExists: false, shouldCreateDir: true },
      { dirExists: true, shouldCreateDir: false },
    ])(
      'should $<shouldCreateDir ? "create" : "not create"> logs directory when it $<dirExists ? "exists" : "does not exist">',
      async ({ dirExists, shouldCreateDir }) => {
        // Arrange
        vi.mocked(existsSync).mockReturnValue(dirExists);

        // Act
        await createLogger(true);

        // Assert
        if (shouldCreateDir) {
          expect(mkdir).toHaveBeenCalledWith(expect.stringContaining('logs'), {
            recursive: true,
          });
        } else {
          expect(mkdir).not.toHaveBeenCalled();
        }
      },
    );

    it('should handle errors during directory creation', async () => {
      // Arrange
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(mkdir).mockRejectedValue(new Error('mkdir failed'));

      // Act & Assert
      await expect(createLogger(true)).rejects.toThrow('mkdir failed');
    });
  });

  describe('logProcessingSummary', () => {
    it('should log complete processing summary', () => {
      // Arrange
      const mockLogger = createMockLogger();
      const summary: ProcessingSummary = {
        initiallyProcessed: 100,
        totalRetried: 5,
        totalSuccess: 95,
        totalFailures: 10,
        remainingUnprocessed: 0,
        totalAttempts: 110,
      };

      // Act
      logProcessingSummary(summary, mockLogger);

      // Assert - Check key log entries
      expect(mockLogger.info).toHaveBeenCalledWith('Processing Summary:');
      expect(mockLogger.info).toHaveBeenCalledWith(
        '✓ Initially processed: 100 files',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        '✓ Successfully retried: 5 files',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        '✓ Total successfully processed: 95 files',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        '✗ Failed to process: 10 files that were attempted to be retried',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Completed repo-stats-queue processing',
      );
    });

    it('should log unprocessed files warning if present', () => {
      // Arrange
      const mockLogger = createMockLogger();
      const summary: ProcessingSummary = {
        initiallyProcessed: 10,
        totalRetried: 0,
        totalSuccess: 8,
        totalFailures: 0,
        remainingUnprocessed: 2,
        totalAttempts: 10,
      };

      // Act
      logProcessingSummary(summary, mockLogger);

      // Assert
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '⚠ Unprocessed files remaining: 2',
      );
    });

    it('should not log retried files if none retried', () => {
      // Arrange
      const mockLogger = createMockLogger();
      const summary: ProcessingSummary = {
        initiallyProcessed: 10,
        totalRetried: 0,
        totalSuccess: 10,
        totalFailures: 0,
        remainingUnprocessed: 0,
        totalAttempts: 10,
      };

      // Act
      logProcessingSummary(summary, mockLogger);

      // Assert
      expect(mockLogger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Successfully retried'),
      );
    });
  });

  describe('logBatchProcessing', () => {
    it.each([
      {
        method: 'allSuccess',
        args: [],
        expectedMessage: '✓ All files processed successfully',
        description: 'all files processed successfully',
      },
    ])('should log $description', ({ method, args, expectedMessage }) => {
      // Arrange
      const mockLogger = createMockLogger();

      // Act
      (logBatchProcessing as Record<string, (...args: unknown[]) => void>)[method](mockLogger, ...args);

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(expectedMessage);
    });

    it('should log max retries reached', () => {
      // Arrange
      const mockLogger = createMockLogger();
      const max = 3;
      const remaining = 10;

      // Act
      logBatchProcessing.maxRetries(max, remaining, mockLogger);

      // Assert
      expect(mockLogger.warn).toHaveBeenCalledWith(
        `⚠ Maximum retry attempts (${max}) reached. ${remaining} files remain unprocessed`,
      );
    });

    it.each([
      {
        method: 'scheduled',
        args: [5],
        expectedCall: 'info',
        expectedMessage: '⟳ 5 files scheduled for retry in next attempt',
        description: 'files scheduled for retry',
      },
      {
        method: 'total',
        args: [100],
        expectedCall: 'info',
        expectedMessage: 'Total repositories processed: 100',
        description: 'total repositories processed',
      },
    ])(
      'should log $description',
      ({ method, args, expectedCall, expectedMessage }) => {
        // Arrange
        const mockLogger = createMockLogger();

        // Act
        (logBatchProcessing as Record<string, (...args: unknown[]) => void>)[method](...args, mockLogger);

        // Assert
        expect((mockLogger as Record<string, unknown>)[expectedCall]).toHaveBeenCalledWith(
          expectedMessage,
        );
      },
    );
  });

  describe('logInitialization', () => {
    it('should log all initialization steps', () => {
      // Arrange
      const mockLogger = createMockLogger();

      // Act
      logInitialization.start(mockLogger);
      logInitialization.auth(mockLogger);
      logInitialization.octokit(mockLogger);
      logInitialization.token(mockLogger);
      logInitialization.directories(mockLogger);

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Initializing repo-stats-queue application...',
      );
      expect(mockLogger.debug).toHaveBeenCalledWith('Creating auth config...');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Initializing octokit client...',
      );
      expect(mockLogger.debug).toHaveBeenCalledWith('Generating app token...');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Setting up output directories...',
      );
    });
  });
});
