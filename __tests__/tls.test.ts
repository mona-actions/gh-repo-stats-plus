import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadCaCertificate } from '../src/tls.js';
import { createMockLogger } from './test-utils.js';

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}));

import { readFileSync } from 'fs';

const mockReadFileSync = vi.mocked(readFileSync);

describe('tls', () => {
  const logger = createMockLogger();
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
    delete process.env.NODE_EXTRA_CA_CERTS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('loadCaCertificate', () => {
    it('should return undefined when no path or env var is set', () => {
      const result = loadCaCertificate(undefined, logger);
      expect(result).toBeUndefined();
      expect(mockReadFileSync).not.toHaveBeenCalled();
    });

    it('should load certificate from explicit path', () => {
      const certContent =
        '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----';
      mockReadFileSync.mockReturnValue(certContent);

      const result = loadCaCertificate('/path/to/ca.pem', logger);

      expect(result).toBe(certContent);
      expect(mockReadFileSync).toHaveBeenCalledWith('/path/to/ca.pem', 'utf-8');
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('--ca-cert'),
      );
    });

    it('should fall back to NODE_EXTRA_CA_CERTS env var', () => {
      const certContent =
        '-----BEGIN CERTIFICATE-----\nenv\n-----END CERTIFICATE-----';
      process.env.NODE_EXTRA_CA_CERTS = '/env/path/ca.pem';
      mockReadFileSync.mockReturnValue(certContent);

      const result = loadCaCertificate(undefined, logger);

      expect(result).toBe(certContent);
      expect(mockReadFileSync).toHaveBeenCalledWith(
        '/env/path/ca.pem',
        'utf-8',
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('NODE_EXTRA_CA_CERTS'),
      );
    });

    it('should prefer explicit path over NODE_EXTRA_CA_CERTS', () => {
      const certContent =
        '-----BEGIN CERTIFICATE-----\nexplicit\n-----END CERTIFICATE-----';
      process.env.NODE_EXTRA_CA_CERTS = '/env/path/ca.pem';
      mockReadFileSync.mockReturnValue(certContent);

      const result = loadCaCertificate('/explicit/path/ca.pem', logger);

      expect(result).toBe(certContent);
      expect(mockReadFileSync).toHaveBeenCalledWith(
        '/explicit/path/ca.pem',
        'utf-8',
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('--ca-cert'),
      );
    });

    it('should throw error when file cannot be read', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      expect(() => loadCaCertificate('/missing/ca.pem', logger)).toThrow(
        'Failed to read CA certificate from --ca-cert: ENOENT: no such file or directory',
      );
    });

    it('should throw error when NODE_EXTRA_CA_CERTS file cannot be read', () => {
      process.env.NODE_EXTRA_CA_CERTS = '/missing/env-ca.pem';
      mockReadFileSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      expect(() => loadCaCertificate(undefined, logger)).toThrow(
        'Failed to read CA certificate from NODE_EXTRA_CA_CERTS: EACCES: permission denied',
      );
    });

    it('should handle non-Error throw from readFileSync', () => {
      mockReadFileSync.mockImplementation(() => {
        throw 'unexpected string error';
      });

      expect(() => loadCaCertificate('/bad/ca.pem', logger)).toThrow(
        'Failed to read CA certificate from --ca-cert: Unknown error reading file',
      );
    });
  });
});
