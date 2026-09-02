# compare-stats Command

Compares two repo-stats CSV files — one collected from a migration **source** and one from the **target** — by joining on `Repo_Name` and reporting per-column differences. It is designed to verify GitHub Enterprise Importer (GEI) migrations, including migrations from `github.com` to GitHub Enterprise Cloud with data residency (`*.ghe.com`).

## Basic Syntax

```bash
gh repo-stats-plus compare-stats [options]
```

## Migration Verification Workflow

1. Collect stats from the source organization:

   ```bash
   gh repo-stats-plus repo-stats \
     --org-name source-org \
     --base-url https://api.github.com \
     --output-dir output/source
   ```

2. Collect stats from the target tenant:

   ```bash
   gh repo-stats-plus repo-stats \
     --org-name target-org \
     --base-url https://api.<subdomain>.ghe.com \
     --output-dir output/target
   ```

3. Diff the two CSV files:

   ```bash
   gh repo-stats-plus compare-stats \
     --source-file output/source/source-org-all_repos-<ts>_ts.csv \
     --target-file output/target/target-org-all_repos-<ts>_ts.csv \
     --output-dir output \
     --output-file migration-diff.csv \
     --fail-on-blocking
   ```

4. Optionally supplement the count-based diff with a live git ref/SHA comparison (see [Git-Level Verification](#git-level-verification)).

## Options

### Comparison

- `--source-file <path>`: Repo-stats CSV produced from the source organization (required)
- `--target-file <path>`: Repo-stats CSV produced from the target organization (required)
- `--output-dir <dir>`: Output directory for the diff report (Default: `output`)
- `--output-file <name>`: Name for the diff report CSV (Default: auto-generated with timestamp)
- `--size-tolerance-pct <percent>`: Tolerance applied to `Repo_Size_mb` before reporting a difference (Default: `10`)
- `--fail-on-blocking`: Exit with a non-zero status code when any blocking finding is reported (useful for gating CI)
- `-v, --verbose`: Enable verbose logging

### Git-level verification

- `--verify-git`: Additionally compare branch and tag SHAs live against both hosts
- `--source-org <org>`: Source organization name (required with `--verify-git`)
- `--target-org <org>`: Target organization name (required with `--verify-git`)
- `--source-base-url <url>`: GitHub API base URL for the source (Default: `https://api.github.com`)
- `--target-base-url <url>`: GitHub API base URL for the target (e.g. `https://api.<subdomain>.ghe.com`)
- `--source-token <token>`: Access token for the source host (falls back to `ACCESS_TOKEN` / `GH_TOKEN` / `GITHUB_TOKEN`)
- `--target-token <token>`: Access token for the target host (falls back to `ACCESS_TOKEN` / `GH_TOKEN` / `GITHUB_TOKEN`)
- `--proxy-url <url>`: Proxy URL if required
- `--ca-cert-path <path>`: Path to a CA certificate bundle (PEM) for TLS verification
- `--api-version <version>`: GitHub API version to use
- `--page-size <size>`: Number of git refs requested per API page (Default: `100`)
- `--rate-limit-check-interval <count>`: Repositories processed between rate limit checks (Default: `10`)

All options can also be supplied via environment variables (`SOURCE_FILE`, `TARGET_FILE`, `OUTPUT_DIR`, `OUTPUT_FILE`, `SIZE_TOLERANCE_PCT`, `FAIL_ON_BLOCKING`, `VERIFY_GIT`, `SOURCE_ORG`, `TARGET_ORG`, `SOURCE_BASE_URL`, `TARGET_BASE_URL`, `SOURCE_TOKEN`, `TARGET_TOKEN`).

## How the Comparison Works

### Join

- Rows are joined on `Repo_Name` only, lowercased and trimmed on both sides.
- Blank repository names are skipped. Duplicate normalized repository names in either file cause the comparison to fail rather than producing an ambiguous report.
- `Org_Name` is **not** part of the join key because the source and target organizations usually have different names. Both org names are included in the report for context.
- Three categories are reported:
  - **matched** — the repository exists on both sides; each differing column becomes a row
  - **missing_in_target** — present in the source, absent in the target (blocking)
  - **extra_in_target** — present in the target, absent in the source (warning)

### Severity classification

**Blocking** (a negative delta indicates potential data loss):

`Issue_Count`, `PR_Count`, `Record_Count`, `Branch_Count`, `Tag_Count`, `Release_Count`, `Issue_Comment_Count`, `Issue_Event_Count`, `PR_Review_Count`, `PR_Review_Comment_Count`, `Commit_Comment_Count`, `Milestone_Count`, `Discussion_Count`

Positive deltas for these columns are reported as warnings because additional target-side activity is not data loss.

**Informational** (GEI does not migrate these, so the target is commonly `0` until recreated):

`Protected_Branch_Count`, `Ruleset_Count`, `Collaborator_Count`, `Project_Count`, `Star_Count`, `Fork_Count`, `Watcher_Count`, `Repo_Size_mb` (subject to `--size-tolerance-pct`, since repacking can legitimately change repo size)

**Warning** (settings/boolean/string columns compared for equality):

`Default_Branch`, `Visibility`, `Has_Wiki`, `Has_LFS`, `isArchived`, `isTemplate`, `isFork`, `Is_Empty`, `Description`, `Homepage_URL`, `Topics`, `License`, `Primary_Language`, `Auto_Merge_Allowed`, `Delete_Branch_On_Merge`, `Merge_Commit_Allowed`, `Squash_Merge_Allowed`, `Rebase_Merge_Allowed`

Boolean values are written as uppercase `TRUE`/`FALSE` by repo-stats and are normalized before comparison.

**Excluded** columns (always expected to differ, no signal): `Org_Name`, `Full_URL`, `Created`, `Last_Push`, `Last_Update`, `Migration_Issue`

## Git-Level Verification

Counts alone cannot detect diverged history when branch and tag counts happen to match. With `--verify-git`, each matched repository is additionally checked live against both hosts:

```bash
gh repo-stats-plus compare-stats \
  --source-file output/source-stats.csv \
  --target-file output/target-stats.csv \
  --verify-git \
  --source-org source-org \
  --target-org target-org \
  --source-base-url https://api.github.com \
  --target-base-url https://api.<subdomain>.ghe.com \
  --source-token "$SOURCE_TOKEN" \
  --target-token "$TARGET_TOKEN" \
  --fail-on-blocking
```

- Branch (`refs/heads/`) and tag (`refs/tags/`) refs are fetched with pagination from both hosts and compared as `name -> sha` maps.
- The default branch name and tip SHA are compared explicitly — the highest-signal single check.
- Findings are written into the **same report** using the `Column` field, e.g. `git_ref:refs/heads/main`, `git_default_branch`, and `git_default_branch_sha`.
- Refs missing from the target and mismatched SHAs are **blocking**; refs only present on the target are **warnings**; a differing default branch name is a **warning**.
- Repositories that are empty or inaccessible on one side are logged and skipped rather than failing the run. Rate limits are checked on both clients at the configured interval.

## Output

The report is a long/tidy CSV — one row per repository per differing column — with these columns:

| Column         | Description                                                    |
| -------------- | -------------------------------------------------------------- |
| `Repo_Name`    | Normalized repository name                                     |
| `Source_Org`   | Organization name from the source CSV                          |
| `Target_Org`   | Organization name from the target CSV                          |
| `Column`       | The differing column (or `Repo` / `git_ref:<ref>` findings)    |
| `Source_Value` | Value observed on the source                                   |
| `Target_Value` | Value observed on the target                                   |
| `Delta`        | Signed numeric delta (target − source); blank for non-numerics |
| `Severity`     | `blocking`, `warning`, or `info`                               |
| `Status`       | `matched`, `missing_in_target`, or `extra_in_target`           |

A human-readable summary is also written to the console and log file: totals compared, repositories matched cleanly, repositories with blocking differences, missing/extra repositories, and the worst offenders by blocking finding count.

## Known Gaps

A clean report does **not** mean the migration is complete. This command compares only what repo-stats collects, so the following still require separate verification:

- Mannequin/attribution status (unclaimed mannequins after a data residency migration)
- Actions secrets, variables, and environments
- Webhooks and deploy keys
- Actions workflow run history and artifacts
- GitHub Packages content
- Code scanning, Dependabot, and secret scanning alerts
- Branch protection rules and rulesets (counted, but not compared rule-by-rule)
- Issue/PR body content, including `user-attachments` URLs that may not resolve on the target
