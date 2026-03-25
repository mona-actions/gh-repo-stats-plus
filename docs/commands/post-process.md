# post-process Command

Transforms CSV data using configurable rules for pattern matching, value replacement, and indicator column generation. Useful for standardizing and cleaning combined CSV output before reporting.

Based on the approach from [jcantosz/generate-repo-report/post-process](https://github.com/jcantosz/generate-repo-report/tree/main/post-process).

## Basic Syntax

```bash
gh repo-stats-plus post-process --input <file> --rules-file <file> [options]
```

## Options

- `--input <file>`: Path to the input CSV file to process (required, Env: `POST_PROCESS_INPUT`)
- `--rules-file <file>`: Path to the JSON rules configuration file (required, Env: `POST_PROCESS_RULES_FILE`)
- `--output-file-name <name>`: Name for the output CSV file (default: auto-generated with timestamp, Env: `POST_PROCESS_OUTPUT_FILE`)
- `--output-dir <dir>`: Output directory for the processed file (Default: `output`, Env: `OUTPUT_DIR`)
- `-v, --verbose`: Enable verbose logging (Env: `VERBOSE`)

## Examples

### Basic Usage

```bash
gh repo-stats-plus post-process \
  --input output/combined-stats.csv \
  --rules-file post-process.rules.json
```

### Custom Output

```bash
gh repo-stats-plus post-process \
  --input output/combined-stats.csv \
  --rules-file rules.json \
  --output-file-name final-report.csv \
  --output-dir ./reports
```

### With Verbose Logging

```bash
gh repo-stats-plus post-process \
  --input output/combined-stats.csv \
  --rules-file rules.json \
  --verbose
```

## Rules Configuration

The rules are defined in a JSON file with the following structure:

```json
{
  "rules": [
    {
      "columns": ["*"],
      "pattern": "(\\d+)",
      "fallback": "1+",
      "emptyValue": "0",
      "replacement": "$1"
    }
  ],
  "processColumns": {
    "columnRanges": [{ "start": 28 }]
  },
  "indicatorColumns": [
    {
      "name": "has_unmigratable",
      "sourceColumnRanges": [{ "start": 28 }],
      "trueValue": true,
      "falseValue": false
    }
  ]
}
```

### Rules Array (`rules`) — Required

Array of rule objects that define how to process columns. Each rule specifies:

| Property      | Required | Default | Description                                       |
| ------------- | -------- | ------- | ------------------------------------------------- |
| `columns`     | Yes      | —       | Array of column names or `"*"` wildcard           |
| `pattern`     | No       | —       | Regex pattern to match cell values                |
| `replacement` | No       | `"$0"`  | Replacement string (supports `$1`, `$2` captures) |
| `fallback`    | No       | `"1+"`  | Value when pattern doesn't match                  |
| `emptyValue`  | No       | `"0"`   | Value for empty/null cells                        |

- Later rules take **precedence** over earlier ones for the same column.
- Use `"*"` in the columns array to create a wildcard rule that applies to all columns not matched by more specific rules.
- Pattern matching is **case-insensitive**.

### Process Columns (`processColumns`) — Optional

Specifies which columns to process. If omitted, all columns are processed.

| Property       | Description                                            |
| -------------- | ------------------------------------------------------ |
| `columns`      | Array of column names to process                       |
| `columnRanges` | Array of ranges or indices (zero-based, end exclusive) |

Column ranges can be specified as:

- **Single number**: `5` — process from index 5 to end (equivalent to `{"start": 5}`)
- **Start-only**: `{"start": 3}` — process from index 3 to end
- **Full range**: `{"start": 2, "end": 5}` — process columns 2 through 4

### Indicator Columns (`indicatorColumns`) — Optional

Define new columns computed from the state of other columns. Each indicator:

| Property             | Required | Description                       |
| -------------------- | -------- | --------------------------------- |
| `name`               | Yes      | Name of the new column            |
| `trueValue`          | Yes      | Value when conditions are met     |
| `falseValue`         | Yes      | Value when conditions are not met |
| `sourceColumns`      | No       | Specific column names to check    |
| `sourceColumnRanges` | No       | Ranges of columns to check        |

If neither `sourceColumns` nor `sourceColumnRanges` is provided, all columns are checked.

An indicator is set to `trueValue` if **any** source column contains a non-empty value (different from that column's configured `emptyValue`).

## Value Processing Order

Values are processed in the following order:

1. **Check if empty/null** → use `emptyValue`
2. **Try to match `pattern`** → if matches, apply `replacement`
3. **If no match** → use `fallback`

The `replacement` string supports regex capture groups:

- `$0`: Full match
- `$1`, `$2`, etc.: Numbered capture group matches

## Rules Precedence

When multiple rules apply to the same column, the **last matching rule** in the `rules` array takes precedence. This allows for a general wildcard rule at the start with more specific rules later:

```json
{
  "rules": [
    {
      "columns": ["*"],
      "pattern": "(\\d+)",
      "fallback": "1+",
      "emptyValue": "0"
    },
    {
      "columns": ["repository-releases"],
      "pattern": "(\\d+[.]?\\d*\\s+[GgTt][Bb])",
      "fallback": ">5 GB",
      "replacement": ">$1"
    }
  ]
}
```

Here, `repository-releases` uses the second rule while all other columns use the wildcard rule.

## Example Rules Files

### Extract Numbers from All Columns

```json
{
  "rules": [
    {
      "columns": ["*"],
      "pattern": "(\\d+)",
      "fallback": "1+",
      "emptyValue": "0",
      "replacement": "$1"
    }
  ]
}
```

### Boolean Columns with Size Extraction

```json
{
  "rules": [
    {
      "columns": ["git-lfs-objects", "git-submodules"],
      "fallback": true,
      "emptyValue": false
    },
    {
      "columns": ["repository-releases", "repository-disk-usage"],
      "pattern": "(\\d+[.]?\\d*\\s+[KkMmGgTt][Bb])",
      "fallback": ">1 GB",
      "emptyValue": "No problem",
      "replacement": "$1"
    }
  ]
}
```

### With Process Columns and Indicators

```json
{
  "rules": [
    {
      "columns": ["*"],
      "pattern": "(\\d+)",
      "fallback": "1+",
      "emptyValue": "0",
      "replacement": "$1"
    }
  ],
  "processColumns": {
    "columnRanges": [{ "start": 28 }]
  },
  "indicatorColumns": [
    {
      "name": "has_unmigratable",
      "sourceColumnRanges": [{ "start": 28 }],
      "trueValue": true,
      "falseValue": false
    }
  ]
}
```

## Output

The command produces a single CSV file containing the transformed data. Any indicator columns are appended after all existing columns.

The output file path is logged and printed as `output_file=<path>` for easy use in scripts and pipelines.

## Sample Rules File

A ready-to-use example rules file is included at [`docs/examples/post-process.rules.json`](../examples/post-process.rules.json). This demonstrates wildcard rules, boolean columns, size extraction with overrides, process column ranges, and indicator columns. Copy and modify it to suit your needs:

```bash
gh repo-stats-plus post-process \
  --input output/combined-stats.csv \
  --rules-file docs/examples/post-process.rules.json
```
