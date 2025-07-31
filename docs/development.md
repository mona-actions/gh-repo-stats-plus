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

## Code Style

- We use TypeScript with strict type checking
- Code is formatted with Prettier
- ESLint is used for code quality
- Follow async/await patterns for better readability
- Testing is implemented using Vitest for fast execution and excellent TypeScript support

- Install locally for testing

  ```bash
  gh extension install .
  ```

## Environment Variables Configuration

Configure the following environment variables in your `.env` file:

### Core Settings

- `ORG_NAME`: Name of the GitHub organization to analyze
- `BASE_URL`: GitHub API URL (default: `https://api.github.com`)
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
   - **Vitest Current File**: Debug tests for the currently open file
   - **Vitest All Tests**: Debug all tests in the project

5. Press F5 or click the green play button to start debugging

### VS Code Tasks

The project includes several VS Code tasks configured for Vitest:

- **tsc: build**: Build the TypeScript project
- **vitest: test current file**: Run tests for the current file
- **vitest: test all**: Run all tests in the project

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

The project uses **Vitest** as the testing framework, providing fast test execution and excellent TypeScript integration.

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in CI mode (no watch mode)
npm run test:ci

# Run specific test file
npx vitest run __tests__/utils.test.ts

# Run tests in watch mode (default behavior)
npx vitest

# Run tests with UI (if @vitest/ui is installed)
npx vitest --ui
```

#### Test Structure

- Tests are located in the `__tests__/` directory at the project root
- Test files use the `.test.ts` naming convention
- Mocks are located in the `__mocks__/` directory
- Test utilities are available in `__tests__/test-utils.ts`

#### Parameterized Testing

Use Vitest's `it.each` for testing multiple similar scenarios to reduce code duplication and improve test coverage:

```typescript
// Good: Parameterized test
it.each([
  { input: 1024, expected: 1, description: '1024 KB to 1 MB' },
  { input: 2048, expected: 2, description: '2048 KB to 2 MB' },
  { input: 512, expected: 0.5, description: '512 KB to 0.5 MB' },
])('should convert $description', ({ input, expected }) => {
  expect(convertKbToMb(input)).toBe(expected);
});

// Instead of: Multiple separate tests
it('should convert 1024 KB to 1 MB', () => {
  /* ... */
});
it('should convert 2048 KB to 2 MB', () => {
  /* ... */
});
it('should convert 512 KB to 0.5 MB', () => {
  /* ... */
});
```

Benefits of parameterized tests:

- Reduces code duplication
- Makes test cases more discoverable
- Easier to add new test scenarios
- Clearer test output with descriptive names

#### Mocking

The project includes comprehensive mocks for external dependencies:

- `fs` and `fs/promises` - File system operations
- `winston` - Logging functionality
- `octokit` - GitHub API client
- `path` - Path utilities

All mocks use Vitest's native APIs (`vi.fn()`, `vi.mock()`, etc.).

#### Testing Best Practices

- **Use parameterized tests**: Leverage `it.each` when testing multiple similar scenarios
- **Descriptive test names**: Use clear, descriptive test names that explain what is being tested
- **Arrange-Act-Assert**: Structure tests with clear sections for setup, execution, and verification
- **Mock external dependencies**: Use the provided mocks in `__mocks__/` for consistent testing
- **Test edge cases**: Include tests for null, undefined, empty values, and error conditions
- **One assertion per test**: Focus each test on a single behavior or outcome

### Development Process

1. **Make changes** to TypeScript source files in `src/`
2. **Build the project**: `npm run bundle`
3. **Test locally**: Use the VS Code debug configurations or run commands directly
4. **Run tests**: `npm test` to ensure everything works
5. **Check formatting**: `npm run format:check` and `npm run lint`
6. **Commit changes**: Follow conventional commit messages

## Project Structure

```bash
__tests__/              # Test files (Vitest)
├── logger.test.ts
├── service.test.ts
├── state.test.ts
├── test-utils.ts
└── utils.test.ts
__mocks__/              # Mock implementations
├── fs.ts
├── octokit.ts
├── path.ts
└── winston.ts
src/
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

This project uses **release-drafter** for automated release management. The process creates draft releases automatically based on pull request labels, which you can then review and publish.

### Automated Release Workflow

1. **Pull Request Labels**: When creating PRs, use appropriate labels:

   - `feature`, `enhancement` → Minor version bump
   - `bug`, `fix`, `bugfix` → Patch version bump
   - `major`, `breaking` → Major version bump
   - `chore`, `maintenance`, `dependencies` → Patch version bump

2. **Draft Release Creation**: When PRs are merged to `main`, release-drafter automatically:

   - Creates or updates a draft release
   - Generates release notes from PR titles and labels
   - Calculates the next version number based on labels

3. **Publishing**: Review the draft release and publish when ready

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
