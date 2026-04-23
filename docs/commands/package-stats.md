# package-stats Command

Retrieves package statistics for one or more GitHub organizations. Produces a CSV file with details about each package including name, type, repository association, download counts, version information, and total storage size.

Supports all GitHub Packages types: Maven, npm, Docker, NuGet, RubyGems, and PyPI. Defaults to Maven.

Based on the approach from [scottluskcis/gh-data-fetch](https://github.com/scottluskcis/gh-data-fetch).

## Basic Syntax

```bash
gh repo-stats-plus package-stats [options]
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
- `--app-installation-id <id>`: GitHub App installation ID (optional — automatically looked up if omitted)

### Configuration

- `-u, --base-url <url>`: GitHub API base URL (Default: `https://api.github.com`)
- `--proxy-url <url>`: Proxy URL if required
- `--api-version <version>`: GitHub API version to use (`2022-11-28` or `2026-03-10`, Default: `2022-11-28`, Env: `GITHUB_API_VERSION`)
- `--output-dir <dir>`: Output directory for generated files (Default: output)
- `--output-file-name <name>`: Name for the primary output CSV file (default: auto-generated with timestamp)
- `-v, --verbose`: Enable verbose logging

### Package Type

- `--package-type <type>`: The type of package to query (Default: `maven`). Supported values: `maven`, `npm`, `docker`, `nuget`, `rubygems`, `pypi` (case-insensitive, automatically uppercased for the API)

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

### Basic Usage (Maven packages)

```bash
gh repo-stats-plus package-stats --org-name my-org
```

### Specify Package Type

```bash
# NPM packages
gh repo-stats-plus package-stats --org-name my-org --package-type NPM

# Docker packages
gh repo-stats-plus package-stats --org-name my-org --package-type DOCKER

# NuGet packages
gh repo-stats-plus package-stats --org-name my-org --package-type NUGET
```

### With Access Token

```bash
gh repo-stats-plus package-stats \
  --org-name my-org \
  --access-token ghp_xxxxxxxxxxxx
```

### Multiple Organizations

```bash
gh repo-stats-plus package-stats \
  --org-list orgs.txt \
  --delay-between-orgs 10 \
  --continue-on-error
```

### With GitHub App Authentication

```bash
# Installation ID is auto-looked up when omitted
gh repo-stats-plus package-stats \
  --org-name my-org \
  --app-id 12345 \
  --private-key-file ./key.pem

# Or provide it explicitly to skip the lookup
gh repo-stats-plus package-stats \
  --org-name my-org \
  --app-id 12345 \
  --private-key-file ./key.pem \
  --app-installation-id 67890
```

### Custom Output

```bash
gh repo-stats-plus package-stats \
  --org-name my-org \
  --output-dir ./reports \
  --verbose
```

## Output

The command generates a CSV file in the output directory with the following columns:

| Column                      | Description                                       |
| --------------------------- | ------------------------------------------------- |
| `Org_Name`                  | Organization name                                 |
| `Package_Name`              | Full package name (e.g., `com.example:my-lib`)    |
| `Package_Type`              | Package type (e.g., MAVEN, NPM)                   |
| `Repo_Name`                 | Associated repository name (or `N/A` if unlinked) |
| `Repo_Archived`             | Whether the associated repository is archived     |
| `Repo_Visibility`           | Repository visibility (PUBLIC, PRIVATE, INTERNAL) |
| `Downloads_Count`           | Total download count                              |
| `Last_Published`            | Timestamp of the most recent published file       |
| `Latest_Version`            | Latest version string                             |
| `Latest_Version_Size_Bytes` | Total size of files in the latest version (bytes) |
| `Latest_Version_Size`       | Human-readable size of the latest version         |
| `Total_Versions`            | Total number of versions across all pages         |
| `Total_Files`               | Total number of files across all versions         |
| `Total_Size_Bytes`          | Total storage size across all versions (bytes)    |
| `Total_Size`                | Human-readable total storage size                 |

## Auth Requirements

This command uses the GitHub GraphQL API to query package data. The authenticated user or app must have:

- **Read access** to the organization's packages
- For private/internal packages, the token must have the `read:packages` scope (classic PAT) or appropriate fine-grained permissions

## Notes

- Deleted packages (name starting with `deleted_` and zero versions) are automatically skipped
- Deep pagination is used for packages with many versions or files to ensure accurate totals
- The `--package-type` value is case-insensitive and will be uppercased automatically
- Processing is incremental: packages are written to CSV as they are fetched, so partial results are available even if processing is interrupted
