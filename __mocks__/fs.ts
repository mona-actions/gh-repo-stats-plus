import { vi } from 'vitest';

export const appendFileSync = vi.fn();
export const existsSync = vi.fn();
export const mkdirSync = vi.fn();
export const readdirSync = vi.fn();
export const readFileSync = vi.fn();
export const realpathSync = vi.fn();
export const rmSync = vi.fn();
export const statSync = vi.fn();
export const writeFileSync = vi.fn();

const mockFs = {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
};

export default mockFs;
