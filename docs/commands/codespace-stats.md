# codespace-stats Command

Retrieves codespace usage statistics for one or more GitHub organizations. Produces a CSV file listing all codespaces grouped by repository, including machine details (CPU, memory, storage), ownership, and lifecycle timestamps.

Based on the approach from [scottluskcis/gh-data-fetch](https://github.com/scottluskcis/gh-data-fetch).

## Basic Syntax

```bash
gh repo-stats-plus codespace-stats [options]
```

## Options

### Organization Selection (one required)

- `-o, --org-name <org>`: The name of the organization to process
- `--org-list <file>`: Path to file containing list of organizations to process (one org per line)

### Authentication

- `-t, --access-token <token>`: GitHub access token
- `--app-id <id>`: GitHub App ID for authentication
- `--private-key <key>`: GitHub App private key content
- `--private-key-file <path>`: Path to GitHub App private key file
- `--app-installation-id <id>`: GitHub App installation ID

### Configuration

- `-u, --base-url <url>`: GitHub API base URL (Default: `https://api.github.com`)
- `--proxy-url <url>`: Proxy URL if required
- `--api-version <version>`: GitHub API version to use (`2022-11-28` or `2026-03-10`, Default: `2022-11-28`, Env: `GITHUB_API_VERSION`)
- `--output-dir <dir>`: Output directory for generated files (Default: output)
- `--output-file-name <name>`: Name for the primary output CSV file (default: auto-generated with timestamp)
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
- `--clean-state`: Remove state file after successful completion

### Multi-Organization Options

- `--delay-between-orgs <seconds>`: Delay between processing organizations (Default: 5)
- `--continue-on-error`: Continue processing other organizations if one fails

## Examples

### Basic Usage

```bash
gh repo-stats-plus codespace-stats --org-name my-org
```

### With Access Token

```bash
gh repo-stats-plus codespace-stats \
  --org-name my-org \
  --access-token ghp_xxxxxxxxxxxx
```

### Multiple Organizations

```bash
gh repo-stats-plus codespace-stats \
  --org-list orgs.txt \
  --delay-between-orgs 10 \
  --continue-on-error
```

### With GitHub App Authentication

```bash
gh repo-stats-plus codespace-stats \
  --org-name my-org \
  --app-id 12345 \
  --private-key-file ./key.pem \
  --app-installation-id 67890
```

### Custom Output

```bash
gh repo-stats-plus codespace-stats \
  --org-name my-org \
  --output-dir ./reports \
  --verbose
```

## Output

The command generates a CSV file in the output directory with the following columns:

| Column           | Description                                                |
| ---------------- | ---------------------------------------------------------- |
| `Org_Name`       | Organization name                                          |
| `Repo_Name`      | Repository name the codespace belongs to (or `Unknown`)    |
| `Codespace_Name` | Name of the codespace                                      |
| `State`          | Current state of the codespace (e.g., Available, Shutdown) |
| `Machine_Name`   | Machine type name (e.g., `basicLinux32gb`)                 |
| `CPU_Size`       | Number of CPUs allocated                                   |
| `Memory_Size_GB` | Memory allocated in GB                                     |
| `Storage_GB`     | Storage allocated in GB                                    |
| `Billable_Owner` | Login of the billable owner                                |
| `Owner`          | Login of the codespace owner                               |
| `Last_Used_At`   | Timestamp of last usage                                    |
| `Created_At`     | Timestamp of creation                                      |

## Auth Requirements

This command uses the GitHub REST API to query codespace data. The authenticated user or app must have:

- **Organization owner** or appropriate admin permissions to view codespaces across the organization
- Uses `GET /orgs/{org}/codespaces` endpoint
