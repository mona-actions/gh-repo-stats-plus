// See: https://rollupjs.org/introduction/

import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';

const config = {
  input: 'src/index.ts',
  output: {
    file: 'dist/index.js',
    format: 'es', // ES modules for Node.js
    sourcemap: true,
    banner: '#!/usr/bin/env node',
  },
  plugins: [
    json(),
    typescript(),
    nodeResolve({
      preferBuiltins: true,
      exportConditions: ['node'],
    }),
    commonjs(),
  ],
  // Only mark Node.js built-ins as external - all npm dependencies are bundled
  // into dist/index.js so the extension is self-contained and does not require
  // a node_modules directory at runtime.
  external: [
    // Node.js built-ins
    /^node:/,
    'fs',
    'path',
    'os',
    'crypto',
    'util',
    'events',
    'stream',
    'buffer',
    'url',
    'querystring',
    'http',
    'https',
    'net',
    'tls',
    'zlib',
    'readline',
    'child_process',
    'cluster',
    'worker_threads',
    'perf_hooks',
  ],
};

export default config;
