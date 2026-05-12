import { describe, expect, it } from 'vitest';
import {
  formatErrorMessage,
  hasStatus,
  isGitHubNotFoundError,
} from '../src/errors.js';

describe('formatErrorMessage', () => {
  it('extracts message from Error instances', () => {
    expect(formatErrorMessage(new Error('something broke'))).toBe(
      'something broke',
    );
  });

  it('converts non-Error values to strings', () => {
    expect(formatErrorMessage('string error')).toBe('string error');
    expect(formatErrorMessage(42)).toBe('42');
    expect(formatErrorMessage(null)).toBe('null');
  });
});

describe('hasStatus', () => {
  it('returns true when error has matching numeric status', () => {
    const error = Object.assign(new Error('fail'), { status: 404 });
    expect(hasStatus(error, 404)).toBe(true);
  });

  it('returns false for mismatched status', () => {
    const error = Object.assign(new Error('fail'), { status: 500 });
    expect(hasStatus(error, 404)).toBe(false);
  });

  it('returns false for non-numeric status', () => {
    const error = Object.assign(new Error('fail'), { status: '404' });
    expect(hasStatus(error, 404)).toBe(false);
  });

  it('returns false for errors without status', () => {
    expect(hasStatus(new Error('fail'), 404)).toBe(false);
  });

  it('returns false for non-object values', () => {
    expect(hasStatus(null, 404)).toBe(false);
    expect(hasStatus(undefined, 404)).toBe(false);
    expect(hasStatus('string', 404)).toBe(false);
  });
});

describe('isGitHubNotFoundError', () => {
  it('detects HTTP 404 status', () => {
    const error = Object.assign(new Error('Not Found'), { status: 404 });
    expect(isGitHubNotFoundError(error)).toBe(true);
  });

  it('detects structured GraphQL NOT_FOUND type', () => {
    const error = Object.assign(new Error('GraphQL error'), {
      errors: [
        {
          type: 'NOT_FOUND',
          path: ['repository'],
          message:
            "Could not resolve to a Repository with the name 'owner/repo'.",
        },
      ],
    });
    expect(isGitHubNotFoundError(error)).toBe(true);
  });

  it('detects GraphQL NOT_FOUND type even without familiar message', () => {
    const error = Object.assign(new Error('Something unexpected'), {
      errors: [{ type: 'NOT_FOUND', message: 'Resource not found' }],
    });
    expect(isGitHubNotFoundError(error)).toBe(true);
  });

  it('falls back to message matching when no structured type', () => {
    const error = new Error(
      "Request failed due to following response errors:\n - Could not resolve to a Repository with the name 'owner/repo'.",
    );
    expect(isGitHubNotFoundError(error)).toBe(true);
  });

  it('returns false for non-404 HTTP errors', () => {
    const error = Object.assign(new Error('Server Error'), { status: 500 });
    expect(isGitHubNotFoundError(error)).toBe(false);
  });

  it('returns false for GraphQL errors with different type', () => {
    const error = Object.assign(new Error('Forbidden'), {
      errors: [{ type: 'FORBIDDEN', message: 'Not allowed' }],
    });
    expect(isGitHubNotFoundError(error)).toBe(false);
  });

  it('returns false for unrelated errors', () => {
    expect(isGitHubNotFoundError(new Error('Network timeout'))).toBe(false);
    expect(isGitHubNotFoundError('string error')).toBe(false);
  });

  it('handles errors with empty errors array', () => {
    const error = Object.assign(new Error('Empty errors'), { errors: [] });
    expect(isGitHubNotFoundError(error)).toBe(false);
  });
});
