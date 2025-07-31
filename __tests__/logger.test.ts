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
    } as any);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(mkdir).mockResolvedValue(undefined);
    console.debug = vi.fn();
    console.error = vi.fn();
  });

  describe('createLogger', () => {
    it('should create a logger with default configuration in verbose mode', async () => {
      // Act
      const logger = await createLogger(true);

      // Assert
      expect(winston.createLogger).toHaveBeenCalledTimes(1);
      expect(logger).toBeDefined();
    });

    it('should create a logger with default configuration in quiet mode', async () => {
      // Act
      const logger = await createLogger(false);

      // Assert
      expect(winston.createLogger).toHaveBeenCalledTimes(1);
      expect(logger).toBeDefined();
    });

    it('should create logs directory if it does not exist', async () => {
      // Arrange
      vi.mocked(existsSync).mockReturnValue(false);

      // Act
      await createLogger(true);

      // Assert
      expect(mkdir).toHaveBeenCalledWith(expect.stringContaining('logs'), {
        recursive: true,
      });
    });

    it('should not create logs directory if it already exists', async () => {
      // Arrange
      vi.mocked(existsSync).mockReturnValue(true);

      // Act
      await createLogger(true);

      // Assert
      expect(mkdir).not.toHaveBeenCalled();
    });

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
    it('should log all files processed successfully', () => {
      // Arrange
      const mockLogger = createMockLogger();

      // Act
      logBatchProcessing.allSuccess(mockLogger);

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        '✓ All files processed successfully',
      );
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

    it('should log files scheduled for retry', () => {
      // Arrange
      const mockLogger = createMockLogger();
      const count = 5;

      // Act
      logBatchProcessing.scheduled(count, mockLogger);

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        `⟳ ${count} files scheduled for retry in next attempt`,
      );
    });

    it('should log total repositories processed', () => {
      // Arrange
      const mockLogger = createMockLogger();
      const count = 100;

      // Act
      logBatchProcessing.total(count, mockLogger);

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Total repositories processed: ${count}`,
      );
    });
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
