# Command Reference

This page provides an overview of all available commands. See the individual command pages for full option details, examples, and output formats.

## Commands

| Command                                            | Description                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| [repo-stats](commands/repo-stats.md)               | Collect comprehensive statistics for all repositories in a GitHub organization |
| [missing-repos](commands/missing-repos.md)         | Identify repositories in an organization that are missing from a CSV file      |
| [project-stats](commands/project-stats.md)         | Count unique ProjectsV2 linked to repositories                                 |
| [app-install-stats](commands/app-install-stats.md) | Retrieve GitHub App installation statistics for an organization (PAT only)     |
| [combine-stats](commands/combine-stats.md)         | Merge multiple CSV output files into a single combined report                  |

## Quick Start

```bash
# Collect repo statistics
gh repo-stats-plus repo-stats --org-name my-org

# Check for missing repositories
gh repo-stats-plus missing-repos --org-name my-org --file output.csv

# Collect project statistics
gh repo-stats-plus project-stats --org-name my-org

# Collect app installation statistics (PAT required)
gh repo-stats-plus app-install-stats --org-name my-org

# Combine multiple CSV files
gh repo-stats-plus combine-stats --files file1.csv file2.csv
```

## Output

All commands generate output in the `output/` directory by default and write log files to `logs/`. Commands that support state management create organization-specific state files (e.g., `last_known_state_<org>.json`) for resume capability.

---

## Common Workflows

### Complete Organization Analysis

```bash
# 1. Gather repo statistics
gh repo-stats-plus repo-stats --org-name myorg

# 2. Check for any missing repositories
gh repo-stats-plus missing-repos --org-name myorg --file output/myorg-repo-stats.csv

# 3. Gather project statistics
gh repo-stats-plus project-stats --org-name myorg

# 4. Gather app installation statistics
gh repo-stats-plus app-install-stats --org-name myorg

# 5. Combine repo-stats and project-stats into a single report
gh repo-stats-plus combine-stats \
  --files output/myorg-all_repos-*.csv output/myorg-project-stats-*.csv
```

### Scripted Pipeline

The `script/collect-stats.sh` script runs repo-stats, project-stats, app-install-stats, and combine-stats in sequence, automatically passing output file paths between steps.

```bash
# Basic usage
./script/collect-stats.sh --org-name my-org --access-token ghp_xxxxxxxxxxxx

# Skip specific steps
./script/collect-stats.sh --org-name my-org --skip-app-install-stats

# Provide existing files
./script/collect-stats.sh \
  --org-name my-org \
  --repo-stats-file output/my-org-all_repos-202502250000_ts.csv
```

Run `./script/collect-stats.sh --help` for a full list of options.

### Multiple Organizations

```bash
# Using org-list for commands that support it
gh repo-stats-plus project-stats --org-list orgs.txt --continue-on-error
gh repo-stats-plus app-install-stats --org-list orgs.txt --continue-on-error

# Sequential processing for repo-stats
gh repo-stats-plus repo-stats --org-name org1
gh repo-stats-plus repo-stats --org-name org2
```
