#!/usr/bin/env bash

set -Eeuo pipefail

# Compare in-progress repositories from migration-audit.csv in resumable chunks.
#
# Required environment:
#   SOURCE_TOKEN_OP_REF   1Password secret reference for the source token
#   TARGET_TOKEN_OP_REF   1Password secret reference for the target token
#
# Optional environment:
#   AUDIT_FILE            Audit CSV (default: analysis/migration-audit.csv)
#   OUTPUT_ROOT           Generated output root (default: analysis/output/compare-repos)
#   CHUNK_SIZE            Repositories per resumable chunk (default: 50)
#   MIGRATION_STATUS      Audit status to select (default: in-progress)
#   SOURCE_ORG            Expected source organization
#   SOURCE_API_URL        Source API URL
#   SOURCE_WEB_HOST       Expected source URL host
#   TARGET_ORG            Expected target organization
#   TARGET_API_URL        Target API URL
#   TARGET_WEB_HOST       Expected target URL host
#   SIZE_TOLERANCE_PCT    Repo size comparison tolerance (default: 10)
#
# Usage:
#   SOURCE_TOKEN_OP_REF='op://vault/source/token' \
#   TARGET_TOKEN_OP_REF='op://vault/target/token' \
#     ./analysis/compare-repos.sh
#
#   ./analysis/compare-repos.sh --dry-run
#   ./analysis/compare-repos.sh --force-fresh

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
HELPER="${SCRIPT_DIR}/compare-repos-data.ts"
TSX_BIN="${REPO_ROOT}/node_modules/.bin/tsx"

AUDIT_FILE="${AUDIT_FILE:-${SCRIPT_DIR}/migration-audit.csv}"
OUTPUT_ROOT="${OUTPUT_ROOT:-${SCRIPT_DIR}/output/compare-repos}"
CHUNK_SIZE="${CHUNK_SIZE:-50}"
MIGRATION_STATUS="${MIGRATION_STATUS:-in-progress}"
SOURCE_ORG="${SOURCE_ORG:-department-of-veterans-affairs}"
SOURCE_API_URL="${SOURCE_API_URL:-https://api.github.com}"
SOURCE_WEB_HOST="${SOURCE_WEB_HOST:-github.com}"
TARGET_ORG="${TARGET_ORG:-software}"
TARGET_API_URL="${TARGET_API_URL:-https://va.ghe.com/api/v3}"
TARGET_WEB_HOST="${TARGET_WEB_HOST:-va.ghe.com}"
SIZE_TOLERANCE_PCT="${SIZE_TOLERANCE_PCT:-10}"

DRY_RUN=false
FORCE_FRESH=false

usage() {
  cat <<'EOF'
Compare in-progress repositories from migration-audit.csv in resumable chunks.

Required environment:
  SOURCE_TOKEN_OP_REF   1Password secret reference for the source token
  TARGET_TOKEN_OP_REF   1Password secret reference for the target token

Optional environment:
  AUDIT_FILE            Audit CSV (default: analysis/migration-audit.csv)
  OUTPUT_ROOT           Output root (default: analysis/output/compare-repos)
  CHUNK_SIZE            Repositories per chunk (default: 50)
  MIGRATION_STATUS      Audit status to select (default: in-progress)
  SOURCE_ORG            Expected source organization
  SOURCE_API_URL        Source API URL
  SOURCE_WEB_HOST       Expected source URL host
  TARGET_ORG            Expected target organization
  TARGET_API_URL        Target API URL
  TARGET_WEB_HOST       Expected target URL host
  SIZE_TOLERANCE_PCT    Repo size tolerance (default: 10)

Usage:
  SOURCE_TOKEN_OP_REF='op://vault/source/token' \
  TARGET_TOKEN_OP_REF='op://vault/target/token' \
    ./analysis/compare-repos.sh

  ./analysis/compare-repos.sh --dry-run
  ./analysis/compare-repos.sh --force-fresh
EOF
}

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

log() {
  local message timestamp
  message="$*"
  timestamp="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  printf '%s %s\n' "${timestamp}" "${message}" | tee -a "${LOG_FILE}"
}

run_helper() {
  "${TSX_BIN}" "${HELPER}" "$@"
}

absolute_existing_file() {
  local path="$1"
  [[ -f "${path}" ]] || die "File not found: ${path}"
  (
    cd -- "$(dirname -- "${path}")"
    printf '%s/%s\n' "$(pwd -P)" "$(basename -- "${path}")"
  )
}

