import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry, type RetryConfig } from '../src/retry.js';

describe('retry', () => {
  let originalSetTimeout: typeof setTimeout;

  beforeEach(() => {
    originalSetTimeout = global.setTimeout;
    // Mock setTimeout to execute immediately for faster tests
    global.setTimeout = vi.fn((fn) => {
      if (typeof fn === 'function') {
        setImmediate(fn);
      }
      return 1 as any;
    });
  });

  afterEach(() => {
    global.setTimeout = originalSetTimeout;
    vi.restoreAllMocks();
  });

  describe('withRetry', () => {
    const defaultConfig: RetryConfig = {
      maxAttempts: 3,
      initialDelayMs: 100,
      maxDelayMs: 1000,
      backoffFactor: 2,
    };

    it('should return result on first successful attempt', async () => {
      // Arrange
      const expectedResult = 'success';
      const operation = vi.fn().mockResolvedValue(expectedResult);

      // Act
      const result = await withRetry(operation, defaultConfig);

      // Assert
      expect(result).toBe(expectedResult);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      // Arrange
      const expectedResult = 'success after retry';
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockResolvedValue(expectedResult);

      const onRetry = vi.fn();

      // Act
      const result = await withRetry(operation, defaultConfig, onRetry);

      // Assert
      expect(result).toBe(expectedResult);
      expect(operation).toHaveBeenCalledTimes(3);
      expect(onRetry).toHaveBeenCalledTimes(2);

      // Check retry calls
      expect(onRetry).toHaveBeenNthCalledWith(1, {
        attempt: 1,
        error: expect.any(Error),
        successCount: 0,
        retryCount: 1,
      });

      expect(onRetry).toHaveBeenNthCalledWith(2, {
        attempt: 2,
        error: expect.any(Error),
        successCount: 0,
        retryCount: 2,
      });
    });

    it('should respect maximum attempts and throw final error', async () => {
      // Arrange
      const finalError = new Error('Final failure');
      const operation = vi.fn().mockRejectedValue(finalError);
      const onRetry = vi.fn();

      // Act & Assert
      await expect(withRetry(operation, defaultConfig, onRetry)).rejects.toThrow(
        `Operation failed after ${defaultConfig.maxAttempts} attempts: ${finalError.message}`,
      );

      expect(operation).toHaveBeenCalledTimes(defaultConfig.maxAttempts);
      expect(onRetry).toHaveBeenCalledTimes(defaultConfig.maxAttempts - 1);
    });

    it('should implement exponential backoff correctly', async () => {
      // Arrange
      const operation = vi.fn().mockRejectedValue(new Error('Always fails'));

      // Act
      await expect(withRetry(operation, defaultConfig)).rejects.toThrow();

      // Assert that setTimeout was called with correct delays
      expect(global.setTimeout).toHaveBeenCalledWith(expect.any(Function), 100);
      expect(global.setTimeout).toHaveBeenCalledWith(expect.any(Function), 200);
    });

    it('should cap delay at maxDelayMs', async () => {
      // Arrange
      const config: RetryConfig = {
        maxAttempts: 5,
        initialDelayMs: 500,
        maxDelayMs: 800,
        backoffFactor: 2,
      };
      const operation = vi.fn().mockRejectedValue(new Error('Always fails'));

      // Act
      await expect(withRetry(operation, config)).rejects.toThrow();

      // Assert delays were capped
      expect(global.setTimeout).toHaveBeenCalledWith(expect.any(Function), 500);
      expect(global.setTimeout).toHaveBeenCalledWith(expect.any(Function), 800);
      expect(global.setTimeout).not.toHaveBeenCalledWith(expect.any(Function), 1000);
    });

    it('should reset retry count after successful threshold', async () => {
      // Arrange
      const config: RetryConfig = {
        ...defaultConfig,
        successThreshold: 2,
      };

      let callCount = 0;
      const operation = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.resolve(`success-${callCount}`);
        }
        return Promise.reject(new Error('Unexpected failure'));
      });

      // Act
      const result1 = await withRetry(operation, config);
      const result2 = await withRetry(operation, config);

      // Assert
      expect(result1).toBe('success-1');
      expect(result2).toBe('success-2');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should handle non-Error exceptions', async () => {
      // Arrange
      const stringError = 'String error message';
      const operation = vi
        .fn()
        .mockRejectedValueOnce(stringError)
        .mockRejectedValueOnce({ message: 'Object error', code: 500 })
        .mockRejectedValue(new Error('Final error'));

      // Act & Assert
      await expect(withRetry(operation, defaultConfig)).rejects.toThrow(
        'Operation failed after 3 attempts',
      );
    });

    it('should call onRetry callback with correct state', async () => {
      // Arrange
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('First error'))
        .mockResolvedValue('success');

      const onRetry = vi.fn();

      // Act
      await withRetry(operation, defaultConfig, onRetry);

      // Assert
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith({
        attempt: 1,
        error: expect.any(Error),
        successCount: 0,
        retryCount: 1,
      });

      const retryState = onRetry.mock.calls[0][0];
      expect(retryState.error?.message).toBe('First error');
    });

    it('should not call onRetry after final failure', async () => {
      // Arrange
      const operation = vi.fn().mockRejectedValue(new Error('Always fails'));
      const onRetry = vi.fn();

      // Act
      await expect(withRetry(operation, defaultConfig, onRetry)).rejects.toThrow();

      // Assert - Should only retry maxAttempts - 1 times
      expect(onRetry).toHaveBeenCalledTimes(2); // For 3 max attempts, 2 retries
    });

    it('should work without onRetry callback', async () => {
      // Arrange
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValue('success');

      // Act
      const result = await withRetry(operation, defaultConfig);

      // Assert
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    describe('edge cases', () => {
      it('should handle maxAttempts of 1', async () => {
        // Arrange
        const config: RetryConfig = {
          ...defaultConfig,
          maxAttempts: 1,
        };
        const operation = vi.fn().mockRejectedValue(new Error('Immediate failure'));

        // Act & Assert
        await expect(withRetry(operation, config)).rejects.toThrow(
          'Operation failed after 1 attempts: Immediate failure',
        );
        expect(operation).toHaveBeenCalledTimes(1);
      });

      it('should handle backoff factor of 1 (no exponential increase)', async () => {
        // Arrange
        const config: RetryConfig = {
          ...defaultConfig,
          backoffFactor: 1,
        };
        const operation = vi.fn().mockRejectedValue(new Error('Always fails'));

        // Act
        await expect(withRetry(operation, config)).rejects.toThrow();

        // Assert - all delays should be the same
        expect(global.setTimeout).toHaveBeenCalledWith(expect.any(Function), 100);
        expect(global.setTimeout).toHaveBeenCalledWith(expect.any(Function), 100);
      });
    });
  });
});