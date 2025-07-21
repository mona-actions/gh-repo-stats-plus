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
gh repo-stats-plus repo-stats --organization my-org

# Find repositories missing from a CSV file
gh repo-stats-plus missing-repos --organization my-org --file my-repos.csv
```

## Common Scenarios

### Basic Organization Analysis

```bash
gh repo-stats-plus repo-stats --organization my-org
```

### Resume from Previous Run

```bash
gh repo-stats-plus repo-stats --organization my-org --resume-from-last-save
```

### Using GitHub App Authentication

```bash
gh repo-stats-plus repo-stats \
  --organization my-org \
  --app-id YOUR_APP_ID \
  --private-key-file key.pem \
  --app-installation-id INSTALLATION_ID
```

### Process Missing Repositories

```bash
gh repo-stats-plus missing-repos --organization my-org --file output.csv
gh repo-stats-plus repo-stats --organization my-org --auto-process-missing
```

```bash
gh repo-stats-plus repo-stats --organization myorg --output-format json
```

### Check for Missing Repositories

```bash
gh repo-stats-plus missing-repos --organization myorg --file expected-repos.csv
```

### Resume from a Previous Run

```bash
gh repo-stats-plus repo-stats --organization myorg --resume-from-last-save
```

### Process Specific Repositories

```bash
# Create a file with repositories to process
echo "owner/repo1
owner/repo2
owner/repo3" > repos-to-process.txt

# Run the command
gh repo-stats-plus repo-stats --organization myorg --repo-list repos-to-process.txt
```

### Auto-Process Missing Repositories

```bash
gh repo-stats-plus repo-stats --organization myorg --auto-process-missing
```

## Authentication Methods

The extension supports multiple authentication approaches:

### Personal Access Token (PAT)

When using GitHub CLI authentication, you can use your personal access token. The extension will automatically use the token configured with `gh auth login`.

### GitHub App Authentication

For GitHub App authentication, you can pass additional parameters:

```bash
gh repo-stats-plus repo-stats \
  --organization myorg \
  --app-id 12345 \
  --private-key-file /path/to/key.pem \
  --app-installation-id 67890
```

## Working with Large Organizations

For organizations with many repositories, consider these best practices:

### Use Resume Capability

Always use the resume functionality for large organizations:

```bash
gh repo-stats-plus repo-stats --organization large-org --resume-from-last-save
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
  --organization myorg \
  --rate-limit-check-interval 30 \
  --retry-max-attempts 5
```

## Output Files

The extension generates several output files:

1. **CSV file**: Contains the repository statistics
2. **State file** (`last_known_state.json`): Tracks processing progress
3. **Log files**: Detailed logging information in the `logs/` directory

## Tips for Effective Usage

- **Start with a test run** on a smaller organization first
- **Use the resume feature** for any interruptions
- **Check logs** if you encounter issues
- **Verify authentication** before running large jobs
- **Keep backups** of important CSV output files