prepare_output_root() {
  mkdir -p -- "${OUTPUT_ROOT}"
  OUTPUT_ROOT="$(cd -- "${OUTPUT_ROOT}" && pwd -P)"
  RUN_DIR="${OUTPUT_ROOT}/run"
  mkdir -p -- "${RUN_DIR}"

  local marker="${RUN_DIR}/.compare-repos-output"
  if [[ ! -f "${marker}" ]] && find "${RUN_DIR}" -mindepth 1 -print -quit | grep -q .; then
    die "Refusing to use non-empty unrecognized run directory: ${RUN_DIR}"
  fi
  touch -- "${marker}"

  if [[ "${FORCE_FRESH}" == true ]]; then
    log "Removing generated files from the previous run"
    find "${RUN_DIR}" -mindepth 1 -type f ! -name '.compare-repos-output' -delete
  fi
}

validate_number_config() {
  [[ "${CHUNK_SIZE}" =~ ^[1-9][0-9]*$ ]] ||
    die "CHUNK_SIZE must be a positive integer"
  [[ "${SIZE_TOLERANCE_PCT}" =~ ^([0-9]+([.][0-9]+)?)$ ]] ||
    die "SIZE_TOLERANCE_PCT must be a number between 0 and 100"
  awk -v value="${SIZE_TOLERANCE_PCT}" 'BEGIN { exit !(value >= 0 && value <= 100) }' ||
    die "SIZE_TOLERANCE_PCT must be between 0 and 100"
}

preflight_local() {
  AUDIT_FILE="$(absolute_existing_file "${AUDIT_FILE}")"
  [[ -x "${TSX_BIN}" ]] ||
    die "tsx is not installed. Run npm install in ${REPO_ROOT}"
  [[ -f "${HELPER}" ]] || die "Data helper not found: ${HELPER}"
  validate_number_config
}

preflight_remote() {
  command -v op >/dev/null 2>&1 || die "1Password CLI (op) is required"
  command -v gh >/dev/null 2>&1 || die "GitHub CLI (gh) is required"
  [[ -n "${SOURCE_TOKEN_OP_REF:-}" ]] || die "SOURCE_TOKEN_OP_REF is required"
  [[ -n "${TARGET_TOKEN_OP_REF:-}" ]] || die "TARGET_TOKEN_OP_REF is required"

  op whoami >/dev/null 2>&1 || die "1Password CLI is not signed in"
  gh repo-stats-plus --version >/dev/null 2>&1 ||
    die "gh-repo-stats-plus is not installed or cannot run"

  SOURCE_ACCESS_TOKEN="$(op read "${SOURCE_TOKEN_OP_REF}")" ||
    die "Unable to read SOURCE_TOKEN_OP_REF"
  TARGET_ACCESS_TOKEN="$(op read "${TARGET_TOKEN_OP_REF}")" ||
    die "Unable to read TARGET_TOKEN_OP_REF"
  [[ -n "${SOURCE_ACCESS_TOKEN}" ]] || die "Source token is empty"
  [[ -n "${TARGET_ACCESS_TOKEN}" ]] || die "Target token is empty"
}

clear_ambient_command_env() {
  env \
    -u ACCESS_TOKEN \
    -u SOURCE_TOKEN \
    -u TARGET_TOKEN \
    -u SOURCE_FILE \
    -u TARGET_FILE \
    -u OUTPUT_DIR \
    -u OUTPUT_FILE \
    -u OUTPUT_FILE_NAME \
    -u BASE_URL \
    -u SOURCE_BASE_URL \
    -u TARGET_BASE_URL \
    -u SOURCE_ORG \
    -u TARGET_ORG \
    -u ORG_NAME \
    -u ORG_LIST \
    -u REPO_LIST \
    -u APP_ID \
    -u PRIVATE_KEY \
    -u PRIVATE_KEY_FILE \
    -u APP_INSTALLATION_ID \
    -u BATCH_SIZE \
    -u BATCH_INDEX \
    -u BATCH_DELAY \
    -u BATCH_REPO_LIST_FILE \
    -u FORCE_FRESH_START \
    -u RESUME_FROM_LAST_SAVE \
    -u AUTO_PROCESS_MISSING \
    -u CLEAN_STATE \
    -u CONTINUE_ON_ERROR \
    -u DELAY_BETWEEN_ORGS \
    -u PAGE_SIZE \
    -u EXTRA_PAGE_SIZE \
    -u RATE_LIMIT_CHECK_INTERVAL \
    -u RETRY_MAX_ATTEMPTS \
    -u RETRY_INITIAL_DELAY \
    -u RETRY_MAX_DELAY \
    -u RETRY_BACKOFF_FACTOR \
    -u RETRY_SUCCESS_THRESHOLD \
    -u SIZE_TOLERANCE_PCT \
    -u VERIFY_GIT \
    -u FAIL_ON_BLOCKING \
    -u PROXY_URL \
    -u CA_CERT_PATH \
    -u NODE_EXTRA_CA_CERTS \
    -u GITHUB_API_VERSION \
    -u VERBOSE \
    DOTENV_CONFIG_PATH=/dev/null \
    DOTENV_CONFIG_QUIET=true \
    "$@"
}

