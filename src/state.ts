import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
} from 'fs';
import { join } from 'path';
import { Logger, ProcessedPageState } from './types.js';

const LEGACY_STATE_FILE = 'last_known_state.json';

export class StateManager {
  private readonly outputDir: string;
  private readonly organizationName: string;
  private readonly logger: Logger;

  constructor(outputDir: string, organizationName: string, logger: Logger) {
    this.outputDir = outputDir;
    this.organizationName = organizationName;
    this.logger = logger;
  }

  private sanitizeFilename(name: string): string {
    // Replace characters that are invalid in filenames with underscores
    // Invalid characters: / \ : * ? " < > | and control characters
    // eslint-disable-next-line no-control-regex
    return name.replace(/[/\\:*?"<>|\x00-\x1f]/g, '_').toLowerCase();
  }

  private getStateFileName(): string {
    const sanitizedOrg = this.sanitizeFilename(this.organizationName);
    return `last_known_state_${sanitizedOrg}.json`;
  }

  private getStateFilePath(): string {
    return join(this.outputDir, this.getStateFileName());
  }

  private checkLegacyStateFile(): void {
    if (existsSync(LEGACY_STATE_FILE)) {
      this.logger.warn(
        `Found legacy state file '${LEGACY_STATE_FILE}' without organization suffix. ` +
          `This file will not be used. Organization-specific state files are now used (e.g., '${this.getStateFileName()}'). ` +
          `Please manually remove '${LEGACY_STATE_FILE}' to avoid confusion.`,
      );
    }
  }

  private save(state: ProcessedPageState): void {
    try {
      // Ensure output directory exists
      if (!existsSync(this.outputDir)) {
        this.logger.debug(`Creating output directory: ${this.outputDir}`);
        mkdirSync(this.outputDir, { recursive: true });
      }

      const stateFilePath = this.getStateFilePath();
      writeFileSync(stateFilePath, JSON.stringify(state, null, 2));
      this.logger.debug(`Saved last state to ${stateFilePath}`);
    } catch (error) {
      this.logger.error(`Failed to save last state: ${error}`);
    }
  }

  private load(): ProcessedPageState | null {
    try {
      const stateFilePath = this.getStateFilePath();
      if (existsSync(stateFilePath)) {
        const data = readFileSync(stateFilePath, 'utf-8');
        this.logger.info(`Loaded last state from ${stateFilePath}`);
        const parsedState = JSON.parse(data);

        // Validate processedRepos exists and is an array
        if (
          !parsedState.processedRepos ||
          !Array.isArray(parsedState.processedRepos)
        ) {
          this.logger.warn(
            'Invalid state file: processedRepos is missing or not an array',
          );
          parsedState.processedRepos = [];
        }

        // Ensure uniqueness while keeping as array
        parsedState.processedRepos = [...new Set(parsedState.processedRepos)];

        return {
          ...parsedState,
          currentCursor: parsedState.currentCursor || null,
          lastSuccessfulCursor: parsedState.lastSuccessfulCursor || null,
          lastProcessedRepo: parsedState.lastProcessedRepo || null,
          lastUpdated:
            parsedState.lastUpdated || parsedState.lastSuccessTimestamp || null,
          completedSuccessfully: parsedState.completedSuccessfully || false,
          outputFileName: parsedState.outputFileName || null,
        };
      }
    } catch (error) {
      this.logger.error(
        `Failed to load last state: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    return null;
  }

  public initialize(resumeFromLastSave?: boolean): {
    processedState: ProcessedPageState;
    resumeFromLastState: boolean;
  } {
    let processedState: ProcessedPageState = {
      currentCursor: null,
      processedRepos: [],
      lastSuccessfulCursor: null,
      lastProcessedRepo: null,
      lastUpdated: null,
      completedSuccessfully: false,
      outputFileName: null,
    };

    // Check for legacy state file and warn user
    this.checkLegacyStateFile();

    let resumeFromLastState = false;
    const stateFilePath = this.getStateFilePath();

    if (!existsSync(stateFilePath)) {
      this.logger.debug(
        `No state file found at ${stateFilePath}. Starting fresh.`,
      );
      return { processedState, resumeFromLastState };
    }

    const lastState = this.load();
    if (!lastState) {
      this.logger.warn(
        'State file exists but could not be loaded. Starting fresh.',
      );
      return { processedState, resumeFromLastState };
    }

    // Check if previous run completed successfully
    if (lastState.completedSuccessfully) {
      this.logger.info(
        'Previous run completed successfully. Starting fresh run.',
      );
      return { processedState, resumeFromLastState };
    }

    // Check if user wants to resume
    if (!resumeFromLastSave) {
      this.logger.info(
        'State file exists but resume-from-last-save is not enabled. Starting fresh.',
      );
      return { processedState, resumeFromLastState };
    }

    // Resume from last state
    processedState = lastState;
    resumeFromLastState = true;
    this.logger.info(
      `Resuming from last state (last updated: ${lastState.lastUpdated})`,
    );

    return { processedState, resumeFromLastState };
  }

  public update(
    state: ProcessedPageState,
    updates: {
      repoName?: string | null;
      newCursor?: string | null;
      lastSuccessfulCursor?: string | null;
    },
  ): void {
    const { repoName, newCursor, lastSuccessfulCursor } = updates;

    // Update cursor if provided and different from current
    if (newCursor && newCursor !== state.currentCursor) {
      state.currentCursor = newCursor;
      this.logger.debug(
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
    this.save(state);
  }

  public cleanup(): void {
    try {
      const stateFilePath = this.getStateFilePath();
      if (existsSync(stateFilePath)) {
        unlinkSync(stateFilePath);
        this.logger.info(`Removed state file: ${stateFilePath}`);
      } else {
        this.logger.debug(
          `State file does not exist, nothing to clean up: ${stateFilePath}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to cleanup state file: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
