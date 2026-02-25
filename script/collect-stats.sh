#!/bin/bash

set -e

# collect-stats.sh — Run repo-stats, project-stats, and combine-stats in sequence.
#
# Collects repository and project statistics for a GitHub organization,
# then combines the results into a single CSV file.
#
# Prerequisites:
#   - gh CLI (https://cli.github.com)
#   - gh-repo-stats-plus extension installed
#   - GitHub authentication (token or gh auth)
#
# Usage:
#   ./script/collect-stats.sh --org-name <org> [options]
#
# Required:
#   --org-name <org>         GitHub organization name
#
# Authentication (one required):
#   --access-token <token>   GitHub personal access token.
#                            Falls back to ACCESS_TOKEN or GH_TOKEN env var
#                            if not provided.
#
# Options:
#   --base-url <url>         GitHub API base URL (Default: https://api.github.com)
#   --output-dir <dir>       Output directory (Default: ./output)
#   --page-size <size>       Repos per batch for repo-stats (Default: 10)
#   --extra-page-size <size> Extra page size for repo-stats (Default: 25)
#   --match-columns <cols>   Comma-separated match columns for combine (Default: Org_Name,Repo_Name)
#   --skip-repo-stats        Skip the repo-stats step
#   --skip-project-stats     Skip the project-stats step
#   --repo-stats-file <file> Use an existing repo-stats CSV instead of running repo-stats
#   --project-stats-file <f> Use an existing project-stats CSV instead of running project-stats
#   --run-audit              Run migration audit (requires gh migration-audit extension)
#   --audit-file <file>      Use an existing audit CSV instead of running audit
#   --verbose                Enable verbose logging
#   --help                   Show this help message
#
# Examples:
#   ./script/collect-stats.sh --org-name my-org --access-token ghp_xxxx
#   ./script/collect-stats.sh --org-name my-org --output-dir ./reports
#   ACCESS_TOKEN=ghp_xxxx ./script/collect-stats.sh --org-name my-org
#   GH_TOKEN=ghp_xxxx ./script/collect-stats.sh --org-name my-org
#   ./script/collect-stats.sh --org-name my-org --repo-stats-file output/existing.csv
#   ./script/collect-stats.sh --org-name my-org --run-audit

# ── helpers ──────────────────────────────────────────────────────────

usage() {
  echo "Usage: $0 --org-name <org> [options]"
  echo ""
  echo "Run repo-stats, project-stats, and combine-stats in sequence."
  echo ""
  echo "Required:"
  echo "  --org-name <org>           GitHub organization name"
  echo ""
  echo "Authentication:"
  echo "  --access-token <token>     GitHub personal access token"
  echo "                             Falls back to ACCESS_TOKEN or GH_TOKEN env var"
  echo ""
  echo "Options:"
  echo "  --base-url <url>           GitHub API base URL (Default: https://api.github.com)"
  echo "  --output-dir <dir>         Output directory (Default: ./output)"
  echo "  --page-size <size>         Repos per batch for repo-stats (Default: 10)"
  echo "  --extra-page-size <size>   Extra page size for repo-stats (Default: 25)"
  echo "  --match-columns <cols>     Match columns for combine (Default: Org_Name,Repo_Name)"
  echo "  --skip-repo-stats          Skip the repo-stats step"
  echo "  --skip-project-stats       Skip the project-stats step"
  echo "  --repo-stats-file <file>   Use existing repo-stats CSV (skips repo-stats)"
  echo "  --project-stats-file <f>   Use existing project-stats CSV (skips project-stats)"
  echo "  --run-audit                Run migration audit (requires gh migration-audit)"
  echo "  --audit-file <file>        Use existing audit CSV (implies --run-audit)"
  echo "  --verbose                  Enable verbose logging"
  echo "  --help                     Show this help message"
  echo ""
  echo "Examples:"
  echo "  $0 --org-name my-org --access-token ghp_xxxx"
  echo "  $0 --org-name my-org --output-dir ./reports"
  echo "  ACCESS_TOKEN=ghp_xxxx $0 --org-name my-org"
  echo "  GH_TOKEN=ghp_xxxx $0 --org-name my-org"
  exit 1
}

