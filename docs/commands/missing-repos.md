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
- `-v, --verbose`: Enable verbose logging

### GitHub App Authentication

- `--app-id <id>`: GitHub App ID
- `--private-key <key>`: GitHub App private key
- `--private-key-file <file>`: Path to GitHub App private key file
- `--app-installation-id <id>`: GitHub App installation ID

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
gh repo-stats-plus missing-repos \
  --org-name github \
  --file github-repo-stats.csv \
  --app-id 12345 \
  --private-key-file /path/to/key.pem \
  --app-installation-id 67890
```
