import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionManager } from '../src/session.js';
import { SessionState, OrgStatus } from '../src/types.js';
import { createMockLogger } from './test-utils.js';

// Import fs functions individually
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
} from 'fs';

// Mock the fs module
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

// Mock path module
vi.mock('path', async () => {
  const actual = await vi.importActual<typeof import('path')>('path');
  return {
    ...actual,
    join: vi.fn((...args: string[]) => args.join('/')),
  };
});

describe('SessionManager', () => {
  const mockLogger = createMockLogger();
  const outputDir = '/test/output';
  const orgList = ['org1', 'org2', 'org3'];
  const settings = {
    delayBetweenOrgs: 5,
    continueOnError: true,
    outputDir: '/test/output',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('should create new session when no session file exists', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const manager = new SessionManager(outputDir, mockLogger);
      const result = manager.initialize(orgList, settings, false);

      expect(result.canResume).toBe(false);
      expect(result.currentOrgIndex).toBe(0);
      expect(writeFileSync).toHaveBeenCalled();
      const writtenData = vi.mocked(writeFileSync).mock.calls[0][1] as string;
      const session = JSON.parse(writtenData);
      expect(session.mode).toBe('multi-org');
      expect(session.orgList).toEqual(orgList);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Creating new session'),
      );
    });

    it('should create new session when resume not requested', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          version: '2.0.0',
          mode: 'multi-org',
          orgList: ['org1', 'org2', 'org3'],
          currentOrgIndex: 1,
          sessionStartTime: '2025-12-30T10:00:00Z',
          sessionId: 'old-session-id',
          settings,
          orgReferences: {
            org1: {
              stateFile: 'last_known_state_org1.json',
              status: 'completed' as OrgStatus,
              outputFile: null,
              startTime: null,
              endTime: null,
              reposProcessed: 0,
              error: null,
            },
            org2: {
              stateFile: 'last_known_state_org2.json',
              status: 'in-progress' as OrgStatus,
              outputFile: null,
              startTime: null,
              endTime: null,
              reposProcessed: 0,
              error: null,
            },
            org3: {
              stateFile: 'last_known_state_org3.json',
              status: 'pending' as OrgStatus,
              outputFile: null,
              startTime: null,
              endTime: null,
              reposProcessed: 0,
              error: null,
            },
          },
          lastUpdated: '2025-12-30T10:30:00Z',
        }),
      );

      const manager = new SessionManager(outputDir, mockLogger);
      const result = manager.initialize(orgList, settings, false);

      expect(result.canResume).toBe(false);
      expect(result.currentOrgIndex).toBe(0);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('resume-from-last-save is not enabled'),
      );
    });

    it('should resume from existing session when requested', () => {
      const existingSession: SessionState = {
        version: '2.0.0',
        mode: 'multi-org',
        orgList: ['org1', 'org2', 'org3'],
        currentOrgIndex: 1,
        sessionStartTime: '2025-12-30T10:00:00Z',
        sessionId: 'existing-session-id',
        settings,
        orgReferences: {
          org1: {
            stateFile: 'last_known_state_org1.json',
            status: 'completed',
            outputFile: 'org1-output.csv',
            startTime: '2025-12-30T10:00:00Z',
            endTime: '2025-12-30T10:15:00Z',
            reposProcessed: 100,
            error: null,
          },
          org2: {
            stateFile: 'last_known_state_org2.json',
            status: 'in-progress',
            outputFile: 'org2-output.csv',
            startTime: '2025-12-30T10:16:00Z',
            endTime: null,
            reposProcessed: 50,
            error: null,
          },
          org3: {
            stateFile: 'last_known_state_org3.json',
            status: 'pending',
            outputFile: null,
            startTime: null,
            endTime: null,
            reposProcessed: 0,
            error: null,
          },
        },
        lastUpdated: '2025-12-30T10:30:00Z',
      };

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(existingSession));

      const manager = new SessionManager(outputDir, mockLogger);
      const result = manager.initialize(orgList, settings, true);

      expect(result.canResume).toBe(true);
      expect(result.currentOrgIndex).toBe(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Resuming from session'),
      );
    });

    it('should create new session if previous session completed', () => {
      const completedSession: SessionState = {
        version: '2.0.0',
        mode: 'multi-org',
        orgList: ['org1', 'org2', 'org3'],
        currentOrgIndex: 3,
        sessionStartTime: '2025-12-30T10:00:00Z',
        sessionId: 'completed-session-id',
        settings,
        orgReferences: {
          org1: {
            stateFile: 'last_known_state_org1.json',
            status: 'completed',
            outputFile: 'org1-output.csv',
            startTime: '2025-12-30T10:00:00Z',
            endTime: '2025-12-30T10:15:00Z',
            reposProcessed: 100,
            error: null,
          },
          org2: {
            stateFile: 'last_known_state_org2.json',
            status: 'completed',
            outputFile: 'org2-output.csv',
            startTime: '2025-12-30T10:16:00Z',
            endTime: '2025-12-30T10:30:00Z',
            reposProcessed: 150,
            error: null,
          },
          org3: {
            stateFile: 'last_known_state_org3.json',
            status: 'completed',
            outputFile: 'org3-output.csv',
            startTime: '2025-12-30T10:31:00Z',
            endTime: '2025-12-30T10:45:00Z',
            reposProcessed: 200,
            error: null,
          },
        },
        lastUpdated: '2025-12-30T10:45:00Z',
      };

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(completedSession));

      const manager = new SessionManager(outputDir, mockLogger);
      const result = manager.initialize(orgList, settings, true);

      expect(result.canResume).toBe(false);
      expect(result.currentOrgIndex).toBe(0);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('completed successfully'),
      );
    });

    it('should throw error if org list does not match existing session', () => {
      const existingSession: SessionState = {
        version: '2.0.0',
        mode: 'multi-org',
        orgList: ['org1', 'org2', 'org3'],
        currentOrgIndex: 1,
        sessionStartTime: '2025-12-30T10:00:00Z',
        sessionId: 'existing-session-id',
        settings,
        orgReferences: {
          org1: {
            stateFile: 'last_known_state_org1.json',
            status: 'completed',
            outputFile: null,
            startTime: null,
            endTime: null,
            reposProcessed: 0,
            error: null,
          },
          org2: {
            stateFile: 'last_known_state_org2.json',
            status: 'in-progress',
            outputFile: null,
            startTime: null,
            endTime: null,
            reposProcessed: 0,
            error: null,
          },
          org3: {
            stateFile: 'last_known_state_org3.json',
            status: 'pending',
            outputFile: null,
            startTime: null,
            endTime: null,
            reposProcessed: 0,
            error: null,
          },
        },
        lastUpdated: '2025-12-30T10:30:00Z',
      };

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(existingSession));

      const manager = new SessionManager(outputDir, mockLogger);
      const differentOrgList = ['org1', 'org2', 'org4']; // Different org

      expect(() => {
        manager.initialize(differentOrgList, settings, true);
      }).toThrow(/Org list mismatch/);
    });

    it('should handle invalid session file gracefully', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('invalid json');

      const manager = new SessionManager(outputDir, mockLogger);
      const result = manager.initialize(orgList, settings, true);

      expect(result.canResume).toBe(false);
      expect(result.currentOrgIndex).toBe(0);
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('could not be loaded'),
      );
    });
  });

  describe('org reference management', () => {
    it('should create and retrieve org references', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const manager = new SessionManager(outputDir, mockLogger);
      manager.initialize(orgList, settings, false);

      const orgRef = manager.getOrCreateOrgReference('org1');

      expect(orgRef).toBeDefined();
      expect(orgRef.status).toBe('pending');
      expect(orgRef.stateFile).toBe('last_known_state_org1.json');
    });

    it('should update org reference', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const manager = new SessionManager(outputDir, mockLogger);
      manager.initialize(orgList, settings, false);

      manager.updateOrgReference('org1', {
        status: 'in-progress',
        startTime: '2025-12-30T10:00:00Z',
        reposProcessed: 50,
      });

      const orgRef = manager.getOrgReference('org1');
      expect(orgRef?.status).toBe('in-progress');
      expect(orgRef?.startTime).toBe('2025-12-30T10:00:00Z');
      expect(orgRef?.reposProcessed).toBe(50);
    });

    it('should sanitize org names for filenames', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const manager = new SessionManager(outputDir, mockLogger);
      manager.initialize(['Org/With:Invalid*Chars'], settings, false);

      const orgRef = manager.getOrCreateOrgReference('Org/With:Invalid*Chars');
      expect(orgRef.stateFile).toBe(
        'last_known_state_org_with_invalid_chars.json',
      );
    });
  });

  describe('state management', () => {
    it('should provide access to session state', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const manager = new SessionManager(outputDir, mockLogger);
      manager.initialize(orgList, settings, false);

      const state = manager.getState();
      expect(state).not.toBeNull();
      expect(state?.orgList).toEqual(['org1', 'org2', 'org3']);
      expect(state?.currentOrgIndex).toBe(0);
    });

    it('should update current org index', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const manager = new SessionManager(outputDir, mockLogger);
      manager.initialize(orgList, settings, false);

      manager.updateCurrentOrgIndex(2);

      const state = manager.getState();
      expect(state?.currentOrgIndex).toBe(2);
    });
  });

  describe('validation', () => {
    it('should warn when session and org file status differ', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const manager = new SessionManager(outputDir, mockLogger);
      manager.initialize(orgList, settings, false);

      manager.updateOrgReference('org1', { status: 'completed' });

      // Org file says incomplete but session says complete
      manager.validateOrgFileStatus('org1', {
        completedSuccessfully: false,
        processedReposCount: 50,
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Trusting org file'),
      );
    });
  });

  describe('cleanup', () => {
    it('should delete session and all org state files', () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const manager = new SessionManager(outputDir, mockLogger);
      manager.initialize(orgList, settings, false);

      manager.cleanup();

      // Should delete session file
      expect(unlinkSync).toHaveBeenCalledWith(
        '/test/output/current_session.json',
      );

      // Should delete all org files
      expect(unlinkSync).toHaveBeenCalledWith(
        '/test/output/last_known_state_org1.json',
      );
      expect(unlinkSync).toHaveBeenCalledWith(
        '/test/output/last_known_state_org2.json',
      );
      expect(unlinkSync).toHaveBeenCalledWith(
        '/test/output/last_known_state_org3.json',
      );
    });
  });

  describe('summary', () => {
    it('should provide session summary', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const manager = new SessionManager(outputDir, mockLogger);
      manager.initialize(orgList, settings, false);

      manager.updateOrgReference('org1', { status: 'completed' });
      manager.updateOrgReference('org2', { status: 'in-progress' });
      // org3 remains pending

      const summary = manager.getSummary();

      expect(summary.totalOrgs).toBe(3);
      expect(summary.completed).toBe(1);
      expect(summary.inProgress).toBe(1);
      expect(summary.pending).toBe(1);
      expect(summary.failed).toBe(0);
    });
  });
});
