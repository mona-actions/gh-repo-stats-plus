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
  // Mark node_modules as external to avoid bundling them
  external: [
    /node_modules/,
    'dotenv',
    'winston',
    'octokit',
    '@octokit/graphql',
    '@octokit/plugin-paginate-graphql',
    '@octokit/plugin-throttling',
    'commander',
    '@fast-csv/parse',
    'csv-parse',
    'undici',
  ],
};

export default config;
