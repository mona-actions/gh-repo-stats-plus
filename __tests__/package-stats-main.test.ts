import { describe, it, expect } from 'vitest';
import { packageDetailToResult } from '../src/packages.js';
import { PackageDetail } from '../src/types.js';

describe('packageDetailToResult', () => {
  it('should map a full package detail to a result', () => {
    const pkg: PackageDetail = {
      name: 'com.example:my-lib',
      packageType: 'MAVEN',
      repository: {
        name: 'my-repo',
        isArchived: false,
        visibility: 'PRIVATE',
      },
      statistics: { downloadsTotalCount: 42 },
      latestVersion: {
        files: {
          nodes: [
            {
              name: 'my-lib-1.0.jar',
              size: 2048,
              updatedAt: '2025-06-15T10:00:00Z',
            },
            {
              name: 'my-lib-1.0.pom',
              size: 512,
              updatedAt: '2025-06-15T10:00:00Z',
            },
          ],
          totalCount: 2,
          pageInfo: { hasNextPage: false, endCursor: null },
        },
        version: '1.0.0',
      },
      versions: { totalCount: 5 },
    };

    const result = packageDetailToResult('my-org', pkg, 20, 50000, 5);

    expect(result.Org_Name).toBe('my-org');
    expect(result.Package_Name).toBe('com.example:my-lib');
    expect(result.Package_Type).toBe('MAVEN');
    expect(result.Repo_Name).toBe('my-repo');
    expect(result.Repo_Archived).toBe(false);
    expect(result.Repo_Visibility).toBe('PRIVATE');
    expect(result.Downloads_Count).toBe(42);
    expect(result.Last_Published).toBe('2025-06-15T10:00:00Z');
    expect(result.Latest_Version).toBe('1.0.0');
    expect(result.Latest_Version_Size_Bytes).toBe(2560); // 2048 + 512
    expect(result.Total_Versions).toBe(5);
    expect(result.Total_Files).toBe(20);
    expect(result.Total_Size_Bytes).toBe(50000);
  });

  it('should handle package with no repository', () => {
    const pkg: PackageDetail = {
      name: 'orphan-pkg',
      packageType: 'NPM',
      repository: null,
      statistics: { downloadsTotalCount: 0 },
      latestVersion: null,
      versions: { totalCount: 0 },
    };

    const result = packageDetailToResult('org', pkg, 0, 0, 0);

    expect(result.Repo_Name).toBe('N/A');
    expect(result.Repo_Archived).toBe(false);
    expect(result.Repo_Visibility).toBe('N/A');
    expect(result.Downloads_Count).toBe(0);
    expect(result.Last_Published).toBe('N/A');
    expect(result.Latest_Version).toBe('N/A');
    expect(result.Latest_Version_Size_Bytes).toBe(0);
    expect(result.Latest_Version_Size).toContain('0');
  });

  it('should handle package with latest version but no files', () => {
    const pkg: PackageDetail = {
      name: 'empty-files-pkg',
      packageType: 'MAVEN',
      repository: {
        name: 'some-repo',
        isArchived: true,
        visibility: 'PUBLIC',
      },
      statistics: { downloadsTotalCount: 10 },
      latestVersion: {
        files: {
          nodes: [],
          totalCount: 0,
          pageInfo: { hasNextPage: false, endCursor: null },
        },
        version: '2.0.0',
      },
      versions: { totalCount: 2 },
    };

    const result = packageDetailToResult('org', pkg, 5, 10000, 2);

    expect(result.Repo_Archived).toBe(true);
    expect(result.Repo_Visibility).toBe('PUBLIC');
    expect(result.Latest_Version).toBe('2.0.0');
    expect(result.Last_Published).toBe('N/A');
    expect(result.Latest_Version_Size_Bytes).toBe(0);
  });

  it('should format sizes correctly', () => {
    const pkg: PackageDetail = {
      name: 'large-pkg',
      packageType: 'MAVEN',
      repository: {
        name: 'repo',
        isArchived: false,
        visibility: 'INTERNAL',
      },
      statistics: { downloadsTotalCount: 100 },
      latestVersion: {
        files: {
          nodes: [
            {
              name: 'large.jar',
              size: 1048576,
              updatedAt: '2025-01-01T00:00:00Z',
            },
          ],
          totalCount: 1,
          pageInfo: { hasNextPage: false, endCursor: null },
        },
        version: '3.0.0',
      },
      versions: { totalCount: 1 },
    };

    const result = packageDetailToResult(
      'org',
      pkg,
      10,
      1073741824, // 1 GB
      1,
    );

    expect(result.Latest_Version_Size_Bytes).toBe(1048576);
    expect(result.Latest_Version_Size).toBe('1.00 MB');
    expect(result.Total_Size_Bytes).toBe(1073741824);
    expect(result.Total_Size).toBe('1.00 GB');
  });
});
