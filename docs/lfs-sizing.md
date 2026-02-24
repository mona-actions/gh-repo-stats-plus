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
- Appropriate authentication for private repositories (e.g., SSH keys, `gh auth`, or a credential helper)

## Usage

The script is located at `script/lfs-size.sh`. It accepts a repository URL or GitHub `owner/repo` shorthand:

```bash
# Using owner/repo shorthand
./script/lfs-size.sh owner/repo

# Using a full URL
./script/lfs-size.sh https://github.com/owner/repo.git
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

The token is injected into the HTTPS clone URL as `x-access-token` and is never printed to the console.

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
- **Manual process**: This script must be run individually per repository. It is not integrated into the automated `repo-stats` pipeline.