run_repo_stats() {
  local token="$1"
  local repo_list="$2"
  local output_dir="$3"
  local output_file="$4"
  local base_url="$5"

  clear_ambient_command_env \
    ACCESS_TOKEN="${token}" \
    gh repo-stats-plus repo-stats \
    --repo-list "${repo_list}" \
    --base-url "${base_url}" \
    --output-dir "${output_dir}" \
    --output-file-name "${output_file}" \
    --resume-from-last-save true \
    --auto-process-missing true
}

run_compare_stats() {
  local source_file="$1"
  local target_file="$2"
  local diff_file="$3"

  clear_ambient_command_env \
    SOURCE_TOKEN="${SOURCE_ACCESS_TOKEN}" \
    TARGET_TOKEN="${TARGET_ACCESS_TOKEN}" \
    gh repo-stats-plus compare-stats \
    --source-file "${source_file}" \
    --target-file "${target_file}" \
    --output-dir "$(dirname -- "${diff_file}")" \
    --output-file "${diff_file}" \
    --size-tolerance-pct "${SIZE_TOLERANCE_PCT}" \
    --verify-git \
    --source-org "${SOURCE_ORG}" \
    --target-org "${TARGET_ORG}" \
    --source-base-url "${SOURCE_API_URL}" \
    --target-base-url "${TARGET_API_URL}"
}

validate_resume_pair() {
  local output_dir="$1"
  local output_file="$2"
  local state_file="${output_dir}/last_known_state_repo-list.json"

  if [[ -f "${output_file}" && ! -f "${state_file}" ]]; then
    die "Stats CSV exists without resume state: ${output_file}. Use --force-fresh."
  fi
  if [[ -f "${state_file}" && ! -f "${output_file}" ]]; then
    die "Resume state exists without stats CSV: ${state_file}. Use --force-fresh."
  fi
}

write_status() {
  local chunk_dir="$1"
  local status="$2"
  printf '%s\n' "${status}" >"${chunk_dir}/operational-status.txt"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --force-fresh)
      FORCE_FRESH=true
      shift
      ;;
    --help | -h)
      usage
      exit 0
      ;;
    *)
      die "Unknown option: $1"
      ;;
  esac
done

preflight_local

mkdir -p -- "${OUTPUT_ROOT}"
OUTPUT_ROOT="$(cd -- "${OUTPUT_ROOT}" && pwd -P)"
RUN_DIR="${OUTPUT_ROOT}/run"
mkdir -p -- "${RUN_DIR}"
LOG_FILE="${RUN_DIR}/compare-repos.log"
prepare_output_root

log "Preparing ${MIGRATION_STATUS} repository chunks from ${AUDIT_FILE}"
PREPARE_ARGS=(
  prepare
  --audit "${AUDIT_FILE}"
  --run-dir "${RUN_DIR}"
  --status "${MIGRATION_STATUS}"
  --source-org "${SOURCE_ORG}"
  --source-host "${SOURCE_WEB_HOST}"
  --source-api-url "${SOURCE_API_URL}"
  --target-org "${TARGET_ORG}"
  --target-host "${TARGET_WEB_HOST}"
  --target-api-url "${TARGET_API_URL}"
  --size-tolerance-pct "${SIZE_TOLERANCE_PCT}"
  --chunk-size "${CHUNK_SIZE}"
)
if [[ "${FORCE_FRESH}" == true ]]; then
  PREPARE_ARGS+=(--force)
fi
run_helper "${PREPARE_ARGS[@]}" | tee -a "${LOG_FILE}"

CHUNK_COUNT="$(<"${RUN_DIR}/chunk-count.txt")"
if [[ "${DRY_RUN}" == true ]]; then
  log "Dry run: ${CHUNK_COUNT} chunk(s) prepared; no tokens were read and no API calls were made"
  for ((index = 0; index < CHUNK_COUNT; index++)); do
    chunk_name="$(printf 'chunk-%03d' "${index}")"
    chunk_dir="${RUN_DIR}/chunks/${chunk_name}"
    printf '%s\n' \
      "[dry-run] ACCESS_TOKEN=[REDACTED] gh repo-stats-plus repo-stats --repo-list ${chunk_dir}/source-repos.txt --base-url ${SOURCE_API_URL} --output-dir ${chunk_dir}/source" \
      "[dry-run] ACCESS_TOKEN=[REDACTED] gh repo-stats-plus repo-stats --repo-list ${chunk_dir}/target-repos.txt --base-url ${TARGET_API_URL} --output-dir ${chunk_dir}/target" \
      "[dry-run] SOURCE_TOKEN=[REDACTED] TARGET_TOKEN=[REDACTED] gh repo-stats-plus compare-stats --verify-git --source-file ${chunk_dir}/source/comparable-stats.csv --target-file ${chunk_dir}/target/comparable-stats.csv"
  done | tee -a "${LOG_FILE}"
  exit 0
