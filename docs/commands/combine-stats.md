# combine-stats Command

Merges multiple CSV files into a single combined output. Useful for combining results from different organizations, time periods, or command outputs.

## Basic Syntax

```bash
gh repo-stats-plus combine-stats [options]
```

## Options

- `--files <files...>`: List of CSV files to combine
- `--output-dir <dir>`: Output directory for the combined file (Default: output)
- `--output-file-name <name>`: Name for the combined output file
- `--match-columns <columns...>`: Column names to match when combining (overrides default)
- `--no-match-columns`: Combine all rows without matching
- `-v, --verbose`: Enable verbose logging

## Examples

### Combine Specific Files

```bash
gh repo-stats-plus combine-stats \
  --files output/org1-stats.csv output/org2-stats.csv \
  --output-file-name combined-results.csv
```

### Combine Without Matching

```bash
gh repo-stats-plus combine-stats \
  --files output/file1.csv output/file2.csv \
  --no-match-columns
```

### Combine with Custom Matching Columns

```bash
gh repo-stats-plus combine-stats \
  --files output/org1.csv output/org2.csv \
  --match-columns Org_Name Repo_Name
```

## How Combining Works

- By default, rows are matched using the columns defined in `DEFAULT_MATCH_COLUMNS` (`Org_Name`, `Repo_Name`)
- If `--match-columns` is specified, only those columns are used for deduplication
- If `--no-match-columns` is set, all rows from all files are simply concatenated
- The first file's headers are used as the base; additional unique columns from later files are appended
