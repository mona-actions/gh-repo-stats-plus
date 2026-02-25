import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
} from 'fs';
import { join } from 'path';
import { Logger, SessionState, OrgReference, OrgStatus } from './types.js';
import { randomBytes } from 'crypto';

const SESSION_FILE_NAME = 'current_session.json';

function generateSessionId(): string {
  // Timestamp-based ID with cryptographically secure random suffix
  const randomPart = randomBytes(16).toString('hex');
  return `session-${Date.now()}-${randomPart}`;
}

export class SessionManager {
  private readonly outputDir: string;
  private readonly logger: Logger;
  private sessionState: SessionState | null = null;

  constructor(outputDir: string, logger: Logger) {
    this.outputDir = outputDir;
    this.logger = logger;
  }

  private getSessionFilePath(): string {
    return join(this.outputDir, SESSION_FILE_NAME);
  }

  /**
   * Initialize a new session or load existing one
   */
  public initialize(
    orgList: string[],
    settings: {
      delayBetweenOrgs: number;
      continueOnError: boolean;
      outputDir: string;
    },
    resumeFromLastSave?: boolean,
  ): { canResume: boolean; currentOrgIndex: number } {
    const sessionFilePath = this.getSessionFilePath();

    // Check if session file exists
    if (!existsSync(sessionFilePath)) {
      this.logger.debug(
        `[session] No session file found at ${sessionFilePath}. Creating new session.`,
      );
      this.sessionState = this.createNewSession(orgList, settings);
      this.save();
      return { canResume: false, currentOrgIndex: 0 };
    }

    // Session file exists - try to load it
    const existingSession = this.load();
    if (!existingSession) {
      this.logger.warn(
        '[session] Session file exists but could not be loaded. Creating new session.',
      );
      this.sessionState = this.createNewSession(orgList, settings);
      this.save();
      return { canResume: false, currentOrgIndex: 0 };
    }

    // Check if session is already complete (all orgs processed)
    if (existingSession.currentOrgIndex >= existingSession.orgList.length) {
      this.logger.info(
        '[session] Previous session completed successfully. Starting new session.',
      );
      this.sessionState = this.createNewSession(orgList, settings);
      this.save();
      return { canResume: false, currentOrgIndex: 0 };
    }

    // Set state after validation
    this.sessionState = existingSession;

    // User wants to resume?
    if (!resumeFromLastSave) {
      this.logger.info(
        '[session] Session file exists but resume-from-last-save is not enabled. Starting new session.',
      );
      this.sessionState = this.createNewSession(orgList, settings);
      this.save();
      return { canResume: false, currentOrgIndex: 0 };
    }

    // Validate org list matches
    this.validateOrgList(existingSession, orgList);

    // Resume from existing session
    this.sessionState = existingSession;
    this.logger.info(
      `[session] Resuming from session (last updated: ${this.sessionState.lastUpdated})`,
    );
    this.logger.info(
      `[session] Session progress: org ${this.sessionState.currentOrgIndex + 1} of ${this.sessionState.orgList.length}`,
    );

    return {
      canResume: true,
      currentOrgIndex: this.sessionState.currentOrgIndex,
    };
  }

  private createNewSession(
    orgList: string[],
    settings: {
      delayBetweenOrgs: number;
      continueOnError: boolean;
      outputDir: string;
    },
  ): SessionState {
    const sessionId = generateSessionId();
    const sessionStartTime = new Date().toISOString();

    // Initialize org references with all orgs as pending
    const orgReferences: Record<string, OrgReference> = {};
    for (const org of orgList) {
      orgReferences[org.toLowerCase()] = {
        stateFile: `last_known_state_${this.sanitizeFilename(org)}.json`,
        status: 'pending',
        outputFile: null,
        startTime: null,
        endTime: null,
        reposProcessed: 0,
        error: null,
      };
    }

    return {
      version: '2.0.0',
      sessionId,
      mode: 'multi-org',
      sessionStartTime,
      orgList: orgList.map((org) => org.toLowerCase()),
      currentOrgIndex: 0,
      settings,
      orgReferences,
      lastUpdated: sessionStartTime,
    };
  }

