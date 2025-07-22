# Development Guide

## Quick Start

```bash
git clone https://github.com/mona-actions/gh-repo-stats-plus.git
cd gh-repo-stats-plus
npm install
npm run build
npm test
```

## Prerequisites

- Node.js 18 or later
- GitHub CLI
- VS Code (recommended)

## Development Workflow

### Available Scripts

```bash
npm run dev          # Run with tsx (development)
npm run build        # Build the project
npm test             # Run tests
npm run format:write # Format code with Prettier
npm run lint         # Run ESLint
```

### VS Code Configuration

The project includes VS Code configurations for debugging:

1. Open the project in VS Code
2. Set up your `.env` file with GitHub credentials
3. Use F5 to start debugging with the configured launch profiles

### Environment Variables

Create a `.env` file with:

```bash
ORG_NAME=my-org
ACCESS_TOKEN=your_github_token
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## Code Style

- We use TypeScript with strict type checking
- Code is formatted with Prettier
- ESLint is used for code quality
- Follow async/await patterns for better readability

5. Install locally for testing

   ```bash
   gh extension install .
   ```

## Environment Variables Configuration

Configure the following environment variables in your `.env` file:

### Core Settings

- `ORG_NAME`: Name of the GitHub organization to analyze
- `BASE_URL`: GitHub API URL (default: https://api.github.com)
- `PROXY_URL`: Optional proxy URL for API requests

### Authentication

- `ACCESS_TOKEN`: GitHub Personal Access Token
- `APP_ID`: GitHub App ID (alternative to PAT)
- `PRIVATE_KEY`: GitHub App private key
- `PRIVATE_KEY_FILE`: Path to GitHub App private key file
- `APP_INSTALLATION_ID`: GitHub App installation ID

### Performance and Pagination

- `PAGE_SIZE`: Number of repositories to fetch per page (default: 10)
- `EXTRA_PAGE_SIZE`: Number of items to fetch in secondary queries (default: 50)
- `RATE_LIMIT_CHECK_INTERVAL`: How often to check rate limits (default: 25)

### Error Handling and Retry Logic

- `RETRY_MAX_ATTEMPTS`: Maximum retry attempts on failure (default: 3)
- `RETRY_INITIAL_DELAY`: Initial delay in ms before retry (default: 1000)
- `RETRY_MAX_DELAY`: Maximum delay in ms between retries (default: 30000)
- `RETRY_BACKOFF_FACTOR`: Exponential backoff multiplier (default: 2)
- `RETRY_SUCCESS_THRESHOLD`: Success count to reset retry counter (default: 5)

### Processing Options

- `VERBOSE`: Enable detailed logging (default: false)
- `RESUME_FROM_LAST_SAVE`: Resume from last saved state (default: false)
- `REPO_LIST`: Path to file with specific repositories to process
- `AUTO_PROCESS_MISSING`: Process missing repos after main run (default: false)

## VS Code Development Setup

### Debug Configurations

The project includes VS Code configurations for debugging:

1. Open the project in VS Code
2. Ensure your `.env` file is properly configured
3. Open the Run and Debug sidebar (`Ctrl+Shift+D` or `Cmd+Shift+D`)
4. Select one of the debug configurations:

   - **repo-stats Debug**: Debug the repo-stats command
   - **missing-repos Debug**: Debug the missing-repos command
   - **Jest Current File**: Debug tests for the currently open file
   - **Jest All Tests**: Debug all tests in the project

5. Press F5 or click the green play button to start debugging

### VS Code Tasks

The project includes several VS Code tasks:

- **tsc: build**: Build the TypeScript project
- **jest: test current file**: Run tests for the current file
- **jest: test all**: Run all tests in the project

Access these tasks via:

1. `View` → `Command Palette` (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Type "Run Task" and select it
3. Choose the task you want to run

### Development Commands

```bash
# Debug the repo-stats command directly
npm start repo-stats

# Debug the missing-repos command
npm start missing-repos -- -f your-repo-stats-file.csv

# Run in development mode with hot reloading
npm run dev

# Watch mode for automatic rebuilding
npm run package:watch
```

## Building and Testing

### Build Commands

```bash
# Format code and build
npm run bundle

# Format code only
npm run format:write

# Check formatting
npm run format:check

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Build without formatting
npm run package

# Watch mode for development
npm run package:watch
```

### Testing

```bash
# Run all tests
npm test

# Run tests with verbose output
npm run test -- --verbose

# Run specific test file
npm test -- src/__tests__/service.spec.ts

# Run tests in watch mode
npm test -- --watch
```

### Development Workflow

1. **Make changes** to TypeScript source files in `src/`
2. **Build the project**: `npm run bundle`
3. **Test locally**: Use the VS Code debug configurations or run commands directly
4. **Run tests**: `npm test` to ensure everything works
5. **Check formatting**: `npm run format:check` and `npm run lint`
6. **Commit changes**: Follow conventional commit messages

## Project Structure

```
src/
├── __tests__/          # Test files
├── commands/           # CLI command implementations
│   ├── repo-stats-command.ts
│   └── missing-repos-command.ts
├── auth.ts            # Authentication handling
├── index.ts           # Main entry point
├── logger.ts          # Logging configuration
├── main.ts            # Application main logic
├── octokit.ts         # GitHub API client
├── retry.ts           # Retry logic
├── service.ts         # Core service logic
├── state.ts           # State management
├── types.ts           # TypeScript type definitions
├── utils.ts           # Utility functions
└── version.ts         # Version information
```

## Release Process

The GitHub CLI extension follows a pre-built distribution model where built artifacts are committed to the repository for easier installation.

### Preparing for Release

Use the automated release preparation script:

```bash
npm run prepare-release
```

This script will:

1. Install dependencies
2. Run tests
3. Run linter
4. Build the extension
5. Verify the build output
6. Make files executable

### Manual Release Steps

If you need to prepare a release manually:

```bash
# 1. Ensure code is ready
npm install
npm test
npm run lint

# 2. Test the build process
npm run build

# 3. Test the extension works
./gh-repo-stats-plus --help

# 4. Commit any source changes (built files are not committed)
git add .
git commit -m "Prepare release vX.X.X"

# 5. Create and push a release tag
git tag v1.x.x
git push origin v1.x.x

# 6. Create GitHub release
gh release create v1.x.x --generate-notes
```

### Important Notes

- **Built files are not committed**: The `dist/` folder is in `.gitignore` and built on-demand
- **Auto-build on first run**: Users installing via `gh extension install` get automatic building
- **Version management**: Update the version in `package.json` before release
- **Testing installations**: Test with `gh extension install owner/repo-name` before public release

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Run tests: `npm test`
5. Build and test: `npm run bundle`
6. Commit your changes: `git commit -am 'Add feature'`
7. Push to the branch: `git push origin feature-name`
8. Create a Pull Request

## Debugging Tips

- Use VS Code's integrated debugger for stepping through code
- Check log files in the `logs/` directory for runtime information
- Use `--verbose` flag for detailed output
- Monitor the `last_known_state.json` file for state persistence
- Use environment variables to avoid hardcoding test values
