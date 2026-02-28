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
- `-v, --verbose`: Enable verbose logging

### GitHub App Authentication

- `--app-id <id>`: GitHub App ID
- `--private-key <key>`: GitHub App private key
- `--private-key-file <file>`: Path to GitHub App private key file
- `--app-installation-id <id>`: GitHub App installation ID

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

## Output

Generates:

- CSV file with repository statistics
- Organization-specific state file (e.g., `last_known_state_<org>.json`) for resume capability
- Log files in the `logs/` directory

**Note**: Each organization maintains its own isolated state file in the output directory, allowing you to process multiple organizations without conflicts.
