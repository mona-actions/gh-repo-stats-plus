# LFS Sizing

The `repo-stats` command includes a `Has_LFS` column that detects whether a repository has Git LFS tracking configured. However, it does not report the actual size of LFS objects. For per-repository LFS sizing, use the standalone `lfs-size.sh` script included in this project.

## Prerequisites

- **git** (any recent version)
- **git-lfs** — Install from [https://git-lfs.com](https://git-lfs.com) or via your package manager:

  ```bash
  # macOS
  brew install git-lfs

  # Ubuntu / Debian
  sudo apt-get install git-lfs

  # Windows (via Chocolatey)
  choco install git-lfs
  ```

- Network access to the target repository
- **bc** (for arithmetic; pre-installed on most systems, may need to be installed in minimal containers)
- Appropriate authentication for private repositories (e.g., SSH keys, `gh auth`, or a credential helper)

## Usage

The script is located at `script/lfs-size.sh`. It supports two modes: single-repo and multi-repo.

### Single-Repo Mode

Accepts a repository URL or GitHub `owner/repo` shorthand:

```bash
# Using owner/repo shorthand
./script/lfs-size.sh owner/repo

# Using a full URL
./script/lfs-size.sh https://github.com/owner/repo.git
```

### Multi-Repo Mode

Process multiple repositories in the same organization with `--org` and `--repos`:

```bash
# Comma-separated list of repo names
./script/lfs-size.sh --org my-org --repos repo1,repo2,repo3

# With CSV output and authentication
./script/lfs-size.sh --org my-org --repos repo1,repo2,repo3 \
  --output-file output/lfs-sizing.csv --token ghp_xxxx
```

### Authentication

For private repositories or when your default git credentials don't have access, pass a Personal Access Token (PAT) via the `--token` flag or the `GH_TOKEN` environment variable. `GH_TOKEN` is **not** set automatically by `gh auth`; you must set it yourself (optionally using `gh auth token`):

```bash
# Using --token flag
./script/lfs-size.sh owner/repo --token ghp_xxxxxxxxxxxx

# Using GH_TOKEN environment variable (set manually)
GH_TOKEN=ghp_xxxxxxxxxxxx ./script/lfs-size.sh owner/repo

# Populating GH_TOKEN from GitHub CLI auth
GH_TOKEN=$(gh auth token) ./script/lfs-size.sh owner/repo
```

> **Security note:** When using the `--token` flag, your shell history may capture the token value. Prefer using the `GH_TOKEN` environment variable (for example via `gh auth`) to avoid storing tokens in your history.

The token is injected into the HTTPS clone URL as `x-access-token`, and the script itself does not echo it back to the console. However, underlying tools such as `git` may still include parts of the remote URL (and thus the token) in error messages or logs, so avoid sharing terminal output or logs produced while using a real token.

> **Security note:** Prefer the `GH_TOKEN` environment variable over `--token`. Command-line arguments are visible in process listings (e.g., `ps`) and may be captured in shell history or logs.

### GitHub Enterprise Server

For GitHub Enterprise Server (GHES) instances, use the `--base-url` flag to specify the base URL:

```bash
./script/lfs-size.sh --org my-org --repos repo1,repo2 \
  --base-url https://github.example.com
```

The default base URL is `https://github.com`.

### CSV Output

Use `--output-file` to write results to a CSV file. If the file doesn't exist, it will be created with headers. If it already exists, rows are appended:

```bash
# Single repo
./script/lfs-size.sh owner/repo --output-file output/lfs-sizing.csv

# Multiple repos — each repo gets its own row
./script/lfs-size.sh --org my-org --repos repo1,repo2,repo3 \
  --output-file output/lfs-sizing.csv
```

The CSV columns are: `Org_Name,Repo_Name,LFS_Objects,LFS_Size`

This CSV can be passed to `collect-stats.sh` via the `--lfs-file` flag to include LFS sizing data in the combined stats output.

## What It Does

1. **Shallow bare clone** — Clones only the latest commit metadata (no file checkout, no LFS object download) into a temporary directory.
2. **LFS inspection** — Runs `git lfs ls-files -s --all` to list every LFS-tracked file with its size.
3. **Summary** — Prints a per-file breakdown and a total object count with aggregate size.
4. **Cleanup** — Removes the temporary clone directory automatically on exit.

> **Note:** Depending on the size of the repository, the initial clone and LFS inspection can take some time — especially for repositories with large histories or many LFS-tracked files. The shallow bare clone minimizes this, but network speed and repository size will still affect duration.

## Example Output

```
Cloning https://github.com/owner/repo.git (bare, depth 1)...

=== LFS Objects ===

a1b2c3d4e5 * assets/logo.psd (12.4 MB)
f6g7h8i9j0 * data/training-set.zip (1.2 GB)
k1l2m3n4o5 * media/video.mp4 (450.0 MB)

=== Summary ===
LFS objects: 3
Total size:  1.64 GB
```

## How This Relates to `repo-stats`

| What you need                               | Tool to use                             |
| ------------------------------------------- | --------------------------------------- |
| Quick boolean check for LFS across an org   | `repo-stats` command → `Has_LFS` column |
| Actual LFS object sizes for a specific repo | `script/lfs-size.sh`                    |

The `Has_LFS` column in `repo-stats` is designed for bulk org-wide scanning and only checks whether `.gitattributes` contains `filter=lfs` entries. It uses the existing GraphQL query with zero additional API calls, making it efficient at scale but limited to detection only.

For repositories where `Has_LFS` is `TRUE` and you need to understand the storage impact, run `lfs-size.sh` against those specific repositories.

## Limitations

- **Requires a clone**: Even though the clone is shallow and bare (typically a few KB), it still requires network access and git authentication to the repository.
- **Default branch only**: The shallow clone fetches only the default branch. LFS objects tracked on other branches will not be included.
- **Point-in-time snapshot**: Reports LFS objects as of the latest commit on the default branch. Historical LFS objects that have been removed from HEAD are not counted.
- **Sequential processing**: In multi-repo mode, repositories are processed one at a time. For organizations with many repositories, this may take some time.
