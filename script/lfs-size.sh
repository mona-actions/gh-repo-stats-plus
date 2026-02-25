#!/bin/bash

set -e

# lfs-size.sh — Report Git LFS object sizes for GitHub repositories.
#
# Performs a shallow bare clone (no file checkout, no LFS download),
# then uses `git lfs ls-files -s` to list every LFS-tracked object
# with its size. Prints a per-file breakdown and a total.
#
# Supports single-repo and multi-repo modes. In multi-repo mode,
# provide --org with a comma-separated --repos list to process
# multiple repositories in the same organization.
#
# Prerequisites:
#   - git
#   - git-lfs (https://git-lfs.com)
#   - Network access to the repository
#   - bc (for arithmetic; pre-installed on most systems)
#
# Usage:
#   Single repo:
#     ./script/lfs-size.sh <repo-url>
#     ./script/lfs-size.sh owner/repo
#     ./script/lfs-size.sh owner/repo --token <PAT>
#     ./script/lfs-size.sh owner/repo --output-file output/lfs.csv
#
#   Multiple repos (same org):
#     ./script/lfs-size.sh --org <org> --repos repo1,repo2,repo3
#     ./script/lfs-size.sh --org <org> --repos repo1,repo2 --output-file output/lfs.csv
#
# Authentication:
#   --token <PAT>    Use a Personal Access Token for HTTPS authentication.
#                    If not provided, falls back to the GH_TOKEN environment
#                    variable (set by `gh auth`). If neither is set, the
#                    clone uses your default git credential helper.
#
#                    Security note: Prefer GH_TOKEN over --token to avoid
#                    exposing the token in process listings (e.g. ps).
#
# Options:
#   --org <org>           GitHub organization or owner name (multi-repo mode)
#   --repos <r1,r2,...>   Comma-separated list of repo names (requires --org)
#   --base-url <url>      GitHub base URL (Default: https://github.com)
#   --output-dir <dir>    Output directory for CSV file (Default: ./output)
#   --output-file <file>  Write results as CSV rows to this file.
#                         Relative paths are resolved under --output-dir.
#                         Creates the file with headers if it doesn't exist,
#                         otherwise appends rows.
#                         Columns: Org_Name,Repo_Name,LFS_Objects,LFS_Size
#
# Examples:
#   ./script/lfs-size.sh https://github.com/owner/repo.git
#   ./script/lfs-size.sh owner/repo
#   ./script/lfs-size.sh owner/repo --token ghp_xxxxxxxxxxxx
#   ./script/lfs-size.sh owner/repo --output-file output/lfs-sizing.csv
#   ./script/lfs-size.sh --org my-org --repos repo1,repo2,repo3
#   ./script/lfs-size.sh --org my-org --repos repo1,repo2 --output-file lfs.csv
#   ./script/lfs-size.sh --org my-org --repos repo1,repo2 --output-dir ./reports --output-file lfs.csv
#   GH_TOKEN=ghp_xxx ./script/lfs-size.sh --org my-org --repos repo1,repo2

# ── helpers ──────────────────────────────────────────────────────────

usage() {
  echo "Usage:"
  echo "  $0 <repo-url | owner/repo> [options]"
  echo "  $0 --org <org> --repos <repo1,repo2,...> [options]"
  echo ""
  echo "Report Git LFS object sizes for one or more GitHub repositories."
  echo ""
  echo "Arguments (single-repo mode):"
  echo "  repo-url    Full clone URL or GitHub owner/repo shorthand"
  echo ""
  echo "Options:"
  echo "  --org <org>          GitHub organization or owner (multi-repo mode)"
  echo "  --repos <r1,r2,...>  Comma-separated repo names (requires --org)"
  echo "  --base-url <url>     GitHub base URL (Default: https://github.com)"
  echo "  --output-dir <dir>   Output directory for CSV file (Default: ./output)"
  echo "  --token <PAT>        Personal Access Token for HTTPS authentication."
  echo "                       Falls back to GH_TOKEN env var if not provided."
  echo "                       Note: Prefer GH_TOKEN env var over --token to avoid"
  echo "                       exposing the token in process listings (e.g. ps)."
  echo "  --output-file <file> Write results as CSV rows to this file."
  echo "                       Relative paths resolved under --output-dir."
  echo "                       Creates file with headers if it doesn't exist,"
  echo "                       otherwise appends rows."
  echo ""
  echo "Examples:"
  echo "  $0 https://github.com/owner/repo.git"
  echo "  $0 owner/repo"
  echo "  $0 owner/repo --token ghp_xxxxxxxxxxxx"
  echo "  $0 owner/repo --output-file output/lfs-sizing.csv"
  echo "  $0 --org my-org --repos repo1,repo2,repo3"
  echo "  $0 --org my-org --repos repo1,repo2 --output-file lfs.csv"
  echo "  $0 --org my-org --repos repo1,repo2 --output-dir ./reports --output-file lfs.csv"
  echo "  GH_TOKEN=ghp_xxx $0 --org my-org --repos repo1,repo2"
  exit 1
}

