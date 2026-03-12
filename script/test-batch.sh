#!/bin/bash

set -e

# test-batch.sh — Test batch processing for repo-stats and project-stats.
#
# Runs repo-stats and project-stats with batch processing options to verify
# that batching, stagger delays, and state management work correctly.
#
# Prerequisites:
#   - gh CLI (https://cli.github.com)
#   - gh-repo-stats-plus extension installed (or use --local for local dev)
#   - GitHub authentication (token or gh auth)
#
# Usage:
#   ./script/test-batch.sh --org-name <org> [options]
#
# Required:
#   --org-name <org>           GitHub organization name
#
# Authentication (one required):
#   --access-token <token>     GitHub personal access token.
#                              Falls back to ACCESS_TOKEN or GH_TOKEN env var.
#
# Options:
#   --base-url <url>           GitHub API base URL (Default: https://api.github.com)
#   --output-dir <dir>         Output directory (Default: ./output)
#   --batch-size <size>        Repos per batch (Default: 5)
#   --batch-index <index>      Zero-based batch index to process (Default: 0)
#   --batch-count <count>      Run all batches 0..count-1 sequentially (overrides --batch-index)
#   --batch-delay <seconds>    Stagger delay per batch index (Default: 0)
#   --page-size <size>         Items per page for repo-stats (Default: 10)
#   --extra-page-size <size>   Extra page size for repo-stats (Default: 25)
#   --skip-repo-stats          Skip the repo-stats step
#   --skip-project-stats       Skip the project-stats step
#   --resume                   Resume from last saved state
#   --fresh                    Force a fresh start, ignore existing state
#   --clean-state              Remove state file after successful completion
#   --local                    Run via tsx (local dev) instead of gh extension
#   --verbose                  Enable verbose logging
#   --help                     Show this help message
#
# Examples:
#   ./script/test-batch.sh --org-name my-org --batch-size 5 --batch-index 0
#   ./script/test-batch.sh --org-name my-org --batch-size 10 --batch-index 1 --batch-delay 5
#   ./script/test-batch.sh --org-name my-org --batch-size 5 --batch-count 4
#   ./script/test-batch.sh --org-name my-org --resume --verbose
#   ./script/test-batch.sh --org-name my-org --local --verbose

# ── helpers ──────────────────────────────────────────────────────────

usage() {
  echo "Usage: $0 --org-name <org> [options]"
  echo ""
  echo "Test batch processing for repo-stats and project-stats."
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
  echo "  --batch-size <size>        Repos per batch (Default: 5)"
  echo "  --batch-index <index>      Zero-based batch index (Default: 0)"
  echo "  --batch-count <count>      Run all batches 0..count-1 (overrides --batch-index)"
  echo "  --batch-delay <seconds>    Stagger delay per batch index (Default: 0)"
  echo "  --page-size <size>         Items per page for repo-stats (Default: 10)"
  echo "  --extra-page-size <size>   Extra page size for repo-stats (Default: 25)"
  echo "  --skip-repo-stats          Skip the repo-stats step"
  echo "  --skip-project-stats       Skip the project-stats step"
  echo "  --resume                   Resume from last saved state"
  echo "  --fresh                    Force a fresh start, ignore existing state"
  echo "  --clean-state              Remove state file after successful completion"
  echo "  --local                    Run via tsx (local dev) instead of gh extension"
  echo "  --verbose                  Enable verbose logging"
  echo "  --help                     Show this help message"
  echo ""
  echo "Examples:"
  echo "  $0 --org-name my-org --batch-size 5 --batch-index 0"
  echo "  $0 --org-name my-org --batch-size 10 --batch-index 1 --batch-delay 5"
  echo "  $0 --org-name my-org --batch-size 5 --batch-count 4"
  echo "  $0 --org-name my-org --resume --verbose"
  echo "  $0 --org-name my-org --local --verbose"
  exit 1
}

generate_timestamp() {
  date -u '+%Y%m%d%H%M'
}

# ── defaults ─────────────────────────────────────────────────────────