extract_output_file() {
  echo "$1" | grep '^output_file=' | tail -1 | cut -d= -f2-
}

generate_timestamp() {
  date -u '+%Y%m%d%H%M'
}

# ── defaults ─────────────────────────────────────────────────────────

ORG_NAME=""
ACCESS_TOKEN="${ACCESS_TOKEN:-${GH_TOKEN:-}}"
BASE_URL="https://api.github.com"
OUTPUT_DIR="./output"
PAGE_SIZE="10"
EXTRA_PAGE_SIZE="25"
MATCH_COLUMNS="Org_Name,Repo_Name"
SKIP_REPO_STATS=false
SKIP_PROJECT_STATS=false
REPO_STATS_FILE=""
PROJECT_STATS_FILE=""
RUN_AUDIT=false
AUDIT_FILE=""
VERBOSE=""

# ── parse arguments ──────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --org-name)
      ORG_NAME="$2"; shift 2 ;;
    --access-token)
      ACCESS_TOKEN="$2"; shift 2 ;;
    --base-url)
      BASE_URL="$2"; shift 2 ;;
    --output-dir)
      OUTPUT_DIR="$2"; shift 2 ;;
    --page-size)
      PAGE_SIZE="$2"; shift 2 ;;
    --extra-page-size)
      EXTRA_PAGE_SIZE="$2"; shift 2 ;;
    --match-columns)
      MATCH_COLUMNS="$2"; shift 2 ;;
    --skip-repo-stats)
      SKIP_REPO_STATS=true; shift ;;
    --skip-project-stats)
      SKIP_PROJECT_STATS=true; shift ;;
    --repo-stats-file)
      REPO_STATS_FILE="$2"; SKIP_REPO_STATS=true; shift 2 ;;
    --project-stats-file)
      PROJECT_STATS_FILE="$2"; SKIP_PROJECT_STATS=true; shift 2 ;;
    --run-audit)
      RUN_AUDIT=true; shift ;;
    --audit-file)
      AUDIT_FILE="$2"; RUN_AUDIT=true; shift 2 ;;
    --verbose)
      VERBOSE="--verbose"; shift ;;
    --help|-h)
      usage ;;
    *)
      echo "Error: Unknown option '$1'"
      usage ;;
  esac
done

# ── validation ───────────────────────────────────────────────────────

if [ -z "$ORG_NAME" ]; then
  echo "Error: --org-name is required"
  usage
fi

if [ "$SKIP_REPO_STATS" = true ] && [ "$SKIP_PROJECT_STATS" = true ] \
   && [ -z "$REPO_STATS_FILE" ] && [ -z "$PROJECT_STATS_FILE" ]; then
  echo "Error: Nothing to do. Both steps skipped and no existing files provided."
  exit 1
fi

# Build common auth args
AUTH_ARGS=""
if [ -n "$ACCESS_TOKEN" ]; then
  AUTH_ARGS="--access-token $ACCESS_TOKEN"
fi

# ── step 1: repo-stats ──────────────────────────────────────────────

if [ "$SKIP_REPO_STATS" = false ]; then
  echo "=== Step 1: Running repo-stats for ${ORG_NAME} ==="

  TIMESTAMP=$(generate_timestamp)
  REPO_STATS_FILENAME=$(echo "${ORG_NAME}" | tr '[:upper:]' '[:lower:]')-all_repos-${TIMESTAMP}_ts.csv
  REPO_STATS_FILE="${OUTPUT_DIR}/${REPO_STATS_FILENAME}"

  gh repo-stats-plus repo-stats \
    --org-name "$ORG_NAME" \
    $AUTH_ARGS \
    --base-url "$BASE_URL" \
    --output-dir "$OUTPUT_DIR" \
    --output-file-name "$REPO_STATS_FILENAME" \
    --page-size "$PAGE_SIZE" \
    --extra-page-size "$EXTRA_PAGE_SIZE" \
    $VERBOSE

  echo "Repo stats file: $REPO_STATS_FILE"
