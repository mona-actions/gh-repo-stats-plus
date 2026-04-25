# org-repos Command

Lists all repositories for an organization. Optionally writes the list to a file and outputs a batch matrix for parallel processing (e.g., GitHub Actions matrix strategy).

## Basic Syntax

```bash
gh repo-stats-plus org-repos [options]
```

## Options

### Core Options

- `-o, --org-name <org>`: The name of the organization (Required, Env: `ORG_NAME`)
- `-t, --access-token <token>`: GitHub access token (Env: `ACCESS_TOKEN`)
- `-u, --base-url <url>`: GitHub API base URL (Default: `https://api.github.com`, Env: `BASE_URL`)
- `--proxy-url <url>`: Proxy URL if required (Env: `PROXY_URL`)
- `--ca-cert <path>`: Path to CA certificate bundle (PEM) for TLS verification (e.g. GHES with internal CA, Env: `NODE_EXTRA_CA_CERTS`)
- `--api-version <version>`: GitHub API version to use (`2022-11-28` or `2026-03-10`, Default: `2022-11-28`, Env: `GITHUB_API_VERSION`)
- `-v, --verbose`: Enable verbose logging (Env: `VERBOSE`)

### GitHub App Authentication

- `--app-id <id>`: GitHub App ID (Env: `APP_ID`)
- `--private-key <key>`: GitHub App private key content (Env: `PRIVATE_KEY`)
- `--private-key-file <file>`: Path to GitHub App private key file (Env: `PRIVATE_KEY_FILE`)
- `--app-installation-id <id>`: GitHub App installation ID (optional — automatically looked up if omitted, Env: `APP_INSTALLATION_ID`)

### Performance

- `--page-size <size>`: Number of repos per API page (Default: 100, Env: `PAGE_SIZE`)

### Output

- `--output-dir <dir>`: Output directory for generated files (Default: `output`, Env: `OUTPUT_DIR`)
- `--output-file-name <name>`: Name for the output file containing the repo list (one `owner/repo` per line). Defaults to an auto-generated timestamped filename when `--save-repo-list` is set. (Env: `OUTPUT_FILE_NAME`)
- `--save-repo-list [value]`: Write the full repo list to a file in the output directory (Env: `SAVE_REPO_LIST`)

### Batch Matrix

- `--batch-size <size>`: When provided, calculates a batch matrix splitting repos into chunks of this size. Outputs a `batch-index` array, total batch count, and the effective batch size. (Env: `BATCH_SIZE`)
- `--max-batches <count>`: Maximum number of batches allowed when using `--batch-size` (Default: 256). If the computed batch count would exceed this limit, the batch size is automatically increased to stay within it. (Env: `MAX_BATCHES`)

## Examples

### List All Repos

Print all repositories in an organization to stdout (one `owner/repo` per line):

```bash
gh repo-stats-plus org-repos --org-name my-org
```

### Save Repo List to File

Write the repo list to a file (auto-generated timestamped name) in the default output directory:

```bash
gh repo-stats-plus org-repos --org-name my-org --save-repo-list
```

Specify a custom file name:

```bash
gh repo-stats-plus org-repos \
  --org-name my-org \
  --output-file-name repos.txt \
  --output-dir ./my-output
```

### Generate a Batch Matrix

Calculate how many batches are needed for a given batch size and print the matrix:

```bash
gh repo-stats-plus org-repos --org-name my-org --batch-size 50
```

Sample output for an org with 120 repos:

```
my-org/repo-1
my-org/repo-2
...

Batch matrix:
  Repos:         120
  Batch size:    50
  Total batches: 3
  Matrix:        {"batch-index":[0,1,2]}
```

### Limit Maximum Number of Batches

Cap the number of batches to 10, automatically adjusting batch size upward:

```bash
gh repo-stats-plus org-repos \
  --org-name my-org \
  --batch-size 10 \
  --max-batches 10
```

### Save Repo List and Generate Matrix Together

```bash
gh repo-stats-plus org-repos \
  --org-name my-org \
  --save-repo-list \
  --batch-size 100
```

### GitHub Enterprise Server

```bash
gh repo-stats-plus org-repos \
  --org-name my-org \
  --base-url https://ghes.example.com/api/v3 \
  --ca-cert /path/to/ca-bundle.pem
```

## Using the Batch Matrix with GitHub Actions

The `org-repos` command is designed to work as a **setup job** in a GitHub Actions matrix workflow. It fetches the full repo list once and produces the `batch-index` array used to fan out parallel `repo-stats` jobs.

### Example Workflow

```yaml
jobs:
  setup:
    runs-on: ubuntu-latest
    outputs:
      matrix: ${{ steps.org-repos.outputs.matrix }}
      batch-size: ${{ steps.org-repos.outputs.batch-size }}
    steps:
      - name: Get org repos and build matrix
        id: org-repos
        uses: mona-actions/gh-repo-stats-plus@v1
        with:
          command: org-repos
          organization: my-org
          batch-size: 50
          save-repo-list: true
          github-token: ${{ github.token }}

      - name: Upload repo list artifact
        uses: actions/upload-artifact@v4
        with:
          name: repo-list
          path: output/*.txt

  collect:
    needs: setup
    runs-on: ubuntu-latest
    strategy:
      matrix: ${{ fromJson(needs.setup.outputs.matrix) }}
    steps:
      - name: Download repo list
        uses: actions/download-artifact@v4
        with:
          name: repo-list
          path: output/

      - name: Run repo-stats for batch
        uses: mona-actions/gh-repo-stats-plus@v1
        with:
          command: repo-stats
          organization: my-org
          batch-size: ${{ needs.setup.outputs.batch-size }}
          batch-index: ${{ matrix.batch-index }}
          batch-repo-list-file: output/my-org-org-repos.txt
          github-token: ${{ github.token }}
```

See the [Batch Processing Guide](../batch-processing.md) for complete workflow examples.

## Output

- Prints all repositories to **stdout** (one `owner/repo` per line) in every case.
- When `--save-repo-list` or `--output-file-name` is set, also writes the list to a file.
- When `--batch-size` is set, prints a batch matrix summary to stdout with the `batch-index` array, total batch count, and effective batch size.
- Log files are written to the `logs/` directory.
