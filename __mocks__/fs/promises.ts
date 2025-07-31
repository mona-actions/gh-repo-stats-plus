import { vi } from 'vitest';

export const mkdir = vi.fn();
export const readFile = vi.fn();
export const writeFile = vi.fn();
export const access = vi.fn();
export const stat = vi.fn();
export const unlink = vi.fn();
export const rmdir = vi.fn();

export default {
  mkdir,
  readFile,
  writeFile,
  access,
  stat,
  unlink,
  rmdir,
};
