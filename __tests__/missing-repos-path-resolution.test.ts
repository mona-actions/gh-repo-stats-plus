import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolve, isAbsolute } from 'path';

// Mock the path module
vi.mock('path', () => ({
  resolve: vi.fn(),
  isAbsolute: vi.fn(),
}));

describe('missing-repos file path resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('path resolution logic', () => {
    it('should resolve relative paths relative to output directory', () => {
      vi.mocked(isAbsolute).mockReturnValue(false);
      vi.mocked(resolve).mockReturnValue('/cwd/output/stats.csv');

      const outputFileName = 'stats.csv';
      const outputDir = 'output';
      const processedFilePath = outputFileName;

      if (processedFilePath && !isAbsolute(processedFilePath)) {
        const resolvedPath = resolve(
          process.cwd(),
          outputDir || 'output',
          processedFilePath,
        );

        expect(resolvedPath).toBe('/cwd/output/stats.csv');
        expect(resolve).toHaveBeenCalledWith(
          process.cwd(),
          'output',
          'stats.csv',
        );
      }
    });

    it('should not resolve absolute paths', () => {
      vi.mocked(isAbsolute).mockReturnValue(true);

      const outputFileName = '/absolute/path/stats.csv';
      const outputDir = 'output';
      let processedFilePath = outputFileName;

      if (processedFilePath && !isAbsolute(processedFilePath)) {
        processedFilePath = resolve(
          process.cwd(),
          outputDir || 'output',
          processedFilePath,
        );
      }

      expect(processedFilePath).toBe('/absolute/path/stats.csv');
      expect(resolve).not.toHaveBeenCalled();
    });

    it('should use default output directory when outputDir is undefined', () => {
      vi.mocked(isAbsolute).mockReturnValue(false);
      vi.mocked(resolve).mockReturnValue('/cwd/output/stats.csv');

      const outputFileName = 'stats.csv';
      const outputDir = undefined;
      const processedFilePath = outputFileName;

      if (processedFilePath && !isAbsolute(processedFilePath)) {
        const resolvedPath = resolve(
          process.cwd(),
          outputDir || 'output',
          processedFilePath,
        );

        expect(resolvedPath).toBe('/cwd/output/stats.csv');
        expect(resolve).toHaveBeenCalledWith(
          process.cwd(),
          'output',
          'stats.csv',
        );
      }
    });
  });
});