else
  echo "=== Step 1: Skipping repo-stats ==="
  if [ -n "$REPO_STATS_FILE" ]; then
    echo "Using existing file: $REPO_STATS_FILE"
  fi
fi

# ── step 2: project-stats ───────────────────────────────────────────

if [ "$SKIP_PROJECT_STATS" = false ]; then
  echo "=== Step 2: Running project-stats for ${ORG_NAME} ==="

  TIMESTAMP=$(generate_timestamp)
  PROJECT_STATS_FILENAME=$(echo "${ORG_NAME}" | tr '[:upper:]' '[:lower:]')-project-stats-${TIMESTAMP}_ts.csv
  PROJECT_STATS_FILE="${OUTPUT_DIR}/${PROJECT_STATS_FILENAME}"

  gh repo-stats-plus project-stats \
    --org-name "$ORG_NAME" \
    $AUTH_ARGS \
    --base-url "$BASE_URL" \
    --output-dir "$OUTPUT_DIR" \
    --output-file-name "$PROJECT_STATS_FILENAME" \
    $VERBOSE

  echo "Project stats file: $PROJECT_STATS_FILE"
else
  echo "=== Step 2: Skipping project-stats ==="
  if [ -n "$PROJECT_STATS_FILE" ]; then
    echo "Using existing file: $PROJECT_STATS_FILE"
  fi
fi

# ── step 3: migration audit (optional) ──────────────────────────────

if [ "$RUN_AUDIT" = true ] && [ -z "$AUDIT_FILE" ]; then
  # Check if gh migration-audit is installed
  if gh extension list 2>/dev/null | grep -q 'migration-audit'; then
    echo ""
    echo "=== Step 3: Running migration audit for ${ORG_NAME} ==="

    TIMESTAMP=$(generate_timestamp)
    AUDIT_FILE="${OUTPUT_DIR}/$(echo "${ORG_NAME}" | tr '[:upper:]' '[:lower:]')-audit-${TIMESTAMP}_ts.csv"

    gh migration-audit audit-all \
      $AUTH_ARGS \
      --owner "$ORG_NAME" \
      --owner-type organization \
      --output-path "$AUDIT_FILE" \
      --base-url "$BASE_URL" \
      --disable-telemetry

    echo "Audit file: $AUDIT_FILE"
  else
    echo ""
    echo "=== Step 3: Skipping migration audit (gh migration-audit extension not installed) ==="
    echo "Install with: gh extension install github/gh-migration-audit"
  fi
elif [ "$RUN_AUDIT" = true ] && [ -n "$AUDIT_FILE" ]; then
  echo ""
  echo "=== Step 3: Using existing audit file: $AUDIT_FILE ==="
else
  echo ""
  echo "=== Step 3: Skipping migration audit (not requested) ==="
fi

# ── step 4: combine-stats ───────────────────────────────────────────

FILES_TO_COMBINE=""
if [ -n "$REPO_STATS_FILE" ]; then
  FILES_TO_COMBINE="$REPO_STATS_FILE"
fi
if [ -n "$PROJECT_STATS_FILE" ]; then
  FILES_TO_COMBINE="$FILES_TO_COMBINE $PROJECT_STATS_FILE"
fi

# Count files (trim whitespace)
FILE_COUNT=$(echo "$FILES_TO_COMBINE" | wc -w | tr -d ' ')

if [ "$FILE_COUNT" -lt 2 ]; then
  echo ""
  echo "=== Skipping combine-stats (need at least 2 files, have ${FILE_COUNT}) ==="
  if [ "$FILE_COUNT" -eq 1 ]; then
    echo "Output file: $FILES_TO_COMBINE"
  fi
  exit 0
fi

echo ""
echo "=== Step 4: Combining stats ==="

# shellcheck disable=SC2086
gh repo-stats-plus combine-stats \
  --files $FILES_TO_COMBINE \
  --match-columns "$MATCH_COLUMNS" \
  --output-dir "$OUTPUT_DIR" \
  $VERBOSE

echo ""
echo "=== Done ==="
