# Command Reference

This page provides an overview of all available commands. See the individual command pages for full option details, examples, and output formats.

## Commands

| Command                                            | Description                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| [repo-stats](commands/repo-stats.md)               | Collect comprehensive statistics for all repositories in a GitHub organization |
| [missing-repos](commands/missing-repos.md)         | Identify repositories in an organization that are missing from a CSV file      |
| [project-stats](commands/project-stats.md)         | Count unique ProjectsV2 linked to repositories                                 |
| [app-install-stats](commands/app-install-stats.md) | Retrieve GitHub App installation statistics for an organization (PAT only)     |
| [package-stats](commands/package-stats.md)         | Retrieve package statistics (Maven, npm, etc.) for an organization             |
| [codespace-stats](commands/codespace-stats.md)     | Retrieve codespace usage statistics for an organization                        |
| [combine-stats](commands/combine-stats.md)         | Merge multiple CSV output files into a single combined report                  |
| [post-process](commands/post-process.md)           | Transform CSV data using configurable rules for pattern matching and cleanup   |
| [rows-to-columns](commands/rows-to-columns.md)     | Pivot rows from an additional CSV into columns in a base CSV                   |

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

# Collect package statistics (Maven by default)
gh repo-stats-plus package-stats --org-name my-org

# Collect package statistics for NPM
gh repo-stats-plus package-stats --org-name my-org --package-type NPM

# Collect codespace usage statistics
gh repo-stats-plus codespace-stats --org-name my-org

# Combine multiple CSV files
gh repo-stats-plus combine-stats --files file1.csv file2.csv

# Post-process CSV data with rules
gh repo-stats-plus post-process --input combined.csv --rules-file rules.json

# Pivot additional CSV rows into columns (e.g., migration audit data)
gh repo-stats-plus rows-to-columns \
  --base-csv-file stats.csv \
  --additional-csv-file audit.csv \
  --header-column-keys type \
  --header-column-values message
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

# 5. Gather package statistics
gh repo-stats-plus package-stats --org-name myorg

# 6. Gather codespace usage statistics
gh repo-stats-plus codespace-stats --org-name myorg

# 7. Combine repo-stats and project-stats into a single report
gh repo-stats-plus combine-stats \
  --files output/myorg-all_repos-*.csv output/myorg-project-stats-*.csv

# 6. Post-process the combined report with custom rules
gh repo-stats-plus post-process \
  --input output/combined-stats.csv \
  --rules-file post-process.rules.json

# 7. Combine with migration audit data (if available)
gh repo-stats-plus rows-to-columns \
  --base-csv-file output/combined-stats.csv \
  --additional-csv-file output/migration-audit.csv \
  --header-column-keys type \
  --header-column-values message
```

### Scripted Pipeline

The `script/collect-stats.sh` script runs repo-stats, project-stats, app-install-stats, combine-stats, and optionally post-process and rows-to-columns in sequence, automatically passing output file paths between steps.

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
gh repo-stats-plus package-stats --org-list orgs.txt --continue-on-error

# Sequential processing for repo-stats
gh repo-stats-plus repo-stats --org-name org1
gh repo-stats-plus repo-stats --org-name org2
```
