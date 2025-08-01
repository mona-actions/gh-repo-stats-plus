# gh-repo-stats-plus

A GitHub CLI extension for gathering comprehensive repository statistics from GitHub organizations. This TypeScript implementation builds upon the solid foundation of [mona-actions/gh-repo-stats](https://github.com/mona-actions/gh-repo-stats), adding modern features and performance improvements for enterprise-scale repository analysis.

## 🚀 Quick Start

1. **Install the extension**:

   ```bash
   gh extension install mona-actions/gh-repo-stats-plus
   ```

2. **Authenticate with GitHub**:

   ```bash
   gh auth login
   ```

3. **Collect repository statistics**:
   ```bash
   gh repo-stats-plus repo-stats --organization my-org
   ```

The tool will generate a CSV file with comprehensive repository statistics for analysis.

## Key Features

This TypeScript rewrite offers several advantages:

1. **Octokit SDK Integration**: Built on GitHub's official Octokit.js SDK, providing:
   - Token renewal
   - Built-in retries
   - Rate limit handling
   - Pagination
   - GraphQL and REST API support

2. **Streaming Processing with Async Generators**: Writes results incrementally as they're processed rather than collecting everything up front, resulting in better memory management and reliability.

3. **State Persistence**: Saves processing state to a `last_known_state.json` file after each successful repository, storing the current cursor position and processed repositories.

4. **Resume Capability**: Can resume operations from the last saved state in case of interruptions or failures.

5. **Smart Duplicate Avoidance**: Skips already processed repositories when resuming to prevent duplicates and save processing time.

6. **Advanced Retry Logic**: Implements exponential backoff strategy for retries to gracefully handle rate limits and transient errors.

7. **Enhanced Debugging**: Easier to debug and maintain with modern TypeScript development tools like VS Code.

8. **Comprehensive Logging**: Detailed logs stored in log files for later review and troubleshooting.

9. **Missing Repositories Detection**: Dedicated command to identify repositories that might have been missed during processing.

## Technical Implementation

The extension is built using modern TypeScript patterns with:

- **Async Generators** for streaming large datasets
- **Retry Logic** with exponential backoff
- **Rate Limit Handling** via GitHub Octokit SDK
- **State Persistence** for resumable operations
- **Comprehensive Logging** with Winston
- **Type Safety** throughout the codebase
- **On-demand Building** for clean installation without pre-built artifacts

## Documentation

| Guide                                | Description                            |
| ------------------------------------ | -------------------------------------- |
| [Installation](docs/installation.md) | Prerequisites and installation methods |
| [Usage Guide](docs/usage.md)         | Authentication and usage examples      |
| [Commands](docs/commands.md)         | Complete command reference             |
| [Development](docs/development.md)   | Setup and development workflow         |

## Common Usage Examples

### Basic Organization Analysis

```bash
gh repo-stats-plus repo-stats --organization my-org
```

### Resume Long-Running Collection

```bash
gh repo-stats-plus repo-stats --organization my-org --resume-from-last-save
```

### High-Volume Processing with GitHub App

```bash
gh repo-stats-plus repo-stats \
  --organization my-org \
  --app-id 12345 \
  --private-key-file app.pem \
  --app-installation-id 67890
```

### Find and Process Missing Data

```bash
gh repo-stats-plus missing-repos --organization my-org --file results.csv
gh repo-stats-plus repo-stats --organization my-org --auto-process-missing
```

## Development

```bash
git clone https://github.com/mona-actions/gh-repo-stats-plus.git
cd gh-repo-stats-plus
npm install
npm run build
npm test
```

See the [Development Guide](docs/development.md) for detailed setup instructions.

## Requirements

````

## 🛠️ Development Quick Start

```bash
git clone https://github.com/mona-actions/gh-repo-stats-plus.git
cd gh-repo-stats-plus
npm install
npm run build
npm test
````

See the [Development Guide](docs/development.md) for detailed setup instructions.

## Requirements

- **Node.js** 18 or later
- **GitHub CLI** (latest version recommended)
- **GitHub Authentication** (personal token, GitHub App, or GitHub CLI)

## Contributing

We welcome contributions! Please see our [Development Guide](docs/development.md) for setup instructions and guidelines.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
