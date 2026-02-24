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
#
# Usage:
#   ./script/lfs-size.sh <repo-url>
#   ./script/lfs-size.sh owner/repo          # shorthand for GitHub repos
#
# Examples:
#   ./script/lfs-size.sh https://github.com/owner/repo.git
#   ./script/lfs-size.sh owner/repo

# ── helpers ──────────────────────────────────────────────────────────

usage() {
  echo "Usage: $0 <repo-url | owner/repo>"
  echo ""
  echo "Report Git LFS object sizes for a GitHub repository."
  echo ""
  echo "Arguments:"
  echo "  repo-url    Full clone URL or GitHub owner/repo shorthand"
  echo ""
  echo "Examples:"
  echo "  $0 https://github.com/owner/repo.git"
  echo "  $0 owner/repo"
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

# Expand owner/repo shorthand to a full GitHub URL
if [[ "$REPO_INPUT" =~ ^[a-zA-Z0-9._-]+/[a-zA-Z0-9._-]+$ ]]; then
  REPO_URL="https://github.com/${REPO_INPUT}.git"
else
  REPO_URL="$REPO_INPUT"
fi

# ── dependency checks ────────────────────────────────────────────────

check_dependency git
check_dependency git-lfs

# ── clone & inspect ──────────────────────────────────────────────────

CLONE_DIR=$(mktemp -d)
trap cleanup EXIT

echo "Cloning ${REPO_URL} (bare, depth 1)..."
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