  private sanitizeFilename(name: string): string {
    // Replace characters that are invalid in filenames with underscores
    // Invalid characters: / \ : * ? " < > | and control characters
    // eslint-disable-next-line no-control-regex
    return name.replace(/[/\\:*?"<>|\x00-\x1f]/g, '_').toLowerCase();
  }

  private validateOrgList(existingSession: SessionState, newOrgList: string[]) {
    const existingOrgList = existingSession.orgList;
    const newOrgListLower = newOrgList.map((org) => org.toLowerCase());

    // Check if lists match
    if (existingOrgList.length !== newOrgListLower.length) {
      throw new Error(
        `Org list mismatch: session has ${existingOrgList.length} orgs, but you provided ${newOrgListLower.length}. ` +
          `Delete ${this.getSessionFilePath()} to start fresh.`,
      );
    }

    for (let i = 0; i < existingOrgList.length; i++) {
      if (existingOrgList[i] !== newOrgListLower[i]) {
        throw new Error(
          `Org list mismatch at position ${i}: session has "${existingOrgList[i]}", but you provided "${newOrgListLower[i]}". ` +
            `Delete ${this.getSessionFilePath()} to start fresh.`,
        );
      }
    }
  }

  /**
   * Get or create org reference in session
   */
  public getOrCreateOrgReference(orgName: string): OrgReference {
    if (!this.sessionState) {
      throw new Error('Session not initialized');
    }

    const orgKey = orgName.toLowerCase();
    if (!this.sessionState.orgReferences[orgKey]) {
      // Create new reference
      this.sessionState.orgReferences[orgKey] = {
        stateFile: `last_known_state_${this.sanitizeFilename(orgName)}.json`,
        status: 'pending',
        outputFile: null,
        startTime: null,
        endTime: null,
        reposProcessed: 0,
        error: null,
      };
    }

    return this.sessionState.orgReferences[orgKey];
  }

  /**
   * Update org reference with new data
   * Automatically advances currentOrgIndex when status changes to 'completed' or 'failed'
   */
  public updateOrgReference(
    orgName: string,
    updates: Partial<Omit<OrgReference, 'stateFile'> & { status?: OrgStatus }>,
  ): void {
    if (!this.sessionState) {
      throw new Error('Session not initialized');
    }

    const orgRef = this.getOrCreateOrgReference(orgName);
    const previousStatus = orgRef.status;

    // Apply updates
    Object.assign(orgRef, updates);

    // Advance currentOrgIndex when transitioning to a terminal state (completed or failed)
    const isTerminalStatus =
      updates.status === 'completed' || updates.status === 'failed';
    const wasNotTerminal =
      previousStatus !== 'completed' && previousStatus !== 'failed';

    if (isTerminalStatus && wasNotTerminal) {
      this.advanceOrgIndex();
    }

    // Update lastUpdated
    this.sessionState.lastUpdated = new Date().toISOString();
    this.save();
  }

  /**
   * Advance the current org index to the next organization
   * This is called automatically by updateOrgReference when an org completes or fails
   */
  private advanceOrgIndex(): void {
    if (!this.sessionState) {
      throw new Error('Session not initialized');
    }

    if (this.sessionState.currentOrgIndex < this.sessionState.orgList.length) {
      this.sessionState.currentOrgIndex++;
      this.logger.debug(
        `[session] Advanced org index to ${this.sessionState.currentOrgIndex} of ${this.sessionState.orgList.length}`,
      );
    }
  }

  /**
   * Get org reference by name
   */
  public getOrgReference(orgName: string): OrgReference | null {
    if (!this.sessionState) {
      return null;
    }

    const orgKey = orgName.toLowerCase();
    return this.sessionState.orgReferences[orgKey] || null;
  }

  /**
   * Validate org file status against session status and warn if different
   */
  public validateOrgFileStatus(
    orgName: string,
    orgFileStatus: {
      completedSuccessfully: boolean;
      processedReposCount: number;
    },
  ): void {
    const orgRef = this.getOrgReference(orgName);
    if (!orgRef) {
      return;
    }

    // Check if statuses differ
    const sessionStatus = orgRef.status;
    const fileComplete = orgFileStatus.completedSuccessfully;

    if (sessionStatus === 'completed' && !fileComplete) {
      this.logger.warn(
        `[session] Session shows org "${orgName}" as completed, but org state file shows incomplete. Trusting org file.`,
      );
    } else if (sessionStatus !== 'completed' && fileComplete) {
      this.logger.warn(
        `[session] Session shows org "${orgName}" as ${sessionStatus}, but org state file shows completed. Trusting org file.`,
      );
    }
  }

  /**
   * Save session state to file
   */
  public save(): void {
    if (!this.sessionState) {
      this.logger.warn('[session] No session state to save');
      return;
    }

    try {
      // Ensure output directory exists
      if (!existsSync(this.outputDir)) {
        this.logger.debug(
          `[session] Creating output directory: ${this.outputDir}`,
        );
        mkdirSync(this.outputDir, { recursive: true });
      }

      const sessionFilePath = this.getSessionFilePath();
      writeFileSync(
        sessionFilePath,
        JSON.stringify(this.sessionState, null, 2),
      );
      this.logger.debug(`[session] Saved session state to ${sessionFilePath}`);
    } catch (error) {
      this.logger.error(
        `[session] Failed to save session state: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Load session state from file
   */
  private load(): SessionState | null {
    try {
      const sessionFilePath = this.getSessionFilePath();
      if (!existsSync(sessionFilePath)) {
        return null;
      }

      const data = readFileSync(sessionFilePath, 'utf-8');
      const parsed = JSON.parse(data);

      // Basic validation
      if (!parsed.version || !parsed.mode || !parsed.orgList) {
        this.logger.error('[session] Invalid session file format');
        return null;
      }

      if (parsed.mode !== 'multi-org') {
        this.logger.error(`[session] Unexpected session mode: ${parsed.mode}`);
        return null;
      }

      this.logger.info(`[session] Loaded session from ${sessionFilePath}`);
      return parsed;
    } catch (error) {
      this.logger.error(
        `[session] Failed to load session state: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  /**
   * Clean up session and all referenced org state files
   */
  public cleanup(): void {
    if (!this.sessionState) {
      this.logger.debug('[session] No session state to clean up');
      return;
    }

    try {
      // Delete all referenced org state files
      for (const org of this.sessionState.orgList) {
        const orgRef = this.sessionState.orgReferences[org];
        if (orgRef && orgRef.stateFile) {
          const orgStateFilePath = join(this.outputDir, orgRef.stateFile);
          if (existsSync(orgStateFilePath)) {
            unlinkSync(orgStateFilePath);
            this.logger.debug(
              `[session] Removed org state file: ${orgStateFilePath}`,
            );
          }
        }
      }

      // Delete session file
      const sessionFilePath = this.getSessionFilePath();
      if (existsSync(sessionFilePath)) {
        unlinkSync(sessionFilePath);
        this.logger.info(`[session] Removed session file: ${sessionFilePath}`);
      }

      this.sessionState = null;
    } catch (error) {
      this.logger.error(
        `[session] Failed to cleanup session: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Get session summary for logging
   */
  public getSummary(): {
    totalOrgs: number;
    completed: number;
    failed: number;
    pending: number;
    inProgress: number;
  } {
    if (!this.sessionState) {
      return {
        totalOrgs: 0,
        completed: 0,
        failed: 0,
        pending: 0,
        inProgress: 0,
      };
    }

    let completed = 0;
    let failed = 0;
    let pending = 0;
    let inProgress = 0;

    for (const org of this.sessionState.orgList) {
      const orgRef = this.sessionState.orgReferences[org];
      if (orgRef) {
        switch (orgRef.status) {
          case 'completed':
            completed++;
            break;
          case 'failed':
            failed++;
            break;
          case 'pending':
            pending++;
            break;
          case 'in-progress':
            inProgress++;
            break;
        }
      }
    }

    return {
      totalOrgs: this.sessionState.orgList.length,
      completed,
      failed,
      pending,
      inProgress,
    };
  }

  /**
   * Get session state (read-only)
   */
  public getState(): SessionState | null {
    return this.sessionState;
  }
}