fi

preflight_remote
HAD_OPERATIONAL_FAILURE=false

for ((index = 0; index < CHUNK_COUNT; index++)); do
  chunk_name="$(printf 'chunk-%03d' "${index}")"
  chunk_dir="${RUN_DIR}/chunks/${chunk_name}"
  source_dir="${chunk_dir}/source"
  target_dir="${chunk_dir}/target"
  source_list="${chunk_dir}/source-repos.txt"
  target_list="${chunk_dir}/target-repos.txt"
  source_stats="${source_dir}/source-stats.csv"
  target_stats="${target_dir}/target-stats.csv"
  comparable_source="${source_dir}/comparable-stats.csv"
  comparable_target="${target_dir}/comparable-stats.csv"
  diff_file="${chunk_dir}/diff.csv"
  completion_marker="${chunk_dir}/comparison.complete"

  mkdir -p -- "${source_dir}" "${target_dir}"

  if [[ -f "${completion_marker}" && -f "${diff_file}" ]] &&
    run_helper validate-diff --diff "${diff_file}" >/dev/null; then
    log "${chunk_name}: comparison already complete; skipping"
    continue
  fi

  rm -f -- "${completion_marker}" "${chunk_dir}/operational-status.txt"
  validate_resume_pair "${source_dir}" "${source_stats}"
  validate_resume_pair "${target_dir}" "${target_stats}"

  log "${chunk_name}: collecting source repository statistics"
  if run_repo_stats \
    "${SOURCE_ACCESS_TOKEN}" \
    "${source_list}" \
    "${source_dir}" \
    "${source_stats}" \
    "${SOURCE_API_URL}" | tee -a "${LOG_FILE}"; then
    date -u '+%Y-%m-%dT%H:%M:%SZ' >"${source_dir}/collected-at.txt"
  else
    log "${chunk_name}: source collection failed"
    write_status "${chunk_dir}" source_collection_failed
    HAD_OPERATIONAL_FAILURE=true
    continue
  fi

  log "${chunk_name}: collecting target repository statistics"
  if run_repo_stats \
    "${TARGET_ACCESS_TOKEN}" \
    "${target_list}" \
    "${target_dir}" \
    "${target_stats}" \
    "${TARGET_API_URL}" | tee -a "${LOG_FILE}"; then
    date -u '+%Y-%m-%dT%H:%M:%SZ' >"${target_dir}/collected-at.txt"
  else
    log "${chunk_name}: target collection failed"
    write_status "${chunk_dir}" target_collection_failed
    HAD_OPERATIONAL_FAILURE=true
    continue
  fi

  log "${chunk_name}: reconciling requested and collected repositories"
  rm -f -- \
    "${chunk_dir}/collection-failures.csv" \
    "${chunk_dir}/comparable-count.txt" \
    "${comparable_source}" \
    "${comparable_target}"
  if ! run_helper reconcile \
    --chunk-dir "${chunk_dir}" \
    --source-stats "${source_stats}" \
    --target-stats "${target_stats}" | tee -a "${LOG_FILE}"; then
    log "${chunk_name}: collection reconciliation failed"
    write_status "${chunk_dir}" reconciliation_failed
    HAD_OPERATIONAL_FAILURE=true
    continue
  fi

  comparable_count="$(<"${chunk_dir}/comparable-count.txt")"
  rm -f -- "${diff_file}"
  if [[ "${comparable_count}" == 0 ]]; then
    run_helper empty-diff --diff "${diff_file}"
    touch -- "${completion_marker}"
    log "${chunk_name}: no repositories were collected on both sides"
    continue
  fi

  log "${chunk_name}: comparing ${comparable_count} repositories with live Git verification"
  if run_compare_stats \
    "${comparable_source}" \
    "${comparable_target}" \
    "${diff_file}" | tee -a "${LOG_FILE}" &&
    run_helper validate-diff --diff "${diff_file}" >/dev/null; then
    touch -- "${completion_marker}"
    write_status "${chunk_dir}" complete
    log "${chunk_name}: comparison complete"
  else
    rm -f -- "${diff_file}" "${completion_marker}"
    log "${chunk_name}: comparison failed"
    write_status "${chunk_dir}" comparison_failed
    HAD_OPERATIONAL_FAILURE=true
  fi
done

log "Aggregating repository outcomes"
if ! run_helper aggregate --run-dir "${RUN_DIR}" | tee -a "${LOG_FILE}"; then
  die "Unable to aggregate comparison outcomes"
fi

log "Reports written to ${RUN_DIR}/reports"
if [[ "${HAD_OPERATIONAL_FAILURE}" == true ]]; then
  log "Completed with operational failures; rerun to resume incomplete chunks"
  exit 1
fi

log "Repository comparison completed"
