# Command Reference

## repo-stats

Collects comprehensive statistics for all repositories in a GitHub organization.

```bash
gh repo-stats-plus repo-stats --organization my-org
```

### Key Options

- `--organization <org>`: GitHub organization name (required)
- `--access-token <token>`: GitHub personal access token
- `--resume-from-last-save`: Resume from previous run
- `--auto-process-missing`: Automatically process missing repositories
- `--verbose`: Enable detailed logging

### GitHub App Authentication

```bash
gh repo-stats-plus repo-stats \
  --organization my-org \
  --app-id YOUR_APP_ID \
  --private-key-file key.pem \
  --app-installation-id INSTALLATION_ID
```

### Performance Options

- `--page-size <size>`: Repositories per batch (default: 10)
- `--rate-limit-check-interval <seconds>`: Rate limit check frequency
- `--retry-max-attempts <attempts>`: Maximum retry attempts

## missing-repos

Identifies repositories in an organization that aren't in your CSV file.

```bash
gh repo-stats-plus missing-repos --organization my-org --file output.csv
```

### Options

- `--organization <org>`: GitHub organization name (required)
- `--file <path>`: CSV file to check against (required)
- `--access-token <token>`: GitHub personal access token
- `--verbose`: Enable detailed logging

## Output

Both commands generate:

- CSV file with repository statistics
- `last_known_state.json` for resume capability
- Log files in the `logs/` directory

- `--page-size <size>`: Number of items per page (Default: 10)
- `--extra-page-size <size>`: Extra page size (Default: 25)
- `--rate-limit-check-interval <seconds>`: Interval for rate limit checks (Default: 60)

#### Retry Logic

- `--retry-max-attempts <attempts>`: Maximum number of retry attempts (Default: 3)
- `--retry-initial-delay <milliseconds>`: Initial delay for retry (Default: 1000)
- `--retry-max-delay <milliseconds>`: Maximum delay for retry (Default: 30000)
- `--retry-backoff-factor <factor>`: Backoff factor for retry delays (Default: 2)
- `--retry-success-threshold <count>`: Successful operations before resetting retry count (Default: 5)

#### Processing Options

- `--resume-from-last-save`: Resume from the last saved state
- `--repo-list <file>`: Path to file containing list of repositories to process (format: owner/repo_name)
- `--auto-process-missing`: Automatically process any missing repositories when main processing is complete

### Examples

#### Basic Usage

```bash
gh repo-stats-plus repo-stats --organization github
```

#### With Personal Access Token

```bash
gh repo-stats-plus repo-stats --organization github --access-token ghp_xxxxxxxxxxxx
```

#### With GitHub App

```bash
gh repo-stats-plus repo-stats \
  --organization github \
  --app-id 12345 \
  --private-key-file /path/to/key.pem \
  --app-installation-id 67890
```

#### Resume Processing

```bash
gh repo-stats-plus repo-stats --organization github --resume-from-last-save
```

#### Process Specific Repositories

```bash
gh repo-stats-plus repo-stats \
  --organization github \
  --repo-list my-repos.txt
```

#### With Custom Settings

```bash
gh repo-stats-plus repo-stats \
  --organization github \
  --page-size 20 \
  --retry-max-attempts 5 \
  --verbose
```

---

## missing-repos Command

Identifies repositories that are part of an organization but not found in a specified file.

### Basic Syntax

```bash
gh repo-stats-plus missing-repos [options]
```

### Options

#### Core Options

- `-f, --file <file>`: Repo Stats File to check repos against (Required)
- `-o, --organization <org>`: The name of the organization to process
- `-t, --access-token <token>`: GitHub access token
- `-u, --base-url <url>`: GitHub API base URL (Default: https://api.github.com)
- `--proxy-url <url>`: Proxy URL if required
- `-v, --verbose`: Enable verbose logging

#### GitHub App Authentication

- `--app-id <id>`: GitHub App ID
- `--private-key <key>`: GitHub App private key
- `--private-key-file <file>`: Path to GitHub App private key file
- `--app-installation-id <id>`: GitHub App installation ID

#### Performance

- `--page-size <size>`: Number of items per page (Default: 10)

### Examples

#### Basic Usage

```bash
gh repo-stats-plus missing-repos \
  --organization github \
  --file github-repo-stats.csv
```

#### With Verbose Output

```bash
gh repo-stats-plus missing-repos \
  --organization github \
  --file github-repo-stats.csv \
  --verbose
```

#### With GitHub App Authentication

```bash
gh repo-stats-plus missing-repos \
  --organization github \
  --file github-repo-stats.csv \
  --app-id 12345 \
  --private-key-file /path/to/key.pem \
  --app-installation-id 67890
```

---

## Common Workflows

### Complete Organization Analysis

```bash
# 1. Initial run
gh repo-stats-plus repo-stats --organization myorg

# 2. Check for any missing repositories
gh repo-stats-plus missing-repos --organization myorg --file myorg-repo-stats.csv

# 3. If interrupted, resume the main process
gh repo-stats-plus repo-stats --organization myorg --resume-from-last-save
```

### Selective Processing

```bash
# 1. Create a list of repositories to process
echo "owner/repo1
owner/repo2
owner/repo3" > target-repos.txt

# 2. Process only those repositories
gh repo-stats-plus repo-stats --organization myorg --repo-list target-repos.txt
```

### High-Volume Processing

```bash
# Optimized settings for large organizations
gh repo-stats-plus repo-stats \
  --organization large-org \
  --page-size 20 \
  --rate-limit-check-interval 30 \
  --retry-max-attempts 5 \
  --auto-process-missing \
  --resume-from-last-save
```
