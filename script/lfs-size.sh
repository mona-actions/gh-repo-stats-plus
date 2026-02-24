#!/bin/bash

set -e

# lfs-size.sh — Report Git LFS object sizes for a GitHub repository.
#
# Performs a shallow bare clone (no file checkout, no LFS download),
# then uses `git lfs ls-files -s` to list every LFS-tracked object
# with its size. Prints a per-file breakdown and a total.
#
# Prerequisites:
#   - git
#   - git-lfs (https://git-lfs.com)
#   - Network access to the repository
#   - bc (for arithmetic; pre-installed on most systems)
#
# Usage:
#   ./script/lfs-size.sh <repo-url>
#   ./script/lfs-size.sh owner/repo          # shorthand for GitHub repos
#   ./script/lfs-size.sh owner/repo --token <PAT>
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
# Examples:
#   ./script/lfs-size.sh https://github.com/owner/repo.git
#   ./script/lfs-size.sh owner/repo
#   ./script/lfs-size.sh owner/repo --token ghp_xxxxxxxxxxxx
#   GH_TOKEN=ghp_xxx ./script/lfs-size.sh owner/repo

# ── helpers ──────────────────────────────────────────────────────────

usage() {
  echo "Usage: $0 <repo-url | owner/repo> [--token <PAT>]"
  echo ""
  echo "Report Git LFS object sizes for a GitHub repository."
  echo ""
  echo "Arguments:"
  echo "  repo-url    Full clone URL or GitHub owner/repo shorthand"
  echo ""
  echo "Options:"
  echo "  --token <PAT>  Personal Access Token for HTTPS authentication."
  echo "                 Falls back to GH_TOKEN env var if not provided."
  echo "                 Note: Prefer GH_TOKEN env var over --token to avoid"
  echo "                 exposing the token in process listings (e.g. ps)."
  echo ""
  echo "Examples:"
  echo "  $0 https://github.com/owner/repo.git"
  echo "  $0 owner/repo"
  echo "  $0 owner/repo --token ghp_xxxxxxxxxxxx"
  echo "  GH_TOKEN=ghp_xxx $0 owner/repo"
  exit 1
}

check_dependency() {
  if ! command -v "$1" &>/dev/null; then
    echo "Error: '$1' is not installed or not in PATH."
    echo "See https://git-lfs.com for installation instructions."
    exit 1
  fi
}

cleanup() {
  if [ -n "$CLONE_DIR" ] && [ -d "$CLONE_DIR" ]; then
    rm -rf "$CLONE_DIR"
  fi
}

# ── input validation ─────────────────────────────────────────────────

if [ -z "$1" ]; then
  usage
fi

REPO_INPUT="$1"
TOKEN=""

# Parse optional flags
shift
while [[ $# -gt 0 ]]; do
  case "$1" in
    --token)
      if [ -z "$2" ]; then
        echo "Error: --token requires a value"
        exit 1
      fi
      TOKEN="$2"
      shift 2
      ;;
    *)
      echo "Error: Unknown option '$1'"
      usage
      ;;
  esac
done

# Fall back to GH_TOKEN environment variable
if [ -z "$TOKEN" ] && [ -n "$GH_TOKEN" ]; then
  TOKEN="$GH_TOKEN"
fi

# Expand owner/repo shorthand to a full GitHub URL
if [[ "$REPO_INPUT" =~ ^[a-zA-Z0-9._-]+/[a-zA-Z0-9._-]+$ ]]; then
  if [ -n "$TOKEN" ]; then
    REPO_URL="https://x-access-token:${TOKEN}@github.com/${REPO_INPUT}.git"
    # Display URL without the token for logging
    DISPLAY_URL="https://github.com/${REPO_INPUT}.git"
  else
    REPO_URL="https://github.com/${REPO_INPUT}.git"
    DISPLAY_URL="$REPO_URL"
  fi
