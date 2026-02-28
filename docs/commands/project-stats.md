# project-stats Command

Counts unique ProjectsV2 linked to repositories via issues and directly. Based on the approach from [jcantosz/Count-repo-projects](https://github.com/jcantosz/Count-repo-projects).

## Basic Syntax

```bash
gh repo-stats-plus project-stats [options]
```

## Options

### Organization Selection (one required)

- `-o, --org-name <org>`: The name of the organization to process
- `--org-list <file>`: Path to file containing list of organizations to process (one org per line)

### Authentication

- `-t, --access-token <token>`: GitHub access token
- `--app-id <id>`: GitHub App ID
- `--private-key <key>`: GitHub App private key
- `--private-key-file <file>`: Path to GitHub App private key file
- `--app-installation-id <id>`: GitHub App installation ID

### Configuration

- `-u, --base-url <url>`: GitHub API base URL (Default: `https://api.github.com`)
- `--proxy-url <url>`: Proxy URL if required
- `--output-dir <dir>`: Output directory for generated files (Default: output)
- `-v, --verbose`: Enable verbose logging

### Performance

- `--page-size <size>`: Number of items per page (Default: 100)
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
- `--repo-list <file>`: Path to file containing list of repositories to process (format: owner/repo_name)
- `--repo-names-file <file>`: Path to file containing repository names only, one per line (no owner prefix)
- `--clean-state`: Remove state file after successful completion

### Multi-Organization Options

- `--delay-between-orgs <seconds>`: Delay between processing organizations (Default: 5)
- `--continue-on-error`: Continue processing other organizations if one fails

## Examples

### Basic Usage

```bash
gh repo-stats-plus project-stats --org-name my-org
```

### With Personal Access Token

```bash
gh repo-stats-plus project-stats --org-name my-org --access-token ghp_xxxxxxxxxxxx
```

### With GitHub App

```bash
gh repo-stats-plus project-stats \
  --org-name my-org \
  --app-id 12345 \
  --private-key-file /path/to/key.pem \
  --app-installation-id 67890
```

### Process Specific Repositories

```bash
gh repo-stats-plus project-stats \
  --org-name my-org \
  --repo-list my-repos.txt
```

### Multiple Organizations

```bash
gh repo-stats-plus project-stats \
  --org-list orgs.txt \
  --delay-between-orgs 10 \
  --continue-on-error
```

### Resume Processing

```bash
gh repo-stats-plus project-stats --org-name my-org --resume-from-last-save
```

## Output

Generates a CSV file with the following columns:

| Column                             | Description                                                     |
| ---------------------------------- | --------------------------------------------------------------- |
| `Org_Name`                         | Organization login                                              |
| `Repo_Name`                        | Repository name                                                 |
| `Issues_Linked_To_Projects`        | Number of issues that have at least one linked ProjectV2        |
| `Unique_Projects_Linked_By_Issues` | Count of distinct ProjectV2 items found across all issues       |
| `Projects_Linked_To_Repo`          | Total count of projects directly associated with the repository |
