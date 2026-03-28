# rows-to-columns Command

Converts rows from an additional CSV into new columns in a base CSV by matching rows and pivoting values. Originally designed to combine repository statistics with migration audit data from [gh-migration-audit](https://github.com/timrogers/gh-migration-audit).

Based on the approach from [jcantosz/generate-repo-report/rows-to-columns](https://github.com/jcantosz/generate-repo-report/tree/main/rows-to-columns).

## Basic Syntax

```bash
gh repo-stats-plus rows-to-columns --base-csv-file <file> --additional-csv-file <file> --header-column-keys <column> --header-column-values <column> [options]
```

## Options

- `--base-csv-file <file>`: Path to the base CSV file (required, Env: `BASE_CSV_FILE`)
- `--additional-csv-file <file>`: Path to the additional CSV file (required, Env: `ADDITIONAL_CSV_FILE`)
- `--header-column-keys <column>`: Column in the additional CSV to use as new column headers (required, Env: `HEADER_COLUMN_KEYS`)
- `--header-column-values <column>`: Column in the additional CSV to use as cell values (required, Env: `HEADER_COLUMN_VALUES`)
- `--base-csv-columns <columns>`: Comma-separated column names in the base CSV used for matching rows (Default: `Org_Name,Repo_Name`, Env: `BASE_CSV_COLUMNS`)
- `--additional-csv-columns <columns>`: Comma-separated column names in the additional CSV used for matching rows (Default: `owner,name`, Env: `ADDITIONAL_CSV_COLUMNS`)
- `--output-file-name <name>`: Name for the output CSV file (default: auto-generated with timestamp, Env: `ROWS_TO_COLUMNS_OUTPUT_FILE`)
- `--output-dir <dir>`: Output directory for the combined file (Default: `output`, Env: `OUTPUT_DIR`)
- `-v, --verbose`: Enable verbose logging (Env: `VERBOSE`)

## How It Works

1. For each row in the base CSV, the command finds matching rows in the additional CSV based on the specified column mappings (`--base-csv-columns` ↔ `--additional-csv-columns`).
2. When matches are found, new columns are added to the base CSV row:
   - Column names are taken from the `--header-column-keys` column in the additional CSV
   - Values are taken from the `--header-column-values` column, parsed for digits:
     - **Digits found**: The extracted number becomes the cell value (e.g., `"Found 5 large files"` → `5`)
     - **No digits found**: The value is set to `1+` (row existed but had no numeric data)
     - **No matching row**: The value is set to `0`
3. A `Has_Unmigratable` column is added to indicate whether any matching rows were found (`TRUE` or `FALSE`)

## Examples

### Combine with Migration Audit Data

The most common use case is combining repo-stats output with [gh-migration-audit](https://github.com/timrogers/gh-migration-audit) results:

```bash
gh repo-stats-plus rows-to-columns \
  --base-csv-file output/combined-stats.csv \
  --additional-csv-file output/migration-audit.csv \
  --header-column-keys type \
  --header-column-values message \
  --base-csv-columns Org_Name,Repo_Name \
  --additional-csv-columns owner,name
```

### Custom Output

```bash
gh repo-stats-plus rows-to-columns \
  --base-csv-file output/repo-stats.csv \
  --additional-csv-file output/audit.csv \
  --header-column-keys type \
  --header-column-values message \
  --output-file-name final-report.csv \
  --output-dir ./reports
```

### With Verbose Logging

```bash
gh repo-stats-plus rows-to-columns \
  --base-csv-file output/stats.csv \
  --additional-csv-file output/audit.csv \
  --header-column-keys type \
  --header-column-values message \
  --verbose
```

## Example Input/Output

### Base CSV (`repo-stats.csv`)

| Org_Name | Repo_Name | Size |
| -------- | --------- | ---- |
| myorg    | repo1     | 100  |
| myorg    | repo2     | 200  |

### Additional CSV (`migration-audit.csv`)

| owner | name  | type        | message              |
| ----- | ----- | ----------- | -------------------- |
| myorg | repo1 | large_files | Found 5 large files  |
| myorg | repo1 | git_lfs     | Has 3 LFS objects    |
| myorg | repo2 | large_files | Found 10 large files |

### Output CSV

| Org_Name | Repo_Name | Size | large_files | git_lfs | Has_Unmigratable |
| -------- | --------- | ---- | ----------- | ------- | ---------------- |
| myorg    | repo1     | 100  | 5           | 3       | TRUE             |
| myorg    | repo2     | 200  | 10          | 0       | TRUE             |

## Typical Workflow

This command is typically used after running a migration audit:

```bash
# 1. Collect repo statistics
gh repo-stats-plus repo-stats --org-name myorg

# 2. Run migration audit (separate tool)
gh migration-audit audit-all --owner myorg --owner-type organization --output-path output/audit.csv

# 3. Combine stats with audit data using rows-to-columns
gh repo-stats-plus rows-to-columns \
  --base-csv-file output/myorg-all_repos-*.csv \
  --additional-csv-file output/audit.csv \
  --header-column-keys type \
  --header-column-values message
```

The command can also be used as part of the `collect-stats.sh` script pipeline with the `--run-audit` and `--audit-file` options.
