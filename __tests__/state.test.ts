import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProcessedPageState } from '../src/types.js';
import { StateManager } from '../src/state.js';
import { withMockedDate, createMockLogger } from './test-utils.js';

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

describe('StateManager', () => {
  const mockLogger = createMockLogger();
  const outputDir = '/test/output';
  const organizationName = 'test-org';

  // Clean up mocks before each test
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('should return default state when no previous state exists', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const stateManager = new StateManager(
        outputDir,
        organizationName,
        mockLogger,
      );
      const { processedState, resumeFromLastState } = stateManager.initialize();

      expect(resumeFromLastState).toBe(false);
      expect(processedState).toEqual({
        currentCursor: null,
        processedRepos: [],
        lastSuccessfulCursor: null,
        lastProcessedRepo: null,
        lastUpdated: null,
        completedSuccessfully: false,
        outputFileName: null,
      });
      expect(existsSync).toHaveBeenCalledWith(
        '/test/output/last_known_state_test-org.json',
      );
    });

    it('should not resume from last state if completedSuccessfully is true', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          completedSuccessfully: true,
          processedRepos: ['repo1', 'repo2'],
          currentCursor: 'cursor1',
          lastSuccessfulCursor: 'cursor1',
          lastProcessedRepo: 'repo2',
          lastSuccessTimestamp: '2025-03-19T12:00:00Z',
        }),
      );

      const stateManager = new StateManager(
        outputDir,
        organizationName,
        mockLogger,
      );
      const { processedState, resumeFromLastState } =
        stateManager.initialize(true);

      expect(resumeFromLastState).toBe(false);
      expect(processedState.processedRepos).toEqual([]);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Previous run completed successfully. Starting fresh run.',
      );
    });

    it('should resume from last state when resumeFromLastSave is true', () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const mockLastState = {
        completedSuccessfully: false,
        processedRepos: ['repo1', 'repo2'],
        currentCursor: 'cursor1',
        lastSuccessfulCursor: 'cursor1',
        lastProcessedRepo: 'repo2',
        lastSuccessTimestamp: '2025-03-19T12:00:00Z',
        outputFileName: null,
      };

      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockLastState));

      const stateManager = new StateManager(
        outputDir,
        organizationName,
        mockLogger,
      );
      const { processedState, resumeFromLastState } =
        stateManager.initialize(true);

      expect(resumeFromLastState).toBe(true);
      expect(processedState.currentCursor).toBe('cursor1');
      expect(processedState.processedRepos).toEqual(['repo1', 'repo2']);
      expect(processedState.lastSuccessfulCursor).toBe('cursor1');
      expect(processedState.lastProcessedRepo).toBe('repo2');
      expect(processedState.lastUpdated).toBe('2025-03-19T12:00:00Z');
      expect(processedState.completedSuccessfully).toBe(false);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Resuming from last state (last updated: 2025-03-19T12:00:00Z)',
      );
    });

    it('should NOT resume when resumeFromLastSave is false even if state exists', () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const mockLastState = {
        completedSuccessfully: false,
        processedRepos: ['repo1', 'repo2'],
        currentCursor: 'cursor1',
        lastSuccessfulCursor: 'cursor1',
        lastProcessedRepo: 'repo2',
        lastUpdated: '2025-03-19T12:00:00Z',
        outputFileName: null,
      };

      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockLastState));

      const stateManager = new StateManager(
        outputDir,
        organizationName,
        mockLogger,
      );
      const { processedState, resumeFromLastState } =
        stateManager.initialize(false); // resumeFromLastSave=false

      expect(resumeFromLastState).toBe(false);
      expect(processedState.processedRepos).toEqual([]); // Should be fresh state
      expect(mockLogger.info).toHaveBeenCalledWith(
        'State file exists but resume-from-last-save is not enabled. Starting fresh.',
      );
    });

    it('should handle invalid state file gracefully', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('invalid json');

      const stateManager = new StateManager(
        outputDir,
        organizationName,
        mockLogger,
      );
      const { processedState, resumeFromLastState } =
        stateManager.initialize(true);

      expect(resumeFromLastState).toBe(false);
      expect(processedState.processedRepos).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle missing processedRepos in state file', () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const mockLastState = {
        completedSuccessfully: false,
        currentCursor: 'cursor1',
        lastSuccessfulCursor: 'cursor1',
        lastProcessedRepo: 'repo2',
        lastSuccessTimestamp: '2025-03-19T12:00:00Z',
      };

      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockLastState));

      const stateManager = new StateManager(
        outputDir,
        organizationName,
        mockLogger,
      );
      const { processedState, resumeFromLastState } =
        stateManager.initialize(true);

      expect(resumeFromLastState).toBe(true);
      expect(processedState.processedRepos).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid state file: processedRepos is missing or not an array',
      );
    });

    it('should warn about legacy state file when detected', () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr === 'last_known_state.json') return true;
        if (pathStr === '/test/output/last_known_state_test-org.json')
          return false;
        return false;
      });

      const stateManager = new StateManager(
        outputDir,
        organizationName,
        mockLogger,
      );
      stateManager.initialize();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Found legacy state file'),
      );
    });

    it('should isolate state between different organizations', () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const org1State = {
        completedSuccessfully: false,
        processedRepos: ['org1-repo1', 'org1-repo2'],
        currentCursor: 'org1-cursor',
        lastSuccessfulCursor: 'org1-cursor',
        lastProcessedRepo: 'org1-repo2',
        lastSuccessTimestamp: '2025-03-19T12:00:00Z',
        outputFileName: null,
      };

      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(org1State));

      const stateManager1 = new StateManager(outputDir, 'org1', mockLogger);
      const { processedState: state1 } = stateManager1.initialize(true);

      expect(state1.processedRepos).toEqual(['org1-repo1', 'org1-repo2']);
      expect(existsSync).toHaveBeenCalledWith(
        '/test/output/last_known_state_org1.json',
      );

      vi.clearAllMocks();
      vi.mocked(existsSync).mockReturnValue(false);

      const stateManager2 = new StateManager(outputDir, 'org2', mockLogger);
      const { processedState: state2 } = stateManager2.initialize(true);

      expect(state2.processedRepos).toEqual([]);
      expect(existsSync).toHaveBeenCalledWith(
        '/test/output/last_known_state_org2.json',
      );
    });

    it('should use output directory for state files', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const stateManager = new StateManager(
        '/custom/output',
        organizationName,
        mockLogger,
      );
      stateManager.initialize();

      expect(existsSync).toHaveBeenCalledWith(
        '/custom/output/last_known_state_test-org.json',
      );
    });

    it('should sanitize organization names with invalid filesystem characters', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      // Test various invalid characters
      const invalidOrgNames = [
        { input: 'org/with/slashes', expected: 'org_with_slashes' },
        { input: 'org\\with\\backslashes', expected: 'org_with_backslashes' },
        { input: 'org:with:colons', expected: 'org_with_colons' },
        { input: 'org*with*asterisks', expected: 'org_with_asterisks' },
        { input: 'org?with?questions', expected: 'org_with_questions' },
        { input: 'org"with"quotes', expected: 'org_with_quotes' },
        { input: 'org<with>brackets', expected: 'org_with_brackets' },
        { input: 'org|with|pipes', expected: 'org_with_pipes' },
        { input: 'My-Org.Name_123', expected: 'my-org.name_123' },
      ];

      invalidOrgNames.forEach(({ input, expected }) => {
        vi.clearAllMocks();
        const stateManager = new StateManager(outputDir, input, mockLogger);
        stateManager.initialize();

        expect(existsSync).toHaveBeenCalledWith(
          `/test/output/last_known_state_${expected}.json`,
        );
      });
    });
  });

  describe('update', () => {
    it('should update cursor when new cursor is provided', () => {
      const mockState: ProcessedPageState = {
        currentCursor: 'cursor1',
        processedRepos: [],
        lastSuccessfulCursor: null,
        lastProcessedRepo: null,
        lastUpdated: null,
        completedSuccessfully: false,
        outputFileName: null,
      };

      const stateManager = new StateManager(
        outputDir,
        organizationName,
        mockLogger,
      );

      withMockedDate(new Date('2025-03-20T15:00:00Z'), () => {
        stateManager.update(mockState, { newCursor: 'cursor2' });
      });

      expect(mockState.currentCursor).toBe('cursor2');
      expect(mockState.lastUpdated).toBe('2025-03-20T15:00:00.000Z');
      expect(writeFileSync).toHaveBeenCalledWith(
        '/test/output/last_known_state_test-org.json',
        expect.any(String),
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Updated cursor to: cursor2 for repo: undefined',
      );
    });

    it('should update lastSuccessfulCursor when provided', () => {
      const mockState: ProcessedPageState = {
        currentCursor: 'cursor1',
        processedRepos: [],
        lastSuccessfulCursor: null,
        lastProcessedRepo: null,
        lastUpdated: null,
        completedSuccessfully: false,
        outputFileName: null,
      };

      const stateManager = new StateManager(
        outputDir,
        organizationName,
        mockLogger,
      );

      withMockedDate(new Date('2025-03-20T15:00:00Z'), () => {
        stateManager.update(mockState, {
          lastSuccessfulCursor: 'success-cursor',
        });
      });

      expect(mockState.lastSuccessfulCursor).toBe('success-cursor');
    });

    it('should add repo to processedRepos when not already included', () => {
      const mockState: ProcessedPageState = {
        currentCursor: null,
        processedRepos: ['repo1'],
        lastSuccessfulCursor: null,
        lastProcessedRepo: null,
        lastUpdated: null,
        completedSuccessfully: false,
        outputFileName: null,
      };

      const stateManager = new StateManager(
        outputDir,
        organizationName,
        mockLogger,
      );

      withMockedDate(new Date('2025-03-20T15:00:00Z'), () => {
        stateManager.update(mockState, { repoName: 'repo2' });
      });

      expect(mockState.processedRepos).toContain('repo2');
      expect(mockState.lastProcessedRepo).toBe('repo2');
    });

    it('should not add duplicate repo to processedRepos', () => {
      const mockState: ProcessedPageState = {
        currentCursor: null,
        processedRepos: ['repo1', 'repo2'],
        lastSuccessfulCursor: null,
        lastProcessedRepo: null,
        lastUpdated: null,
        completedSuccessfully: false,
        outputFileName: null,
      };

      const stateManager = new StateManager(
        outputDir,
        organizationName,
        mockLogger,
      );

      withMockedDate(new Date('2025-03-20T15:00:00Z'), () => {
        stateManager.update(mockState, { repoName: 'repo2' });
      });

      expect(mockState.processedRepos).toEqual(['repo1', 'repo2']);
      expect(mockState.processedRepos.length).toBe(2);
    });

    it('should handle error during state save', () => {
      const mockState: ProcessedPageState = {
        currentCursor: null,
        processedRepos: [],
        lastSuccessfulCursor: null,
        lastProcessedRepo: null,
        lastUpdated: null,
        completedSuccessfully: false,
        outputFileName: null,
      };

      vi.mocked(writeFileSync).mockImplementation(() => {
        throw new Error('Write error');
      });

      const stateManager = new StateManager(
        outputDir,
        organizationName,
        mockLogger,
      );

      withMockedDate(new Date('2025-03-20T15:00:00Z'), () => {
        stateManager.update(mockState, { repoName: 'repo1' });
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to save last state'),
      );
    });

    it('should not update cursor if new cursor is the same as current', () => {
      const currentCursor = 'same-cursor';
      const mockState: ProcessedPageState = {
        currentCursor,
        processedRepos: [],
        lastSuccessfulCursor: null,
        lastProcessedRepo: null,
        lastUpdated: null,
        completedSuccessfully: false,
        outputFileName: null,
      };

      const stateManager = new StateManager(
        outputDir,
        organizationName,
        mockLogger,
      );

      withMockedDate(new Date('2025-03-20T15:00:00Z'), () => {
        stateManager.update(mockState, { newCursor: currentCursor });
      });

      expect(mockLogger.debug).not.toHaveBeenCalledWith(
        expect.stringContaining(`Updated cursor to: ${currentCursor}`),
      );
    });

    it('should auto-create output directory if it does not exist', () => {
      const mockState: ProcessedPageState = {
        currentCursor: null,
        processedRepos: [],
        lastSuccessfulCursor: null,
        lastProcessedRepo: null,
        lastUpdated: null,
        completedSuccessfully: false,
        outputFileName: null,
      };

      vi.mocked(existsSync).mockReturnValue(false);

      const stateManager = new StateManager(
        '/new/output/dir',
        organizationName,
        mockLogger,
      );

      withMockedDate(new Date('2025-03-20T15:00:00Z'), () => {
        stateManager.update(mockState, { repoName: 'repo1' });
      });

      expect(mkdirSync).toHaveBeenCalledWith('/new/output/dir', {
        recursive: true,
      });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Creating output directory: /new/output/dir',
      );
    });
  });

  describe('cleanup', () => {
    it('should remove state file when it exists', () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const stateManager = new StateManager(
        outputDir,
        organizationName,
        mockLogger,
      );
      stateManager.cleanup();

      expect(unlinkSync).toHaveBeenCalledWith(
        '/test/output/last_known_state_test-org.json',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Removed state file: /test/output/last_known_state_test-org.json',
      );
    });

    it('should handle missing state file gracefully', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const stateManager = new StateManager(
        outputDir,
        organizationName,
        mockLogger,
      );
      stateManager.cleanup();

      expect(unlinkSync).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'State file does not exist, nothing to clean up: /test/output/last_known_state_test-org.json',
      );
    });

    it('should handle cleanup errors', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(unlinkSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const stateManager = new StateManager(
        outputDir,
        organizationName,
        mockLogger,
      );
      stateManager.cleanup();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to cleanup state file: Permission denied',
      );
    });
  });
});