ORG_NAME=""
ACCESS_TOKEN="${ACCESS_TOKEN:-${GH_TOKEN:-}}"
BASE_URL="https://api.github.com"
OUTPUT_DIR="./output"
BATCH_SIZE="5"
BATCH_INDEX="0"
BATCH_COUNT=""
BATCH_DELAY="0"
PAGE_SIZE="10"
EXTRA_PAGE_SIZE="25"
SKIP_REPO_STATS=false
SKIP_PROJECT_STATS=false
RESUME=""
FRESH=""
CLEAN_STATE=""
LOCAL=false
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
    --batch-size)
      BATCH_SIZE="$2"; shift 2 ;;
    --batch-index)
      BATCH_INDEX="$2"; shift 2 ;;
    --batch-count)
      BATCH_COUNT="$2"; shift 2 ;;
    --batch-delay)
      BATCH_DELAY="$2"; shift 2 ;;
    --page-size)
      PAGE_SIZE="$2"; shift 2 ;;
    --extra-page-size)
      EXTRA_PAGE_SIZE="$2"; shift 2 ;;
    --skip-repo-stats)
      SKIP_REPO_STATS=true; shift ;;
    --skip-project-stats)
      SKIP_PROJECT_STATS=true; shift ;;
    --resume)
      RESUME="--resume-from-last-save"; shift ;;
    --fresh)
      FRESH="--force-fresh-start"; shift ;;
    --clean-state)
      CLEAN_STATE="--clean-state"; shift ;;
    --local)
      LOCAL=true; shift ;;
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

if [ "$SKIP_REPO_STATS" = true ] && [ "$SKIP_PROJECT_STATS" = true ]; then
  echo "Error: Nothing to do. Both repo-stats and project-stats are skipped."
  exit 1
fi

# Validate numeric options to avoid arithmetic errors later

# BATCH_SIZE: integer >= 1
if ! [[ "$BATCH_SIZE" =~ ^[0-9]+$ ]]; then
  echo "Error: --batch-size must be a positive integer (got: '$BATCH_SIZE')"
  exit 1
fi
if [ "$BATCH_SIZE" -lt 1 ]; then
  echo "Error: --batch-size must be at least 1 (got: $BATCH_SIZE)"
  exit 1
fi

# BATCH_INDEX: integer >= 0
if ! [[ "$BATCH_INDEX" =~ ^[0-9]+$ ]]; then
  echo "Error: --batch-index must be a non-negative integer (got: '$BATCH_INDEX')"
  exit 1
fi

# BATCH_COUNT: optional, but if set must be integer >= 1
if [ -n "$BATCH_COUNT" ]; then
  if ! [[ "$BATCH_COUNT" =~ ^[0-9]+$ ]]; then
    echo "Error: --batch-count must be a positive integer (got: '$BATCH_COUNT')"
    exit 1
  fi
  if [ "$BATCH_COUNT" -lt 1 ]; then
    echo "Error: --batch-count must be at least 1 (got: $BATCH_COUNT)"
    exit 1
  fi
fi

# BATCH_DELAY: integer >= 0
if ! [[ "$BATCH_DELAY" =~ ^[0-9]+$ ]]; then
  echo "Error: --batch-delay must be a non-negative integer (got: '$BATCH_DELAY')"
  exit 1
fi

# PAGE_SIZE: integer >= 1
if ! [[ "$PAGE_SIZE" =~ ^[0-9]+$ ]]; then
  echo "Error: --page-size must be a positive integer (got: '$PAGE_SIZE')"
  exit 1
fi
if [ "$PAGE_SIZE" -lt 1 ]; then
  echo "Error: --page-size must be at least 1 (got: $PAGE_SIZE)"
  exit 1
fi

# EXTRA_PAGE_SIZE: integer >= 1
if ! [[ "$EXTRA_PAGE_SIZE" =~ ^[0-9]+$ ]]; then
  echo "Error: --extra-page-size must be a positive integer (got: '$EXTRA_PAGE_SIZE')"
  exit 1
fi
if [ "$EXTRA_PAGE_SIZE" -lt 1 ]; then
  echo "Error: --extra-page-size must be at least 1 (got: $EXTRA_PAGE_SIZE)"
  exit 1
fi
# Build the run command prefix
if [ "$LOCAL" = true ]; then
  RUN_CMD="npx tsx src/index.ts"
else
  RUN_CMD="gh repo-stats-plus"
fi

# Build common auth args
AUTH_ARGS=""
if [ -n "$ACCESS_TOKEN" ]; then
  AUTH_ARGS="--access-token $ACCESS_TOKEN"
fi

# Build common state args
STATE_ARGS=""
if [ -n "$RESUME" ]; then
  STATE_ARGS="$STATE_ARGS $RESUME"
