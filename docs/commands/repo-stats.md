# repo-stats Command

Collects comprehensive statistics for all repositories in a GitHub organization.

## Basic Syntax

```bash
gh repo-stats-plus repo-stats [options]
```

## Options

### Core Options

- `-o, --org-name <org>`: The name of the organization to process (Required)
- `-t, --access-token <token>`: GitHub access token
- `-u, --base-url <url>`: GitHub API base URL (Default: `https://api.github.com`)
- `--proxy-url <url>`: Proxy URL if required
- `--ca-cert <path>`: Path to CA certificate bundle (PEM) for TLS verification (e.g. GHES with internal CA, Env: `NODE_EXTRA_CA_CERTS`)
- `--api-version <version>`: GitHub API version to use (`2022-11-28` or `2026-03-10`, Default: `2022-11-28`, Env: `GITHUB_API_VERSION`)
- `-v, --verbose`: Enable verbose logging

### GitHub App Authentication

- `--app-id <id>`: GitHub App ID
- `--private-key <key>`: GitHub App private key
- `--private-key-file <file>`: Path to GitHub App private key file
- `--app-installation-id <id>`: GitHub App installation ID (optional — automatically looked up if omitted)

### Performance

- `--page-size <size>`: Number of items per page (Default: 10)
- `--extra-page-size <size>`: Extra page size (Default: 25)
- `--rate-limit-check-interval <seconds>`: Interval for rate limit checks (Default: 60)

### Retry Logic

- `--retry-max-attempts <attempts>`: Maximum number of retry attempts (Default: 3)
- `--retry-initial-delay <milliseconds>`: Initial delay for retry (Default: 1000)
- `--retry-max-delay <milliseconds>`: Maximum delay for retry (Default: 30000)
- `--retry-backoff-factor <factor>`: Backoff factor for retry delays (Default: 2)
- `--retry-success-threshold <count>`: Successful operations before resetting retry count (Default: 5)

### Processing Options

- `--resume-from-last-save`: Resume from the last saved state
- `--repo-list <file>`: Path to file containing list of repositories to process (format: owner/repo_name)
- `--auto-process-missing`: Automatically process any missing repositories when main processing is complete
- `--output-dir <dir>`: Output directory for generated files and state files (Default: output)
- `--clean-state`: Remove state file after successful completion

### Batch Processing

- `--batch-size <size>`: Number of repositories per batch. Fetches the full repo list for the org and processes only the slice for the given batch index.
- `--batch-index <index>`: Zero-based batch index to process (Default: 0). Requires `--batch-size`.
- `--batch-delay <seconds>`: Stagger delay in seconds per batch index before starting (Default: 0). For example, with `--batch-delay 10`, batch 0 starts immediately, batch 1 waits 10s, batch 2 waits 20s, etc. Useful when launching multiple batches simultaneously to avoid API bursts.
- `--batch-repo-list-file <file>`: Path to a pre-fetched repository list (one entry per line, `owner/repo` or bare repo name; `#` comments allowed). When provided, batches read from this file instead of paginating the org's repos for every batch. Requires `--batch-size`.

Batch mode cannot be used with `--org-list` or `--repo-list`.

#### When to use `--batch-repo-list-file`

By default, every batch independently paginates the org's repository list before processing its slice. For large organizations split across many parallel matrix jobs, those redundant pagination calls multiply (`ceil(repo_count / page_size) × N batches`) and can quickly exhaust the GitHub App installation rate limit.

Workflow that fetches the list once and reuses it across batches:

1. A `setup` job fetches the org's repos once and writes them to `repos.txt`, then uploads it as an artifact.
2. The matrix `collect` jobs each download the artifact and pass the file path via `--batch-repo-list-file`.
3. Each batch reads from the file and slices to its `--batch-index`. No org-list pagination occurs in the matrix jobs.

## Examples

### Basic Usage

```bash
gh repo-stats-plus repo-stats --org-name github
```

### With Personal Access Token

```bash
gh repo-stats-plus repo-stats --org-name github --access-token ghp_xxxxxxxxxxxx
```

### With GitHub App

```bash
# Installation ID is auto-looked up when omitted
gh repo-stats-plus repo-stats \
  --org-name github \
  --app-id 12345 \
  --private-key-file /path/to/key.pem

# Or provide it explicitly to skip the lookup
gh repo-stats-plus repo-stats \
  --org-name github \
  --app-id 12345 \
  --private-key-file /path/to/key.pem \
  --app-installation-id 67890
```

### Resume Processing

```bash
gh repo-stats-plus repo-stats --org-name github --resume-from-last-save
```

### Process Specific Repositories

```bash
gh repo-stats-plus repo-stats \
  --org-name github \
  --repo-list my-repos.txt
```

### With Custom Settings

```bash
gh repo-stats-plus repo-stats \
  --org-name github \
  --page-size 20 \
  --retry-max-attempts 5 \
  --verbose
```

### Batch Processing

Split a large organization into batches that can run in parallel (e.g., in a GitHub Actions matrix). Each batch produces its own CSV and state file.

```bash
# Process batch 0 (repos 1-100)
gh repo-stats-plus repo-stats --org-name github --batch-size 100 --batch-index 0

# Process batch 1 (repos 101-200)
gh repo-stats-plus repo-stats --org-name github --batch-size 100 --batch-index 1

# Process batch 2 (repos 201-300)
gh repo-stats-plus repo-stats --org-name github --batch-size 100 --batch-index 2

# Combine all batch outputs
gh repo-stats-plus combine-stats \
  --files output/github-all_repos-batch-0-*.csv \
         output/github-all_repos-batch-1-*.csv \
         output/github-all_repos-batch-2-*.csv
```

The total number of batches is logged when batch mode starts (e.g., `Total batches: 5`), so you know how many batch indices to run.

## Output

Generates:

- CSV file with repository statistics
- Organization-specific state file (e.g., `last_known_state_<org>.json`) for resume capability
- Log files in the `logs/` directory

**Note**: Each organization maintains its own isolated state file in the output directory, allowing you to process multiple organizations without conflicts.

In batch mode, each batch gets its own state file (e.g., `last_known_state_batch-0_<org>.json`) and output file (e.g., `<org>-all_repos-batch-0-<timestamp>.csv`), so batches can run concurrently without conflicts. Use `combine-stats` to merge the batch outputs afterward.
