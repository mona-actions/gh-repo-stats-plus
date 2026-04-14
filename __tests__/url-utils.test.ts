import { describe, it, expect } from 'vitest';
import {
  apiUrlToBaseUrl,
  hostnameFromApiUrl,
  isGitHubDotCom,
} from '../src/url-utils.js';

describe('url-utils', () => {
  describe('apiUrlToBaseUrl', () => {
    it('should convert api.github.com to github.com', () => {
      expect(apiUrlToBaseUrl('https://api.github.com')).toBe(
        'https://github.com',
      );
    });

    it('should strip trailing path from api.github.com', () => {
      expect(apiUrlToBaseUrl('https://api.github.com/v3')).toBe(
        'https://github.com',
      );
    });

    it('should keep GHES hostname as-is', () => {
      expect(apiUrlToBaseUrl('https://ghes.example.com/api/v3')).toBe(
        'https://ghes.example.com',
      );
    });

    it('should handle GHES URL without path', () => {
      expect(apiUrlToBaseUrl('https://ghes.example.com')).toBe(
        'https://ghes.example.com',
      );
    });

    it('should handle IP-based URLs', () => {
      expect(apiUrlToBaseUrl('https://10.0.0.1/api/v3')).toBe(
        'https://10.0.0.1',
      );
    });

    it('should handle IP-based URL with port', () => {
      expect(apiUrlToBaseUrl('https://10.0.0.1:8443/api/v3')).toBe(
        'https://10.0.0.1:8443',
      );
    });

    it('should strip api. prefix from any hostname', () => {
      expect(apiUrlToBaseUrl('https://api.ghes.example.com')).toBe(
        'https://ghes.example.com',
      );
    });
  });

  describe('hostnameFromApiUrl', () => {
    it('should return github.com for api.github.com', () => {
      expect(hostnameFromApiUrl('https://api.github.com')).toBe('github.com');
    });

    it('should return GHES hostname', () => {
      expect(hostnameFromApiUrl('https://ghes.example.com/api/v3')).toBe(
        'ghes.example.com',
      );
    });

    it('should return IP address', () => {
      expect(hostnameFromApiUrl('https://10.0.0.1/api/v3')).toBe('10.0.0.1');
    });

    it('should strip api. prefix', () => {
      expect(hostnameFromApiUrl('https://api.ghes.example.com')).toBe(
        'ghes.example.com',
      );
    });
  });

  describe('isGitHubDotCom', () => {
    it('should return true for api.github.com', () => {
      expect(isGitHubDotCom('https://api.github.com')).toBe(true);
    });

    it('should return true for github.com', () => {
      expect(isGitHubDotCom('https://github.com')).toBe(true);
    });

    it('should return false for GHES URL', () => {
      expect(isGitHubDotCom('https://ghes.example.com/api/v3')).toBe(false);
    });

    it('should return false for IP-based URL', () => {
      expect(isGitHubDotCom('https://10.0.0.1/api/v3')).toBe(false);
    });

    it('should return false for GHES with api prefix', () => {
      expect(isGitHubDotCom('https://api.ghes.example.com')).toBe(false);
    });
  });
});