else
  # For full URLs, inject token if provided and URL is HTTPS GitHub
  if [ -n "$TOKEN" ] && [[ "$REPO_INPUT" =~ ^https://github\.com/ ]]; then
    REPO_URL=$(echo "$REPO_INPUT" | sed "s|https://github.com|https://x-access-token:${TOKEN}@github.com|")
    DISPLAY_URL="$REPO_INPUT"
  else
    REPO_URL="$REPO_INPUT"
    DISPLAY_URL="$REPO_URL"
  fi
fi

# ── dependency checks ────────────────────────────────────────────────

check_dependency git
check_dependency git-lfs
check_dependency bc

# ── clone & inspect ──────────────────────────────────────────────────

CLONE_DIR=$(mktemp -d)
trap cleanup EXIT

echo "Cloning ${DISPLAY_URL} (bare, depth 1)..."
GIT_LFS_SKIP_SMUDGE=1 git clone --bare --depth 1 "$REPO_URL" "$CLONE_DIR" 2>&1 | grep -v "^remote:" || true

echo ""
echo "=== LFS Objects ==="
echo ""

# Run git lfs ls-files inside the bare repo.
# -s flag shows size; --all scans all refs (for bare repos).
LFS_OUTPUT=$(git -C "$CLONE_DIR" lfs ls-files -s --all 2>&1) || true

if [ -z "$LFS_OUTPUT" ]; then
  echo "No LFS objects found in this repository."
  exit 0
fi

# Print the per-file listing
echo "$LFS_OUTPUT"
echo ""

# Parse sizes and compute total.
# git lfs ls-files -s output format:
#   <oid-prefix> * path/to/file (size)
#   <oid-prefix> - path/to/file (size)
# Size is human-readable, e.g. "1.2 MB", "500 B", "3.4 KB", "2.1 GB"

TOTAL_BYTES=0
FILE_COUNT=0

while IFS= read -r line; do
  # Extract the size portion inside parentheses
  if [[ "$line" =~ \(([0-9.]+)[[:space:]]*(B|KB|MB|GB|TB)\) ]]; then
    VALUE="${BASH_REMATCH[1]}"
    UNIT="${BASH_REMATCH[2]}"

    # Convert to bytes
    case "$UNIT" in
      B)  BYTES=$(echo "$VALUE * 1" | bc) ;;
      KB) BYTES=$(echo "$VALUE * 1024" | bc) ;;
      MB) BYTES=$(echo "$VALUE * 1048576" | bc) ;;
      GB) BYTES=$(echo "$VALUE * 1073741824" | bc) ;;
      TB) BYTES=$(echo "$VALUE * 1099511627776" | bc) ;;
    esac

    TOTAL_BYTES=$(echo "$TOTAL_BYTES + $BYTES" | bc)
    FILE_COUNT=$((FILE_COUNT + 1))
  fi
done <<< "$LFS_OUTPUT"

# Format total for display
if (( $(echo "$TOTAL_BYTES >= 1073741824" | bc -l) )); then
  TOTAL_DISPLAY=$(echo "scale=2; $TOTAL_BYTES / 1073741824" | bc)
  TOTAL_UNIT="GB"
elif (( $(echo "$TOTAL_BYTES >= 1048576" | bc -l) )); then
  TOTAL_DISPLAY=$(echo "scale=2; $TOTAL_BYTES / 1048576" | bc)
  TOTAL_UNIT="MB"
elif (( $(echo "$TOTAL_BYTES >= 1024" | bc -l) )); then
  TOTAL_DISPLAY=$(echo "scale=2; $TOTAL_BYTES / 1024" | bc)
  TOTAL_UNIT="KB"
else
  TOTAL_DISPLAY="$TOTAL_BYTES"
  TOTAL_UNIT="B"
fi

echo "=== Summary ==="
echo "LFS objects: ${FILE_COUNT}"
echo "Total size:  ${TOTAL_DISPLAY} ${TOTAL_UNIT}"
