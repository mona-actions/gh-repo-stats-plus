# app-install-stats Command

Retrieves GitHub App installation statistics for one or more organizations. Produces up to three CSV files showing which apps are installed on which repositories.

> **Important:** This command requires a **Personal Access Token (PAT)**. GitHub App tokens cannot view data about other apps' installations.

Based on the approach from [jcantosz/org-app-stats](https://github.com/jcantosz/org-app-stats).

## Basic Syntax

```bash
gh repo-stats-plus app-install-stats [options]
```

## Options

### Organization Selection (one required)

- `-o, --org-name <org>`: The name of the organization to process
- `--org-list <file>`: Path to file containing list of organizations to process (one org per line)

### Authentication

- `-t, --access-token <token>`: GitHub access token (must be a PAT with `read:org` scope)

### Configuration

- `-u, --base-url <url>`: GitHub API base URL (Default: `https://api.github.com`)
- `--proxy-url <url>`: Proxy URL if required
- `--output-dir <dir>`: Output directory for generated files (Default: output)
- `--output-file-name <name>`: Name for the primary output CSV file (default: auto-generated with timestamp)
- `-v, --verbose`: Enable verbose logging

### Performance

- `--page-size <size>`: Number of items per page (Default: 30)
- `--rate-limit-check-interval <seconds>`: Interval for rate limit checks (Default: 60)

### Retry Logic

- `--retry-max-attempts <attempts>`: Maximum number of retry attempts (Default: 3)
- `--retry-initial-delay <milliseconds>`: Initial delay for retry (Default: 1000)
- `--retry-max-delay <milliseconds>`: Maximum delay for retry (Default: 30000)
- `--retry-backoff-factor <factor>`: Backoff factor for retry delays (Default: 2)
- `--retry-success-threshold <count>`: Successful operations before resetting retry count (Default: 5)

### Processing Options

- `--resume-from-last-save`: Resume from the last saved state
- `--force-fresh-start`: Force a fresh start, ignoring any existing state
- `--clean-state`: Remove state file after successful completion

### Multi-Organization Options

- `--delay-between-orgs <seconds>`: Delay between processing organizations (Default: 5)
- `--continue-on-error`: Continue processing other organizations if one fails

### CSV Output Control

By default, all three CSV files are generated. Use these flags to skip specific outputs:

- `--skip-per-repo-install-csv`: Skip generating the per-repo installations CSV
- `--skip-repo-app-detail-csv`: Skip generating the repo-app details CSV
- `--skip-app-repos-csv`: Skip generating the app-repos summary CSV

## Examples

### Basic Usage

```bash
gh repo-stats-plus app-install-stats --org-name my-org
```

### With Personal Access Token

```bash
gh repo-stats-plus app-install-stats \
  --org-name my-org \
  --access-token ghp_xxxxxxxxxxxx
```

### Multiple Organizations

```bash
gh repo-stats-plus app-install-stats \
  --org-list orgs.txt \
  --delay-between-orgs 10 \
  --continue-on-error
```

### Only Generate Per-Repo Installations CSV

```bash
gh repo-stats-plus app-install-stats \
  --org-name my-org \
  --skip-repo-app-detail-csv \
  --skip-app-repos-csv
```

### Resume After Interruption

```bash
gh repo-stats-plus app-install-stats \
  --org-name my-org \
  --resume-from-last-save
```

## Output

Three CSV files are generated per organization (unless skipped):

### 1. Per-Repo Installations (`{org}-per-repo-installations-{timestamp}.csv`)

Shows the number of GitHub App installations for each repository.

| Column              | Description                                 |
| ------------------- | ------------------------------------------- |
| `Org_Name`          | Organization login                          |
| `Repo_Name`         | Repository name                             |
| `App_Installations` | Number of apps installed on this repository |

### 2. Repo-App Details (`{org}-repo-app-details-{timestamp}.csv`)

Lists each app installed on each repository with its configuration status.

| Column       | Description                                                                   |
| ------------ | ----------------------------------------------------------------------------- |
| `Org_Name`   | Organization login                                                            |
| `Repo_Name`  | Repository name                                                               |
| `App_Name`   | Name of the installed GitHub App                                              |
| `Configured` | Whether the app has active access — `all` (org-wide) or `selected` (targeted) |

### 3. App-Repos Summary (`{org}-app-repos-{timestamp}.csv`)

Shows each app and a comma-separated list of repositories where it is installed.

| Column               | Description                                        |
| -------------------- | -------------------------------------------------- |
| `Org_Name`           | Organization login                                 |
| `App_Name`           | Name of the installed GitHub App                   |
| `Repos_Installed_In` | Comma-separated list of repositories the app is on |

## Authentication Requirements

This command **requires a Personal Access Token (PAT)** with the following scopes:

- `read:org` — to list organization app installations

If using GitHub Enterprise Server, ensure the PAT has been authorized for SSO if applicable.

GitHub App tokens **will not work** for this command because app tokens can only see their own installation, not other apps' installations.