check_dependency() {
  if ! command -v "$1" &>/dev/null; then
    echo "Error: '$1' is not installed or not in PATH."
    echo "See https://git-lfs.com for installation instructions."
    exit 1
  fi
}

# Ensure the CSV output file exists with headers
ensure_csv_header() {
  local output_file="$1"
  if [ ! -f "$output_file" ]; then
    mkdir -p "$(dirname "$output_file")"
    echo "Org_Name,Repo_Name,LFS_Objects,LFS_Size" > "$output_file"
  fi
}

# Format bytes into a human-readable size string
format_size() {
  local total_bytes="$1"
  local display unit

  if (( $(echo "$total_bytes >= 1073741824" | bc -l) )); then
    display=$(echo "scale=2; $total_bytes / 1073741824" | bc)
    unit="GB"
  elif (( $(echo "$total_bytes >= 1048576" | bc -l) )); then
    display=$(echo "scale=2; $total_bytes / 1048576" | bc)
    unit="MB"
  elif (( $(echo "$total_bytes >= 1024" | bc -l) )); then
    display=$(echo "scale=2; $total_bytes / 1024" | bc)
    unit="KB"
  else
    display="$total_bytes"
    unit="B"
  fi

  echo "${display} ${unit}"
}

# ── process_repo ─────────────────────────────────────────────────────
# Process a single repository: clone, inspect LFS objects, report, and
# optionally write a CSV row.
#
# Arguments:
#   $1 - org_name
#   $2 - repo_name
#   $3 - clone URL
#   $4 - display URL (safe for logging)
#   $5 - output file (empty string to skip CSV)

