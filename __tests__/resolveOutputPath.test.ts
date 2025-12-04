import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveOutputPath } from '../src/utils.js';
import { mkdir } from 'fs/promises';
import { resolve } from 'path';

// Mock fs modules
vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  mkdir: vi.fn(),
}));

vi.mock('path', () => ({
  resolve: vi.fn(),
}));

describe('resolveOutputPath', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create directory and return full path', async () => {
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(resolve)
      .mockReturnValueOnce('/current/working/dir/output') // for fullOutputDir
      .mockReturnValueOnce('/current/working/dir/output/test.csv'); // for final path

    const result = await resolveOutputPath('output', 'test.csv');

    expect(mkdir).toHaveBeenCalledWith('/current/working/dir/output', {
      recursive: true,
    });
    expect(result).toBe('/current/working/dir/output/test.csv');
  });

  it('should handle mkdir gracefully when directory already exists', async () => {
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(resolve)
      .mockReturnValueOnce('/current/working/dir/output') // for fullOutputDir
      .mockReturnValueOnce('/current/working/dir/output/test.csv'); // for final path

    const result = await resolveOutputPath('output', 'test.csv');

    expect(mkdir).toHaveBeenCalledWith('/current/working/dir/output', {
      recursive: true,
    });
    expect(result).toBe('/current/working/dir/output/test.csv');
  });

  it('should use default output directory when not specified', async () => {
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(resolve)
      .mockReturnValueOnce('/current/working/dir/output') // for fullOutputDir
      .mockReturnValueOnce('/current/working/dir/output/test.csv'); // for final path

    const result = await resolveOutputPath(undefined, 'test.csv');

    expect(mkdir).toHaveBeenCalledWith('/current/working/dir/output', {
      recursive: true,
    });
    expect(result).toBe('/current/working/dir/output/test.csv');
  });
});
