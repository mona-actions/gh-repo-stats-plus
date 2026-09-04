import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  aggregateReports,
  generateRecommendations,
  prepareAudit,
  reconcileChunk,
} from '../../analysis/compare-repos-data.js';

const AUDIT_HEADER =
  'repo_name,source_org,source_url,migrated_to_org,target_org,migration_status,migration_issue,target_url,visibility_in_target,archived_in_target,created_at_in_target,locked_in_source,has_open_secret_scan_alerts,notes\n';

function tempDirectory(): string {
  return mkdtempSync(join(tmpdir(), 'compare-repos-'));
}

describe('compare-repos data helper', () => {
  it('selects valid mappings and reports missing targets', () => {
    const root = tempDirectory();
    const audit = join(root, 'audit.csv');
    const runDir = join(root, 'run');
    writeFileSync(
      audit,
      AUDIT_HEADER +
        [
          'repo-a,source,https://github.com/source/repo-a,target,target,in-progress,1,https://target.ghe.com/target/repo-a,private,false,2026-01-01T00:00:00Z,false,false,',
          'repo-b,source,https://github.com/source/repo-b,,none,in-progress,2,,,,,false,false,',
          'repo-c,source,https://github.com/source/repo-c,target,target,success,3,https://target.ghe.com/target/repo-c,private,false,2026-01-01T00:00:00Z,true,false,',
        ].join('\n') +
        '\n',
    );

    const summary = prepareAudit({
      audit,
      runDir,
      status: 'in-progress',
      sourceOrg: 'source',
      sourceHost: 'github.com',
      sourceApiUrl: 'https://api.github.com',
      targetOrg: 'target',
      targetHost: 'target.ghe.com',
      targetApiUrl: 'https://target.ghe.com/api/v3',
      sizeTolerancePct: '10',
      chunkSize: 50,
      force: false,
    });

    expect(summary).toEqual({
      selected: 2,
      valid: 1,
      missingTarget: 1,
      invalid: 0,
      unlockedSource: 2,
      chunks: 1,
    });
    expect(
      readFileSync(join(runDir, 'chunks/chunk-000/source-repos.txt'), 'utf8'),
    ).toBe('source/repo-a\n');
    expect(
      readFileSync(join(runDir, 'chunks/chunk-000/target-repos.txt'), 'utf8'),
    ).toBe('target/repo-a\n');
  });

  it('keeps collection failures out of clean outcomes', () => {
    const root = tempDirectory();
    const runDir = join(root, 'run');
    const chunkDir = join(runDir, 'chunks/chunk-000');
    mkdirSync(join(chunkDir, 'source'), { recursive: true });
    mkdirSync(join(chunkDir, 'target'), { recursive: true });
    writeFileSync(
      join(chunkDir, 'mapping.csv'),
      [
        'repo_name,source_org,target_org,source_url,target_url,migration_issue,locked_in_source,created_at_in_target',
        'clean-repo,source,target,https://github.com/source/clean-repo,https://target.ghe.com/target/clean-repo,1,true,2026-01-01',
        'missing-repo,source,target,https://github.com/source/missing-repo,https://target.ghe.com/target/missing-repo,2,false,2026-01-01',
      ].join('\n') + '\n',
    );
    const sourceStats = join(chunkDir, 'source/source-stats.csv');
    const targetStats = join(chunkDir, 'target/target-stats.csv');
    writeFileSync(
      sourceStats,
      'Org_Name,Repo_Name,Description\nsource,clean-repo,\"contains, comma\"\n',
    );
    writeFileSync(
      targetStats,
      'Org_Name,Repo_Name,Description\ntarget,clean-repo,\"contains, comma\"\n',
    );

    expect(reconcileChunk(chunkDir, sourceStats, targetStats)).toBe(1);
    writeFileSync(
      join(chunkDir, 'diff.csv'),
      'Repo_Name,Source_Org,Target_Org,Column,Source_Value,Target_Value,Delta,Severity,Status\n',
    );
    writeFileSync(join(chunkDir, 'comparison.complete'), '');
    writeFileSync(join(runDir, 'chunk-count.txt'), '1\n');
    writeFileSync(
      join(runDir, 'preparation-summary.json'),
      JSON.stringify({
        selected: 2,
        valid: 2,
        missingTarget: 0,
        invalid: 0,
        unlockedSource: 1,
        chunks: 1,
      }),
    );
    writeFileSync(
      join(runDir, 'audit-validation-failures.csv'),
      'repo_name,source_org,target_org,source_url,target_url,migration_issue,locked_in_source,created_at_in_target,reason\n',
    );

    const counts = aggregateReports(runDir);

    expect(counts.clean).toBe(1);
    expect(counts['failed-or-skipped']).toBe(1);
    expect(
      readFileSync(join(runDir, 'reports/failed-or-skipped.csv'), 'utf8'),
    ).toContain('missing-repo');
  });

  it('joins spreadsheet-protected repository names back to mappings', () => {
    const root = tempDirectory();
    const runDir = join(root, 'run');
    const chunkDir = join(runDir, 'chunks/chunk-000');
    mkdirSync(chunkDir, { recursive: true });
    writeFileSync(
      join(chunkDir, 'mapping.csv'),
      [
        'repo_name,source_org,target_org,source_url,target_url,migration_issue,locked_in_source,created_at_in_target',
        '-dash-repo,source,target,https://github.com/source/-dash-repo,https://target.ghe.com/target/-dash-repo,1,true,2026-01-01',
      ].join('\n') + '\n',
    );
    writeFileSync(
      join(chunkDir, 'diff.csv'),
      [
        'Repo_Name,Source_Org,Target_Org,Column,Source_Value,Target_Value,Delta,Severity,Status',
        "'-dash-repo,source,target,Issue_Count,10,3,-7,blocking,matched",
      ].join('\n') + '\n',
    );
    writeFileSync(join(chunkDir, 'comparison.complete'), '');
    writeFileSync(
      join(chunkDir, 'collection-failures.csv'),
      [
        'repo_name,source_org,target_org,source_url,target_url,migration_issue,locked_in_source,created_at_in_target,reason',
        '',
      ].join('\n'),
    );
    writeFileSync(join(runDir, 'chunk-count.txt'), '1\n');
    writeFileSync(
      join(runDir, 'preparation-summary.json'),
      JSON.stringify({
        selected: 1,
        valid: 1,
        missingTarget: 0,
        invalid: 0,
        unlockedSource: 0,
        chunks: 1,
      }),
    );
    writeFileSync(
      join(runDir, 'audit-validation-failures.csv'),
      'repo_name,source_org,target_org,source_url,target_url,migration_issue,locked_in_source,created_at_in_target,reason\n',
    );

    const counts = aggregateReports(runDir);

    expect(counts.clean).toBe(0);
    expect(counts.blocking).toBe(1);
  });

  it('requires force when chunk configuration changes', () => {
    const root = tempDirectory();
    const audit = join(root, 'audit.csv');
    const runDir = join(root, 'run');
    writeFileSync(
      audit,
      AUDIT_HEADER +
        'repo-a,source,https://github.com/source/repo-a,target,target,in-progress,1,https://target.ghe.com/target/repo-a,private,false,2026-01-01T00:00:00Z,true,false,\n',
    );
    const baseOptions = {
      audit,
      runDir,
      status: 'in-progress',
      sourceOrg: 'source',
      sourceHost: 'github.com',
      sourceApiUrl: 'https://api.github.com',
      targetOrg: 'target',
      targetHost: 'target.ghe.com',
      targetApiUrl: 'https://target.ghe.com/api/v3',
      sizeTolerancePct: '10',
      chunkSize: 1,
      force: false,
    };
    prepareAudit(baseOptions);

    expect(() => prepareAudit({ ...baseOptions, chunkSize: 2 })).toThrow(
      /configuration changed/,
    );
  });

  it('recommends content migration when target counts have grown', () => {
    const root = tempDirectory();
    const runDir = join(root, 'run');
    const reportsDir = join(runDir, 'reports');
    mkdirSync(reportsDir, { recursive: true });
    const outcomeHeader =
      'repo_name,source_org,target_org,locked_in_source,created_at_in_target,outcome,highest_severity,finding_count,blocking_count,warning_count,info_count,raw_diff_file,reason\n';
    const emptyOutcome = outcomeHeader;
    for (const report of [
      'clean',
      'blocking',
      'missing-in-target',
      'extra-in-target',
      'failed-or-skipped',
    ]) {
      writeFileSync(join(reportsDir, `${report}.csv`), emptyOutcome);
    }
    writeFileSync(
      join(reportsDir, 'warning-only.csv'),
      outcomeHeader +
        'repo-a,source,target,true,2026-01-01,warning-only,warning,1,0,1,0,diff.csv,\n',
    );
    writeFileSync(
      join(reportsDir, 'diff-all.csv'),
      'Repo_Name,Source_Org,Target_Org,Column,Source_Value,Target_Value,Delta,Severity,Status\n' +
        'repo-a,source,target,Issue_Count,2,4,+2,warning,matched\n',
    );

    const counts = generateRecommendations(runDir);

    expect(counts).toEqual({ 'move-on': 1 });
    expect(
      readFileSync(join(reportsDir, 'migration-recommendations.csv'), 'utf8'),
    ).toContain('repo-a,source,target,warning-only,migrated,move-on,review');
  });

  it('separates content loss from Git fidelity loss', () => {
    const root = tempDirectory();
    const runDir = join(root, 'run');
    const reportsDir = join(runDir, 'reports');
    mkdirSync(reportsDir, { recursive: true });
    const outcomeHeader =
      'repo_name,source_org,target_org,locked_in_source,created_at_in_target,outcome,highest_severity,finding_count,blocking_count,warning_count,info_count,raw_diff_file,reason\n';
    for (const report of [
      'clean',
      'warning-only',
      'missing-in-target',
      'extra-in-target',
      'failed-or-skipped',
    ]) {
      writeFileSync(join(reportsDir, `${report}.csv`), outcomeHeader);
    }
    writeFileSync(
      join(reportsDir, 'blocking.csv'),
      outcomeHeader +
        'repo-b,source,target,false,2026-01-01,blocking,blocking,1,1,0,0,diff.csv,\n' +
        'repo-c,source,target,false,2026-01-01,blocking,blocking,1,1,0,0,diff.csv,\n',
    );
    writeFileSync(
      join(reportsDir, 'diff-all.csv'),
      'Repo_Name,Source_Org,Target_Org,Column,Source_Value,Target_Value,Delta,Severity,Status\n' +
        'repo-b,source,target,Issue_Count,10,4,-6,blocking,matched\n' +
        'repo-c,source,target,git_default_branch_sha,old,new,,blocking,matched\n',
    );

    generateRecommendations(runDir);

    const recommendations = readFileSync(
      join(reportsDir, 'migration-recommendations.csv'),
      'utf8',
    );
    expect(recommendations).toContain(
      'repo-b,source,target,blocking,review,investigate-content-loss,blocked',
    );
    expect(recommendations).toContain(
      'repo-c,source,target,blocking,migrated,move-on,blocked',
    );
  });

  it('marks repositories without target mappings as missing', () => {
    const root = tempDirectory();
    const runDir = join(root, 'run');
    const reportsDir = join(runDir, 'reports');
    mkdirSync(reportsDir, { recursive: true });
    const outcomeHeader =
      'repo_name,source_org,target_org,locked_in_source,created_at_in_target,outcome,highest_severity,finding_count,blocking_count,warning_count,info_count,raw_diff_file,reason\n';
    for (const report of [
      'clean',
      'blocking',
      'warning-only',
      'missing-in-target',
      'extra-in-target',
      'failed-or-skipped',
    ]) {
      writeFileSync(join(reportsDir, `${report}.csv`), outcomeHeader);
    }
    writeFileSync(
      join(reportsDir, 'diff-all.csv'),
      'Repo_Name,Source_Org,Target_Org,Column,Source_Value,Target_Value,Delta,Severity,Status\n',
    );
    writeFileSync(
      join(runDir, 'skipped-missing-target.csv'),
      'repo_name,source_org,target_org,source_url,target_url,migration_issue,locked_in_source,created_at_in_target,reason\n' +
        'repo-d,source,none,https://github.com/source/repo-d,,1,false,,No usable target mapping\n',
    );

    const counts = generateRecommendations(runDir);

    expect(counts).toEqual({ 'not-migrated': 1 });
    expect(
      readFileSync(join(reportsDir, 'migration-recommendations.csv'), 'utf8'),
    ).toContain(
      'repo-d,source,none,missing-in-target,missing,not-migrated,missing',
    );
  });
});
