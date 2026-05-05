import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('gh CLI wrapper', () => {
  it('exports the invocation directory before changing to the extension directory', () => {
    const wrapper = readFileSync(resolve('gh-repo-stats-plus'), 'utf-8');
    const exportIndex = wrapper.indexOf(
      'export GH_REPO_STATS_PLUS_INVOCATION_DIR="$PWD"',
    );
    const cdIndex = wrapper.indexOf('cd "$SCRIPT_DIR"');

    expect(exportIndex).toBeGreaterThan(-1);
    expect(cdIndex).toBeGreaterThan(-1);
    expect(exportIndex).toBeLessThan(cdIndex);
  });
});
