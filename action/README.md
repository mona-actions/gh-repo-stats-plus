# gh-repo-stats-plus GitHub Action

A GitHub Action wrapper for [gh-repo-stats-plus](https://github.com/mona-actions/gh-repo-stats-plus) that allows you to gather repository statistics directly from your GitHub workflows. When targeting a single repository, the action also generates a markdown summary of the collected stats. Optionally, a migration audit can be run alongside stats collection.

> [!NOTE]
> This action is compatible with GitHub Enterprise (GHE) environments. To support GHE usage, all third-party actions referenced internally are pinned to specific commit SHAs to help avoid caching issues that can occur when resolving tags.

## Authentication

You must provide credentials using one of the following methods:

### Personal Access Token (PAT)

Provide a PAT via the `access-token` input. The token needs `repo` scope (or appropriate permissions for the target repositories).

### GitHub App

Provide both `github-app-id` and `github-app-private-key`. The action will automatically generate an installation token scoped to the target organization using [actions/create-github-app-token](https://github.com/actions/create-github-app-token).

In both cases, the `github-token` input (typically `${{ secrets.GITHUB_TOKEN }}`) is always required for runner-level operations. If you are running in a GHE environment and need to download dependencies from github.com, you can also provide `ghec-token`.

## Inputs

| Input | Description | Required | Default |
| --- | --- | --- | --- |
| `type` | Type of stats gathering: `repository`, `organization`, `project-stats`, `app-install-stats`, `package-stats`, `codespace-stats`, `migration-audit`, or `combine` | No | `repository` |
| `github-token` | GitHub token for authentication (e.g., `github.token`) | Yes | |
| `ghec-token` | GitHub Enterprise Cloud token (used to download dependencies from GHEC if not on github.com) | No | `""` |
| `access-token` | Personal access token with repo access for gathering stats | No | `""` |
| `github-app-id` | GitHub App ID for authentication (requires `github-app-private-key`) | No | `""` |
| `github-app-private-key` | GitHub App private key for authentication (requires `github-app-id`) | No | `""` |
| `organization` | Organization or owner name | Yes | |
| `repository` | Repository name (required if type is `repository`) | No | `""` |
| `output-dir` | Directory where output files will be stored | No | `output` |
| `run-migration-audit` | Whether to run migration audit (`true`/`false`) | No | `false` |
| `node-version` | Node.js version to use | No | `25` |
| `base-url` | GitHub API base URL | No | `https://api.github.com` |
| `skip-tls-verification` | Skip TLS certificate verification for the target GitHub instance (use for GHES with self-signed certs or IP-based access) | No | `false` |
| `retention-days` | Number of days to retain uploaded artifacts | No | `7` |
| `batch-size` | Number of repositories per batch (enables batch processing for large organizations). Cannot be combined with `repository` — batch mode generates its own repo list. | No | `""` |
| `batch-index` | Zero-based batch index (used with `batch-size` for parallel matrix jobs) | No | `""` |
| `batch-delay` | Delay in seconds multiplied by batch index to stagger API requests and avoid rate limits | No | `""` |
| `resume-from-last-save` | Resume from the last saved state. Auto-enabled when re-running failed jobs (`run_attempt > 1`). See [Resume Failed Runs](#resume-failed-runs). | No | `false` |
| `resume-run-id` | Workflow run ID to download state from (for cross-run resume). Defaults to the current run ID. | No | `""` |
| `run-post-process` | Whether to run post-process on output CSV to transform data using configurable rules (`true`/`false`). Requires `post-process-rules-file`. | No | `false` |
| `post-process-rules-file` | Path to the JSON rules configuration file for post-process (required when `run-post-process` is `true`). | No | `""` |
| `post-process-input` | Path to the input CSV file for post-process. Auto-detects from output directory if not specified. | No | `""` |
| `post-process-output-file-name` | Name for the post-process output CSV file (default: auto-generated with timestamp). | No | `""` |
| `run-rows-to-columns` | Whether to run rows-to-columns to pivot additional CSV rows into new columns (`true`/`false`). Requires `rows-to-columns-additional-csv-file`. | No | `false` |
| `rows-to-columns-base-csv-file` | Path to the base CSV file for rows-to-columns. Auto-detects from output directory if not specified. | No | `""` |
| `rows-to-columns-additional-csv-file` | Path to the additional CSV file for rows-to-columns (e.g., migration audit CSV). Required when `run-rows-to-columns` is `true`. | No | `""` |
| `rows-to-columns-header-column-keys` | Column in the additional CSV to use as new column headers. | No | `type` |
| `rows-to-columns-header-column-values` | Column in the additional CSV to use as cell values. | No | `message` |
| `rows-to-columns-base-csv-columns` | Comma-separated column names in the base CSV used for matching rows. | No | `Org_Name,Repo_Name` |
| `rows-to-columns-additional-csv-columns` | Comma-separated column names in the additional CSV used for matching rows. | No | `owner,name` |
| `rows-to-columns-output-file-name` | Name for the rows-to-columns output CSV file (default: auto-generated with timestamp). | No | `""` |
| `package-type` | Package type for package-stats (`maven`, `npm`, `docker`, `nuget`, `rubygems`, `pypi`). | No | `maven` |

## Outputs

| Output | Description |
| --- | --- |
| `output-dir` | Directory where output files are stored |
| `organization` | Organization name |
| `repository` | Repository name |
| `stats-file` | Path to the generated stats markdown file |
| `audit-file` | Path to the generated audit markdown file |
| `migration-audit` | Whether migration audit was run (`true`/`false`) |
| `artifact-id` | ID of the uploaded artifact containing the stats |

## Usage

### Single Repository

```yaml
name: Repo Stats

on:
  schedule:
    - cron: "0 0 * * 1" # weekly on Monday
  workflow_dispatch:

permissions:
  contents: read

jobs:
  stats:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Gather Repository Stats
        id: stats
        uses: mona-actions/gh-repo-stats-plus@v1
        with:
          github-token: ${{ github.token }}
          access-token: ${{ secrets.ACCESS_TOKEN }}
          organization: my-org
          repository: my-repo
          run-migration-audit: "true"

      - name: Print stats file path
        run: echo "Stats file: ${{ steps.stats.outputs.stats-file }}"
```

### Organization

```yaml
name: Org Stats

on:
  schedule:
    - cron: "0 0 * * 1"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  stats:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Gather Organization Stats
        id: stats
        uses: mona-actions/gh-repo-stats-plus@v1
        with:
          type: organization
          github-token: ${{ github.token }}
          access-token: ${{ secrets.ACCESS_TOKEN }}
          organization: my-org

      - name: Print artifact ID
        run: echo "Artifact ID: ${{ steps.stats.outputs.artifact-id }}"
```

### Using a GitHub App for Authentication

```yaml
- name: Gather Repository Stats
  uses: mona-actions/gh-repo-stats-plus@v1
  with:
    github-token: ${{ github.token }}
    github-app-id: ${{ secrets.APP_ID }}
    github-app-private-key: ${{ secrets.APP_PRIVATE_KEY }}
    organization: my-org
    repository: my-repo
```

### GitHub Enterprise

To use with a GitHub Enterprise instance, set the `base-url` input to your GHE API endpoint. If your GHE instance cannot reach github.com to download CLI extensions, provide `ghec-token` as well.

```yaml
- name: Gather Repository Stats (GHE)
  uses: mona-actions/gh-repo-stats-plus@v1
  with:
    github-token: ${{ github.token }}
    ghec-token: ${{ secrets.GHEC_TOKEN }}
    access-token: ${{ secrets.ACCESS_TOKEN }}
    organization: my-org
    repository: my-repo
    base-url: https://github.example.com/api/v3
```

### Batch Processing (Organization)

For large organizations, use batch processing with GitHub Actions matrix strategy to parallelize stats collection. This uses the `--batch-size`, `--batch-index`, and `--batch-delay` flags.

See [batch-organization-stats.yml](examples/batch-organization-stats.yml) for a complete workflow and the [batch processing docs](../docs/batch-processing.md) for more details.

### Combining Batch Results

Use `type: combine` to merge CSV files from multiple batch runs into a single file:

```yaml
- uses: actions/download-artifact@v4
  with:
    pattern: repo-stats-organization-*
    path: output
    merge-multiple: true

- name: Combine Results
  uses: mona-actions/gh-repo-stats-plus@v1
  with:
    type: combine
    github-token: ${{ github.token }}
    organization: my-org
```

### Resume Failed Runs

The action supports resuming from the last saved state when a stats collection run fails partway through. The underlying CLI writes state files and partial CSVs to the output directory after each successfully processed repository.

**Automatic resume (re-run failed jobs):** When you click "Re-run failed jobs" in the GitHub Actions UI, the action detects `run_attempt > 1` and automatically downloads the state artifact from the previous attempt. No configuration needed.

**Explicit resume (cross-run):** To resume from a completely different workflow run, provide the run ID:

```yaml
- name: Gather Organization Stats (resuming)
  uses: mona-actions/gh-repo-stats-plus@v1
  with:
    type: organization
    github-token: ${{ github.token }}
    access-token: ${{ secrets.ACCESS_TOKEN }}
    organization: my-org
    resume-from-last-save: "true"
    resume-run-id: "1234567890"
```

See [resume-stats.yml](examples/resume-stats.yml) for a complete workflow example.

### Project Stats

Collect ProjectsV2 statistics for all repositories in an organization.

```yaml
- name: Gather Project Stats
  uses: mona-actions/gh-repo-stats-plus@v1
  with:
    type: project-stats
    github-token: ${{ github.token }}
    access-token: ${{ secrets.ACCESS_TOKEN }}
    organization: my-org
```

### App Install Stats

Collect GitHub App installation statistics for an organization.

> [!IMPORTANT]
> This command requires a Personal Access Token (PAT) with `read:org` scope. GitHub App tokens cannot be used because app tokens can only see their own installation.

```yaml
- name: Gather App Install Stats
  uses: mona-actions/gh-repo-stats-plus@v1
  with:
    type: app-install-stats
    github-token: ${{ github.token }}
    access-token: ${{ secrets.ACCESS_TOKEN }}
    organization: my-org
```

### Package Stats

Collect package statistics (Maven, npm, Docker, NuGet, RubyGems, PyPI) for an organization.

```yaml
- name: Gather Package Stats
  uses: mona-actions/gh-repo-stats-plus@v1
  with:
    type: package-stats
    github-token: ${{ github.token }}
    access-token: ${{ secrets.ACCESS_TOKEN }}
    organization: my-org
    package-type: npm
```

### Codespace Stats

Collect codespace usage statistics for an organization.

```yaml
- name: Gather Codespace Stats
  uses: mona-actions/gh-repo-stats-plus@v1
  with:
    type: codespace-stats
    github-token: ${{ github.token }}
    access-token: ${{ secrets.ACCESS_TOKEN }}
    organization: my-org
```

### Post-Process

Optionally run post-process after any stats gathering to transform CSV data using configurable rules. Set `run-post-process: "true"` and provide a `post-process-rules-file`.

```yaml
- name: Gather Organization Stats with Post-Process
  uses: mona-actions/gh-repo-stats-plus@v1
  with:
    type: organization
    github-token: ${{ github.token }}
    access-token: ${{ secrets.ACCESS_TOKEN }}
    organization: my-org
    run-post-process: "true"
    post-process-rules-file: "post-process.rules.json"
```

See [post-process-stats.yml](examples/post-process-stats.yml) for a complete workflow and the [post-process docs](../docs/commands/post-process.md) for rules file format.

### Rows to Columns

Optionally run rows-to-columns to pivot rows from an additional CSV into new columns in the base stats CSV. Set `run-rows-to-columns: "true"` and provide `rows-to-columns-additional-csv-file`.

```yaml
- name: Gather Organization Stats with Rows-to-Columns
  uses: mona-actions/gh-repo-stats-plus@v1
  with:
    type: organization
    github-token: ${{ github.token }}
    access-token: ${{ secrets.ACCESS_TOKEN }}
    organization: my-org
    run-migration-audit: "true"
    run-rows-to-columns: "true"
    rows-to-columns-additional-csv-file: "output/my-org-audit.csv"
```

See [rows-to-columns-stats.yml](examples/rows-to-columns-stats.yml) for a complete workflow and the [rows-to-columns docs](../docs/commands/rows-to-columns.md) for details.

### Combined Pipeline (Post-Process + Rows to Columns)

Both post-process and rows-to-columns can be used together. When both are enabled, post-process runs first, then rows-to-columns picks up the post-process output.

```yaml
- name: Gather Stats with Full Pipeline
  uses: mona-actions/gh-repo-stats-plus@v1
  with:
    type: combine
    github-token: ${{ github.token }}
    organization: my-org
    run-post-process: "true"
    post-process-rules-file: "post-process.rules.json"
    run-rows-to-columns: "true"
    rows-to-columns-additional-csv-file: "output/my-org-audit.csv"
```

## Examples

The [examples/](examples/) directory contains complete workflow files:

- [Repository Stats](examples/repository-stats.yml) — Single repository on a weekly schedule
- [Organization Stats](examples/organization-stats.yml) — All repositories in an organization
- [Batch Organization Stats](examples/batch-organization-stats.yml) — Batch processing with matrix strategy
- [Project Stats](examples/project-stats.yml) — ProjectsV2 statistics
- [App Install Stats](examples/app-install-stats.yml) — GitHub App installation statistics
- [Resume Stats](examples/resume-stats.yml) — Resume failed stats collection runs
- [Post-Process Stats](examples/post-process-stats.yml) — Post-process with rules file
- [Rows to Columns Stats](examples/rows-to-columns-stats.yml) — Pivot audit rows into columns
- [Issue Ops](examples/issue-ops/) — IssueOps pattern for triggering stats via issue comments

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

## License

See [LICENSE](../LICENSE) for details.
