# missing-repos Command

Identifies repositories that are part of an organization but not found in a specified file.

## Basic Syntax

```bash
gh repo-stats-plus missing-repos [options]
```

## Options

### Core Options

- `-f, --file <file>`: Repo Stats File to check repos against (Required)
- `-o, --org-name <org>`: The name of the organization to process
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

## Examples

### Basic Usage

```bash
gh repo-stats-plus missing-repos \
  --org-name github \
  --file github-repo-stats.csv
```

### With Verbose Output

```bash
gh repo-stats-plus missing-repos \
  --org-name github \
  --file github-repo-stats.csv \
  --verbose
```

### With GitHub App Authentication

```bash
# Installation ID is auto-looked up when omitted
gh repo-stats-plus missing-repos \
  --org-name github \
  --file github-repo-stats.csv \
  --app-id 12345 \
  --private-key-file /path/to/key.pem

# Or provide it explicitly to skip the lookup
gh repo-stats-plus missing-repos \
  --org-name github \
  --file github-repo-stats.csv \
  --app-id 12345 \
  --private-key-file /path/to/key.pem \
  --app-installation-id 67890
```