process_repo() {
  local org_name="$1"
  local repo_name="$2"
  local repo_url="$3"
  local display_url="$4"
  local output_file="$5"
  local clone_dir

  clone_dir=$(mktemp -d)
  # shellcheck disable=SC2064
  trap "rm -rf '$clone_dir'" RETURN

  echo "Cloning ${display_url} (bare, depth 1)..."
  # When a token is embedded in the URL, disable credential helpers and
  # interactive prompts so git doesn't override them with cached/stale creds
  # (e.g. macOS Keychain, gh auth setup-git).
  GIT_LFS_SKIP_SMUDGE=1 GIT_TERMINAL_PROMPT=0 \
    git -c credential.helper= clone --bare --depth 1 "$repo_url" "$clone_dir" 2>&1 | grep -v "^remote:" || true

  echo ""
  echo "=== LFS Objects ==="
  echo ""

  # Run git lfs ls-files inside the bare repo.
  # -s flag shows size; --all scans all refs (for bare repos).
  local lfs_output
  lfs_output=$(git -C "$clone_dir" lfs ls-files -s --all 2>&1) || true

  if [ -z "$lfs_output" ]; then
    echo "No LFS objects found in this repository."
    if [ -n "$output_file" ]; then
      ensure_csv_header "$output_file"
      echo "${org_name},${repo_name},0,0 B" >> "$output_file"
      echo "CSV row written to: $output_file"
    fi
    return 0
  fi

  # Print the per-file listing
  echo "$lfs_output"
  echo ""

  # Parse sizes and compute total.
  # git lfs ls-files -s output format:
  #   <oid-prefix> * path/to/file (size)
  #   <oid-prefix> - path/to/file (size)
  # Size is human-readable, e.g. "1.2 MB", "500 B", "3.4 KB", "2.1 GB"

  local total_bytes=0
  local file_count=0

  while IFS= read -r line; do
    if [[ "$line" =~ \(([0-9.]+)[[:space:]]*(B|KB|MB|GB|TB)\) ]]; then
      local value="${BASH_REMATCH[1]}"
      local unit="${BASH_REMATCH[2]}"
      local bytes

      case "$unit" in
        B)  bytes=$(echo "$value * 1" | bc) ;;
        KB) bytes=$(echo "$value * 1024" | bc) ;;
        MB) bytes=$(echo "$value * 1048576" | bc) ;;
        GB) bytes=$(echo "$value * 1073741824" | bc) ;;
        TB) bytes=$(echo "$value * 1099511627776" | bc) ;;
      esac

      total_bytes=$(echo "$total_bytes + $bytes" | bc)
      file_count=$((file_count + 1))
    fi
  done <<< "$lfs_output"

  local formatted_size
  formatted_size=$(format_size "$total_bytes")

  echo "=== Summary ==="
  echo "LFS objects: ${file_count}"
  echo "Total size:  ${formatted_size}"

  # Write CSV row
  if [ -n "$output_file" ]; then
    ensure_csv_header "$output_file"
    echo "${org_name},${repo_name},${file_count},${formatted_size}" >> "$output_file"
    echo ""
    echo "CSV row written to: $output_file"
  fi
}

# ── parse arguments ──────────────────────────────────────────────────

REPO_INPUT=""
TOKEN=""
OUTPUT_FILE=""
OUTPUT_DIR="./output"
ORG_NAME=""
REPOS=""
BASE_URL="https://github.com"

# Collect positional args and flags
POSITIONAL_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --token)
      if [ -z "$2" ]; then echo "Error: --token requires a value"; exit 1; fi
      TOKEN="$2"; shift 2
      ;;
    --output-file)
      if [ -z "$2" ]; then echo "Error: --output-file requires a value"; exit 1; fi
      OUTPUT_FILE="$2"; shift 2
      ;;
    --output-dir)
      if [ -z "$2" ]; then echo "Error: --output-dir requires a value"; exit 1; fi
      OUTPUT_DIR="$2"; shift 2
      ;;
    --org)
      if [ -z "$2" ]; then echo "Error: --org requires a value"; exit 1; fi
      ORG_NAME="$2"; shift 2
      ;;
    --repos)
      if [ -z "$2" ]; then echo "Error: --repos requires a value"; exit 1; fi
      REPOS="$2"; shift 2
      ;;
    --base-url)
      if [ -z "$2" ]; then echo "Error: --base-url requires a value"; exit 1; fi
      BASE_URL="$2"; shift 2
      ;;
    --help|-h)
      usage
      ;;
    -*)
      echo "Error: Unknown option '$1'"
      usage
      ;;
    *)
      POSITIONAL_ARGS+=("$1"); shift
      ;;
  esac
done

# Fall back to GH_TOKEN environment variable
if [ -z "$TOKEN" ] && [ -n "$GH_TOKEN" ]; then
  TOKEN="$GH_TOKEN"
fi

