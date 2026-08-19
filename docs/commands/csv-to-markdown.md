# csv-to-markdown Command

Converts CSV files into markdown output for CLI workflows, GitHub Action summaries, and report generation. Supports both full markdown tables and a vertical metric/value layout for single-row statistics.

## Basic Syntax

```bash
gh repo-stats-plus csv-to-markdown --input <file> [options]
```

## Options

- `--input <file>`: Path to the input CSV file (required, Env: `CSV_TO_MARKDOWN_INPUT`)
- `--format <format>`: Markdown output format: `table` or `vertical` (Default: `table`, Env: `CSV_TO_MARKDOWN_FORMAT`)
- `--title <title>`: Optional section title written as a level-two markdown heading (Env: `CSV_TO_MARKDOWN_TITLE`)
- `--output-file-name <name>`: Name for the output markdown file (default: auto-generated with timestamp, Env: `CSV_TO_MARKDOWN_OUTPUT_FILE`)
- `--output-dir <dir>`: Output directory for the markdown file (Default: `output`, Env: `OUTPUT_DIR`)
- `-v, --verbose`: Enable verbose logging (Env: `VERBOSE`)

## Formats

### `table`

Uses the first CSV row as headers and renders all remaining rows as a standard markdown table. This is a good fit for two-column CSV output such as migration audit reports.

### `vertical`

Uses the first CSV row as headers and the **last** CSV row as values, then renders a two-column markdown table with `Metric` and `Value` headings. This matches the repository summary format used by the GitHub Action.

## Examples

### Repository Statistics Summary

```bash
gh repo-stats-plus csv-to-markdown \
  --input output/mona-actions-all_repos-202606250000_ts.csv \
  --format vertical \
  --title "📊 Repository Statistics" \
  --output-file-name stats.md
```

### Migration Audit Markdown Table

```bash
gh repo-stats-plus csv-to-markdown \
  --input output/gh-repo-stats-plus-audit.csv \
  --format table \
  --title "🔍 Migration Audit Results" \
  --output-file-name audit.md
```

## Example Input/Output

### Vertical Input CSV

```csv
Org_Name,Repo_Name,Record_Count
mona-actions,gh-repo-stats-plus,25
```

### Vertical Markdown Output

```markdown
## 📊 Repository Statistics

| Metric       | Value              |
| ------------ | ------------------ |
| Org_Name     | mona-actions       |
| Repo_Name    | gh-repo-stats-plus |
| Record_Count | 25                 |
```

### Table Input CSV

```csv
type,message
large_files,Found 5 large files
git_lfs,Has 3 LFS objects
```

### Table Markdown Output

```markdown
## 🔍 Migration Audit Results

| type        | message             |
| ----------- | ------------------- |
| large_files | Found 5 large files |
| git_lfs     | Has 3 LFS objects   |
```
