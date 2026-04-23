import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  configureSslBypass,
  createCaCertDispatcher,
  resolveTlsDispatcher,
  TlsBypassError,
} from '../src/tls.js';
import { createMockLogger } from './test-utils.js';

vi.mock('fs');
import * as fs from 'fs';

describe('tls', () => {
  const mockLogger = createMockLogger();
  let originalEnv: typeof process.env;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env['GHES_CA_CERT_PATH'];
    vi.mocked(fs.readFileSync).mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
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

    it('should emit a warning recommending CA cert', () => {
      configureSslBypass('https://ghes.example.com', mockLogger);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('GHES_CA_CERT_PATH'),
      );
    });
  });

  describe('createCaCertDispatcher', () => {
    it('should return an undici Agent when cert file is readable', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        '-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----\n',
      );
      const dispatcher = createCaCertDispatcher(
        '/path/to/cert.pem',
        mockLogger,
      );
      expect(dispatcher).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Using CA certificate for TLS verification',
      );
    });

    it('should return undefined and warn when cert file cannot be read', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });
      const dispatcher = createCaCertDispatcher(
        '/missing/cert.pem',
        mockLogger,
      );
      expect(dispatcher).toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to read CA certificate'),
      );
    });

    it('should not modify NODE_TLS_REJECT_UNAUTHORIZED', () => {
      vi.mocked(fs.readFileSync).mockReturnValue('cert-data');
      createCaCertDispatcher('/path/to/cert.pem', mockLogger);
      expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBeUndefined();
    });
  });

  describe('resolveTlsDispatcher', () => {
    it('should return a dispatcher when caCertPath argument is provided', () => {
      vi.mocked(fs.readFileSync).mockReturnValue('cert-data');
      const dispatcher = resolveTlsDispatcher(
        'https://ghes.example.com/api/v3',
        false,
        mockLogger,
        '/path/to/cert.pem',
      );
      expect(dispatcher).toBeDefined();
      expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBeUndefined();
    });

    it('should read GHES_CA_CERT_PATH from env when no explicit path given', () => {
      process.env['GHES_CA_CERT_PATH'] = '/env/cert.pem';
      vi.mocked(fs.readFileSync).mockReturnValue('cert-data');
      const dispatcher = resolveTlsDispatcher(
        'https://ghes.example.com/api/v3',
        false,
        mockLogger,
      );
      expect(dispatcher).toBeDefined();
      expect(fs.readFileSync).toHaveBeenCalledWith('/env/cert.pem', 'utf8');
    });

    it('should fall back to SSL bypass when cert read fails and skipTlsVerification is true', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('ENOENT');
      });
      const dispatcher = resolveTlsDispatcher(
        'https://ghes.example.com/api/v3',
        true,
        mockLogger,
        '/missing/cert.pem',
      );
      expect(dispatcher).toBeUndefined();
      expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBe('0');
    });

    it('should use SSL bypass when no cert path and skipTlsVerification is true', () => {
      const dispatcher = resolveTlsDispatcher(
        'https://ghes.example.com/api/v3',
        true,
        mockLogger,
      );
      expect(dispatcher).toBeUndefined();
      expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBe('0');
    });

    it('should return undefined and not bypass when no cert and skipTlsVerification is false', () => {
      const dispatcher = resolveTlsDispatcher(
        'https://ghes.example.com/api/v3',
        false,
        mockLogger,
      );
      expect(dispatcher).toBeUndefined();
      expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBeUndefined();
    });

    it('should not use cert for github.com even if GHES_CA_CERT_PATH is set', () => {
      process.env['GHES_CA_CERT_PATH'] = '/env/cert.pem';
      vi.mocked(fs.readFileSync).mockReturnValue('cert-data');
      const dispatcher = resolveTlsDispatcher(
        'https://api.github.com',
        false,
        mockLogger,
      );
      expect(dispatcher).toBeUndefined();
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });
  });
});