# ── resolve output paths ─────────────────────────────────────────────

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Resolve output file path: if relative (no leading /), prepend output dir
if [ -n "$OUTPUT_FILE" ] && [[ "$OUTPUT_FILE" != /* ]]; then
  OUTPUT_FILE="${OUTPUT_DIR}/${OUTPUT_FILE}"
fi

# ── input validation ─────────────────────────────────────────────────

# Determine mode: multi-repo (--org + --repos) or single-repo (positional)
if [ -n "$ORG_NAME" ] && [ -n "$REPOS" ]; then
  MODE="multi"
elif [ -n "$ORG_NAME" ] && [ -z "$REPOS" ]; then
  echo "Error: --org requires --repos"
  usage
elif [ -z "$ORG_NAME" ] && [ -n "$REPOS" ]; then
  echo "Error: --repos requires --org"
  usage
elif [ ${#POSITIONAL_ARGS[@]} -gt 0 ]; then
  MODE="single"
  REPO_INPUT="${POSITIONAL_ARGS[0]}"
else
  usage
fi

# ── dependency checks ────────────────────────────────────────────────

check_dependency git
check_dependency git-lfs
check_dependency bc

# ── build_clone_url ──────────────────────────────────────────────────
# Constructs the clone URL and a safe display URL for a given repo input.
# Sets REPO_URL and DISPLAY_URL variables.

build_clone_url() {
  local input="$1"

  # Normalize BASE_URL for git cloning:
  #   - https://api.github.com          → https://github.com
  #   - https://ghes.example.com/api/v3 → https://ghes.example.com
  local git_base_url="$BASE_URL"
  git_base_url="${git_base_url%/}"            # strip trailing slash
  git_base_url="${git_base_url%/api/v3}"      # strip GHES API suffix
  if [ "$git_base_url" = "https://api.github.com" ]; then
    git_base_url="https://github.com"
  fi

  if [[ "$input" =~ ^[a-zA-Z0-9._-]+/[a-zA-Z0-9._-]+$ ]]; then
    # owner/repo shorthand
    if [ -n "$TOKEN" ]; then
      REPO_URL="https://x-access-token:${TOKEN}@${git_base_url#https://}/${input}.git"
      DISPLAY_URL="${git_base_url}/${input}.git"
    else
      REPO_URL="${git_base_url}/${input}.git"
      DISPLAY_URL="$REPO_URL"
    fi
  else
    # Full URL
    if [ -n "$TOKEN" ] && [[ "$input" =~ ^https:// ]]; then
      local domain
      domain=$(echo "$input" | sed -E 's|https://([^/]+).*|\1|')
      REPO_URL=$(echo "$input" | sed "s|https://${domain}|https://x-access-token:${TOKEN}@${domain}|")
      DISPLAY_URL="$input"
    else
      REPO_URL="$input"
      DISPLAY_URL="$REPO_URL"
    fi
  fi
}

# ── execute ──────────────────────────────────────────────────────────

if [ "$MODE" = "multi" ]; then
  # Split comma-separated repos into an array
  IFS=',' read -ra REPO_LIST <<< "$REPOS"
  TOTAL_REPOS=${#REPO_LIST[@]}
  CURRENT=0

  echo "Processing ${TOTAL_REPOS} repositories for org: ${ORG_NAME}"
  echo ""

  for repo_name in "${REPO_LIST[@]}"; do
    # Trim whitespace
    repo_name=$(echo "$repo_name" | xargs)
    CURRENT=$((CURRENT + 1))

    echo "────────────────────────────────────────────────────────────"
    echo "[${CURRENT}/${TOTAL_REPOS}] ${ORG_NAME}/${repo_name}"
    echo "────────────────────────────────────────────────────────────"

    build_clone_url "${ORG_NAME}/${repo_name}"
    process_repo "$ORG_NAME" "$repo_name" "$REPO_URL" "$DISPLAY_URL" "$OUTPUT_FILE"

    echo ""
  done

  echo "=== All ${TOTAL_REPOS} repositories processed ==="
else
  # Single-repo mode
  # Extract org/repo from the input for CSV output
  local_org=""
  local_repo=""
  if [[ "$REPO_INPUT" =~ ^([a-zA-Z0-9._-]+)/([a-zA-Z0-9._-]+)$ ]]; then
    local_org="${BASH_REMATCH[1]}"
    local_repo="${BASH_REMATCH[2]}"
  elif [[ "$REPO_INPUT" =~ github\.com[/:]([a-zA-Z0-9._-]+)/([a-zA-Z0-9._-]+)(\.git)?$ ]]; then
    local_org="${BASH_REMATCH[1]}"
    local_repo="${BASH_REMATCH[2]}"
  fi

  build_clone_url "$REPO_INPUT"
  process_repo "$local_org" "$local_repo" "$REPO_URL" "$DISPLAY_URL" "$OUTPUT_FILE"
fi
