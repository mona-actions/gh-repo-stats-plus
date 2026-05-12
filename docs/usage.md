# Usage Guide

## Authentication

The extension uses your existing GitHub CLI authentication. If you haven't authenticated yet:

```bash
gh auth login
```

## Basic Usage

```bash
# View help and available commands
gh repo-stats-plus --help

# Gather repository statistics for an organization
gh repo-stats-plus repo-stats --org-name my-org

# Find repositories missing from a CSV file
gh repo-stats-plus missing-repos --org-name my-org --file my-repos.csv

# Count ProjectsV2 linked to repositories
gh repo-stats-plus project-stats --org-name my-org
```

## Common Scenarios

### Basic Organization Analysis

```bash
gh repo-stats-plus repo-stats --org-name my-org
```

### Standalone Repository List

Create a repo list with one strict `owner/repo` entry per line:

```text
my-org/repo-one
another-owner/repo-two
```

Then run `repo-stats` using the list as the only source:

```bash
gh repo-stats-plus repo-stats --repo-list repos-to-process.txt
```

`--repo-list` is mutually exclusive with `--org-name` and `--org-list`. Relative repo-list paths resolve from the directory where you invoke `gh repo-stats-plus`, not from the installed extension directory. Repositories can span multiple owners; processing is grouped by owner internally for efficiency, but the run writes one combined CSV and one `last_known_state_repo-list.json` state file.

### Resume from Previous Run

```bash
gh repo-stats-plus repo-stats --org-name my-org --resume-from-last-save
```

### Using GitHub App Authentication

```bash
gh repo-stats-plus repo-stats \
  --org-name my-org \
  --app-id YOUR_APP_ID \
  --private-key-file key.pem
```

> **Note:** `--app-installation-id` is optional. When omitted, the CLI automatically looks up the installation ID via the GitHub API. You can still provide it explicitly to skip the lookup.

### Process Missing Repositories

```bash
gh repo-stats-plus missing-repos --org-name my-org --file output.csv
gh repo-stats-plus repo-stats --org-name my-org --auto-process-missing
gh repo-stats-plus repo-stats --repo-list repos-to-process.txt --auto-process-missing
```

For standalone repo-list mode, `--auto-process-missing` compares requested `owner/repo` keys to the combined CSV `Org_Name` and `Repo_Name` columns.

### Count Project Associations

```bash
# Count ProjectsV2 linked to repositories via issues
gh repo-stats-plus project-stats --org-name my-org

# Process specific repos from a list
gh repo-stats-plus project-stats --org-name my-org --repo-list repos.txt

# Multiple organizations
gh repo-stats-plus project-stats --org-list orgs.txt --continue-on-error
```

### Multiple Organizations

```bash
# Process multiple organizations sequentially; each org maintains its own state file
gh repo-stats-plus repo-stats --org-name org1
gh repo-stats-plus repo-stats --org-name org2
gh repo-stats-plus repo-stats --org-name org3

# Use custom output directory (state files are stored here too)
gh repo-stats-plus repo-stats \
  --org-name my-org \
  --output-dir ./reports

# Clean up state files after successful completion
gh repo-stats-plus repo-stats \
  --org-name my-org \
  --clean-state
```

```bash
gh repo-stats-plus repo-stats --org-name myorg --output-format json
```

### Check for Missing Repositories

```bash
gh repo-stats-plus missing-repos --org-name myorg --file expected-repos.csv
```

### Resume from a Previous Run

```bash
gh repo-stats-plus repo-stats --org-name myorg --resume-from-last-save
```

### Process Specific Repositories

```bash
# Create a file with repositories to process; every entry must be owner/repo
echo "owner/repo1
owner/repo2
owner/repo3" > repos-to-process.txt

# Run the command; all entries are written to one combined CSV/state file
gh repo-stats-plus repo-stats --repo-list repos-to-process.txt
```

