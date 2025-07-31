import { vi } from 'vitest';

// Create mock functions for winston components
const format = {
  combine: vi.fn().mockReturnValue('combinedFormat'),
  timestamp: vi.fn().mockReturnValue('timestampFormat'),
  printf: vi.fn().mockImplementation((fn) => fn),
  colorize: vi.fn().mockReturnValue('colorizeFormat'),
};

const mockTransport = vi.fn();

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  on: vi.fn(),
};

export { format };
export const createLogger = vi.fn().mockReturnValue(mockLogger);
export const transports = {
  Console: mockTransport,
  File: mockTransport,
};

export default {
  format,
  createLogger,
  transports,
};
