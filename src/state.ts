import { readFileSync, writeFileSync, existsSync } from 'fs';
import { Logger, ProcessedPageState } from './types.js';

interface MultiOrgState {
  [orgName: string]: ProcessedPageState;
}

function getStateFileName(): string {
  return 'last_known_state.json';
}

function loadMultiOrgState(logger: Logger): MultiOrgState {
  const stateFile = getStateFileName();
  try {
    if (existsSync(stateFile)) {
      const content = readFileSync(stateFile, 'utf-8');
      const parsed = JSON.parse(content);
      return parsed;
    }
    return {};
  } catch (error) {
    logger.warn(`Failed to load state: ${error}`);
    return {};
  }
}

function saveMultiOrgState(state: MultiOrgState, logger: Logger): void {
  const stateFile = getStateFileName();
  try {
    writeFileSync(stateFile, JSON.stringify(state, null, 2));
    logger.debug(`Saved multi-org state to ${stateFile}`);
  } catch (error) {
    logger.error(`Failed to save state: ${error}`);
  }
}

function saveLastState(
  state: ProcessedPageState,
  logger: Logger,
  orgName?: string,
): void {
  if (!orgName) {
    // Single-org mode not supported in new multi-org structure
    logger.warn(
      'Single-org mode not supported with new multi-org state structure. Please provide orgName.',
    );
    return;
  }

  // Multi-org approach
  const multiOrgState = loadMultiOrgState(logger);
  multiOrgState[orgName.toLowerCase()] = state;
  saveMultiOrgState(multiOrgState, logger);
}

function loadLastState(
  logger: Logger,
  orgName?: string,
): ProcessedPageState | null {
  if (!orgName) {
    // Single-org mode - not supported in new multi-org structure
    logger.warn(
      'Single-org mode not supported with new multi-org state structure. Please provide orgName.',
    );
    return null;
  }

  // Multi-org mode - load specific org from multi-org structure
  const multiOrgState = loadMultiOrgState(logger);
  const orgState = multiOrgState[orgName.toLowerCase()];

  if (!orgState) {
    logger.debug(`No previous state found for organization: ${orgName}`);
    return null;
  }

  // Validate processedRepos exists and is an array
  if (!orgState.processedRepos || !Array.isArray(orgState.processedRepos)) {
    logger.warn(
      'Invalid state file: processedRepos is missing or not an array',
    );
    orgState.processedRepos = [];
  }

  // Ensure uniqueness while keeping as array
  orgState.processedRepos = [...new Set(orgState.processedRepos)];

  logger.debug(`Loaded state for organization: ${orgName}`);
  return {
    ...orgState,
    currentCursor: orgState.currentCursor || null,
    lastSuccessfulCursor: orgState.lastSuccessfulCursor || null,
    lastProcessedRepo: orgState.lastProcessedRepo || null,
    lastUpdated: orgState.lastUpdated || null,
    completedSuccessfully: orgState.completedSuccessfully || false,
  };
}

export function initializeState({
  resumeFromLastSave,
  logger,
  orgName,
}: {
  resumeFromLastSave?: boolean;
  logger: Logger;
  orgName?: string;
}): { processedState: ProcessedPageState; resumeFromLastState: boolean } {
  let processedState: ProcessedPageState = {
    currentCursor: null,
    processedRepos: [],
    lastSuccessfulCursor: null,
    lastProcessedRepo: null,
    lastUpdated: null,
    completedSuccessfully: false,
    outputFileName: null,
  };

  let resumeFromLastState = false;

  // Check if state exists for this organization
  const lastState = loadLastState(logger, orgName);
  if (lastState) {
    let isNewRun = false;
    if (lastState?.completedSuccessfully) {
      logger.info(
        'All repositories were previously processed successfully. Nothing to resume.',
      );
      isNewRun = true;
    }

    if (!isNewRun && resumeFromLastSave && lastState) {
      processedState = lastState;
      resumeFromLastState = true;
      logger.info(
        `Resuming from last state that was last updated: ${lastState.lastUpdated}`,
      );
    }
  }

  return { processedState, resumeFromLastState };
}

export function updateState({
  state,
  repoName,
  newCursor,
  lastSuccessfulCursor,
  logger,
  orgName,
}: {
  state: ProcessedPageState;
  repoName?: string | null;
  newCursor?: string | null;
  lastSuccessfulCursor?: string | null;
  logger: Logger;
  orgName?: string;
}): void {
  // Update cursor if provided and different from current
  if (newCursor && newCursor !== state.currentCursor) {
    state.currentCursor = newCursor;
    logger.debug(
      `Updated cursor to: ${state.currentCursor} for repo: ${repoName}`,
    );
  }

  // Update last successful cursor if provided
  if (lastSuccessfulCursor) {
    state.lastSuccessfulCursor = lastSuccessfulCursor;
  }

  // Add to processed repos if not already included
  if (repoName && !state.processedRepos.includes(repoName)) {
    state.processedRepos.push(repoName);
  }

  // Update last processed repo and timestamp
  if (repoName) {
    state.lastProcessedRepo = repoName;
  }
  state.lastUpdated = new Date().toISOString();

  // Save state after updates
  saveLastState(state, logger, orgName);
}

export function clearCompletedOrgState(orgName: string, logger: Logger): void {
  const multiOrgState = loadMultiOrgState(logger);
  const orgKey = orgName.toLowerCase();

  if (multiOrgState[orgKey]) {
    delete multiOrgState[orgKey];
    saveMultiOrgState(multiOrgState, logger);
    logger.info(`Cleared completed state for organization: ${orgName}`);
  } else {
    logger.debug(`No state found to clear for organization: ${orgName}`);
  }
}
