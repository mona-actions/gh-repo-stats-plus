import { vi } from 'vitest';

export const resolve = vi.fn().mockImplementation((...args) => args.join('/'));
export const join = vi.fn().mockImplementation((...args) => args.join('/'));
export const dirname = vi.fn();
export const basename = vi.fn();
export const extname = vi.fn();

export default {
  resolve,
  join,
  dirname,
  basename,
  extname,
};
