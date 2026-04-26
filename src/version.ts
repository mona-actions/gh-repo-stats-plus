import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json') as { version?: string };

export default (process.env.NPM_PACKAGE_VERSION ??
  process.env.npm_package_version ??
  packageJson.version ??
  '0.0.0') as string;
