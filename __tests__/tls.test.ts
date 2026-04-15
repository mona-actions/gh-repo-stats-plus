import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { configureSslBypass, TlsBypassError } from '../src/tls.js';
import { createMockLogger } from './test-utils.js';

describe('tls', () => {
  const mockLogger = createMockLogger();
  let originalEnv: typeof process.env;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('configureSslBypass', () => {
    it('should set NODE_TLS_REJECT_UNAUTHORIZED to 0', () => {
      configureSslBypass('https://ghes.example.com/api/v3', mockLogger);
      expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBe('0');
    });

    it('should not set GIT_SSL_NO_VERIFY (handled by action.yml with host scoping)', () => {
      configureSslBypass('https://ghes.example.com/api/v3', mockLogger);
      expect(process.env.GIT_SSL_NO_VERIFY).toBeUndefined();
    });

    it('should set NODE_NO_WARNINGS to 1', () => {
      configureSslBypass('https://ghes.example.com/api/v3', mockLogger);
      expect(process.env.NODE_NO_WARNINGS).toBe('1');
    });

    it('should throw TlsBypassError for api.github.com', () => {
      expect(() =>
        configureSslBypass('https://api.github.com', mockLogger),
      ).toThrow(TlsBypassError);
    });

    it('should throw TlsBypassError for github.com base URL', () => {
      expect(() =>
        configureSslBypass('https://github.com', mockLogger),
      ).toThrow(TlsBypassError);
    });

    it('should include helpful message when refusing github.com', () => {
      expect(() =>
        configureSslBypass('https://api.github.com', mockLogger),
      ).toThrow(/Refusing to disable TLS verification for public github.com/);
    });

    it('should allow TLS bypass for GHES URLs', () => {
      expect(() =>
        configureSslBypass('https://ghes.corp.example.com/api/v3', mockLogger),
      ).not.toThrow();
    });

    it('should allow TLS bypass for IP-based URLs', () => {
      expect(() =>
        configureSslBypass('https://10.0.0.1/api/v3', mockLogger),
      ).not.toThrow();
    });

    it('should log info messages', () => {
      configureSslBypass('https://ghes.example.com', mockLogger);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Disabling SSL verification for GHES connection',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'SSL bypass configured for Node.js',
      );
    });
  });
});