fi
if [ -n "$FRESH" ]; then
  STATE_ARGS="$STATE_ARGS $FRESH"
fi
if [ -n "$CLEAN_STATE" ]; then
  STATE_ARGS="$STATE_ARGS $CLEAN_STATE"
fi

mkdir -p "$OUTPUT_DIR"

echo "============================================"
echo "  Batch Processing Test"
echo "============================================"
echo "Organization:    $ORG_NAME"
echo "Batch size:      $BATCH_SIZE"
if [ -n "$BATCH_COUNT" ]; then
echo "Batch count:     $BATCH_COUNT (running batches 0..$(( BATCH_COUNT - 1 )))"
else
echo "Batch index:     $BATCH_INDEX"
fi
echo "Batch delay:     ${BATCH_DELAY}s"
echo "Output dir:      $OUTPUT_DIR"
echo "Run mode:        $([ "$LOCAL" = true ] && echo "local (tsx)" || echo "gh extension")"
echo "============================================"
echo ""

# ── run functions ────────────────────────────────────────────────────

run_repo_stats() {
  local batch_idx="$1"

  echo "=== Running repo-stats (batch ${batch_idx}, size ${BATCH_SIZE}) ==="

  TIMESTAMP=$(generate_timestamp)
  REPO_STATS_FILENAME=$(echo "${ORG_NAME}" | tr '[:upper:]' '[:lower:]')-repos-batch${batch_idx}-${TIMESTAMP}.csv

  # shellcheck disable=SC2086
  $RUN_CMD repo-stats \
    --org-name "$ORG_NAME" \
    $AUTH_ARGS \
    --base-url "$BASE_URL" \
    --output-dir "$OUTPUT_DIR" \
    --output-file-name "$REPO_STATS_FILENAME" \
    --page-size "$PAGE_SIZE" \
    --extra-page-size "$EXTRA_PAGE_SIZE" \
    --batch-size "$BATCH_SIZE" \
    --batch-index "$batch_idx" \
    --batch-delay "$BATCH_DELAY" \
    $STATE_ARGS \
    $VERBOSE

  echo ""
  echo "Repo stats output: ${OUTPUT_DIR}/${REPO_STATS_FILENAME}"
  echo ""
}

run_project_stats() {
  local batch_idx="$1"

  echo "=== Running project-stats (batch ${batch_idx}, size ${BATCH_SIZE}) ==="

  TIMESTAMP=$(generate_timestamp)
  PROJECT_STATS_FILENAME=$(echo "${ORG_NAME}" | tr '[:upper:]' '[:lower:]')-projects-batch${batch_idx}-${TIMESTAMP}.csv

  # shellcheck disable=SC2086
  $RUN_CMD project-stats \
    --org-name "$ORG_NAME" \
    $AUTH_ARGS \
    --base-url "$BASE_URL" \
    --output-dir "$OUTPUT_DIR" \
    --output-file-name "$PROJECT_STATS_FILENAME" \
    --batch-size "$BATCH_SIZE" \
    --batch-index "$batch_idx" \
    --batch-delay "$BATCH_DELAY" \
    $STATE_ARGS \
    $VERBOSE

  echo ""
  echo "Project stats output: ${OUTPUT_DIR}/${PROJECT_STATS_FILENAME}"
  echo ""
}

# ── execute ──────────────────────────────────────────────────────────

if [ -n "$BATCH_COUNT" ]; then
  # Run all batches sequentially
  for (( i=0; i<BATCH_COUNT; i++ )); do
    echo "--------------------------------------------"
    echo "  Batch $i of $((BATCH_COUNT - 1))"
    echo "--------------------------------------------"

    if [ "$SKIP_REPO_STATS" = false ]; then
      run_repo_stats "$i"
    fi

    if [ "$SKIP_PROJECT_STATS" = false ]; then
      run_project_stats "$i"
    fi
  done
else
  # Run a single batch
  if [ "$SKIP_REPO_STATS" = false ]; then
    run_repo_stats "$BATCH_INDEX"
  else
    echo "=== Skipping repo-stats ==="
    echo ""
  fi

  if [ "$SKIP_PROJECT_STATS" = false ]; then
    run_project_stats "$BATCH_INDEX"
  else
    echo "=== Skipping project-stats ==="
    echo ""
  fi
fi

echo "============================================"
echo "  Done"
echo "============================================"