Do not combine `--repo-list` with `--org-name` or `--org-list`. If you need per-organization outputs or org-list orchestration, continue using `--org-name` or `--org-list`; their behavior has not changed.

### Auto-Process Missing Repositories

```bash
gh repo-stats-plus repo-stats --org-name myorg --auto-process-missing
```

## Authentication Methods

The extension supports multiple authentication approaches:

### Personal Access Token (PAT)

When using GitHub CLI authentication, you can use your personal access token. The extension will automatically use the token configured with `gh auth login`.

### GitHub App Authentication

For GitHub App authentication, provide your App ID and private key:

```bash
gh repo-stats-plus repo-stats \
  --org-name myorg \
  --app-id 12345 \
  --private-key-file /path/to/key.pem
```

The `--app-installation-id` flag is optional. When omitted, the CLI automatically looks up the installation ID for the target organization using the GitHub API. If you already know the installation ID, you can provide it explicitly to skip the lookup:

```bash
gh repo-stats-plus repo-stats \
  --org-name myorg \
  --app-id 12345 \
  --private-key-file /path/to/key.pem \
  --app-installation-id 67890
```

## Working with Large Organizations

### GitHub Enterprise Server (GHES)

When connecting to a GHES instance with an internal or self-signed CA certificate, provide the CA certificate bundle so TLS verification works correctly:

```bash
gh repo-stats-plus repo-stats \
  --org-name my-org \
  --base-url https://ghes.example.com/api/v3 \
  --ca-cert /path/to/ca-bundle.pem
```

Alternatively, set the `NODE_EXTRA_CA_CERTS` environment variable:

```bash
export NODE_EXTRA_CA_CERTS=/path/to/ca-bundle.pem
gh repo-stats-plus repo-stats \
  --org-name my-org \
  --base-url https://ghes.example.com/api/v3
```

When using the GitHub Action, the recommended approach is to store the PEM content as a GitHub secret and pass it via the `ca-cert` input:

```yaml
- uses: mona-actions/gh-repo-stats-plus@v1
  with:
    github-token: ${{ github.token }}
    access-token: ${{ secrets.GHES_TOKEN }}
    organization: my-org
    base-url: https://ghes.example.com/api/v3
    ca-cert: ${{ secrets.GHES_CA_CERT }}
```

For organizations with many repositories, consider these best practices:

### Use Resume Capability

Always use the resume functionality for large organizations:

```bash
gh repo-stats-plus repo-stats --org-name large-org --resume-from-last-save
```

### Monitor Progress

The extension provides detailed logging. Check the logs directory for progress updates and any issues:

```bash
ls -la logs/
```

### Handle Rate Limits

The extension automatically handles GitHub API rate limits, but you can adjust the behavior:

```bash
gh repo-stats-plus repo-stats \
  --org-name myorg \
  --rate-limit-check-interval 30 \
  --retry-max-attempts 5
```

## Output Files

The extension generates several output files:

1. **CSV file**: Contains the repository statistics (saved in `./output/` by default)
2. **State file** (`last_known_state_<org>.json`): Tracks processing progress for each organization (saved in output directory)
3. **Log files**: Detailed logging information in the `logs/` directory

### State File Management

- Each organization has its own state file (e.g., `last_known_state_myorg.json`)
- State files are stored in the output directory alongside CSV files
- State files enable resuming from interruptions
- Use `--output-dir` to specify where both output and state files are saved
- Use `--clean-state` to automatically remove state files after successful completion
- Legacy `last_known_state.json` files (without organization suffix) will trigger a warning

## Tips for Effective Usage

- **Start with a test run** on a smaller organization first
- **Use the resume feature** for any interruptions
- **Process multiple organizations** without conflicts - each maintains its own state
- **Organize files** using `--output-dir` for cleaner workspace (both CSV and state files go here)
- **Clean up state files** with `--clean-state` after successful runs
- **Check logs** if you encounter issues
- **Verify authentication** before running large jobs
- **Keep backups** of important CSV output files
