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

#### Repo Stats Options

- `-o, --org-name <org>`: The name of the organization to process (Required)
- `-t, --access-token <token>`: GitHub access token
- `-u, --base-url <url>`: GitHub API base URL (Default: https://api.github.com)
- `--proxy-url <url>`: Proxy URL if required
- `-v, --verbose`: Enable verbose logging
- `--app-id <id>`: GitHub App ID
- `--private-key <key>`: GitHub App private key
- `--private-key-file <file>`: Path to GitHub App private key file
- `--app-installation-id <id>`: GitHub App installation ID
- `--page-size <size>`: Number of items per page (Default: 10)
- `--extra-page-size <size>`: Extra page size (Default: 50)
- `--rate-limit-check-interval <seconds>`: Interval for rate limit checks (Default: 60)
- `--retry-max-attempts <attempts>`: Maximum number of retry attempts (Default: 3)
- `--retry-initial-delay <milliseconds>`: Initial delay for retry (Default: 1000)
- `--retry-max-delay <milliseconds>`: Maximum delay for retry (Default: 30000)
- `--retry-backoff-factor <factor>`: Backoff factor for retry delays (Default: 2)
- `--retry-success-threshold <count>`: Successful operations before resetting retry count (Default: 5)
- `--resume-from-last-save`: Resume from the last saved state
- `--repo-list <file>`: Path to file containing list of repositories to process (format: owner/repo_name)
- `--auto-process-missing`: Automatically process any missing repositories when main processing is complete

## Permissions

The permissions needed by repo-stats-ts depends on the authentication method:

### For Personal Access Token (PAT):

- `repo`: Full control of private repositories
- `read:org`: Read organization membership
- `read:user`: Read user information

### For GitHub App

The app requires `Read-only` permissions to the following:

- Repository Administration
- Repository Contents
- Repository Issues
- Repository Metadata
- Repository Projects
- Repository Pull requests
- Organization Members

## Output

The tool generates:

1. A CSV file with repository statistics
2. A `last_known_state.json` file with the current processing state
3. Log files in the `logs/` directory

### CSV Output Columns

The CSV output includes detailed information about each repository:

- `Org_Name`: Organization login
- `Repo_Name`: Repository name
- `Is_Empty`: Whether the repository is empty
- `Last_Push`: Date/time when a push was last made
- `Last_Update`: Date/time when an update was last made
- `isFork`: Whether the repository is a fork
- `isArchived`: Whether the repository is archived
- `Repo_Size_mb`: Size of the repository in megabytes
- `Record_Count`: Total number of database records this repository represents
- `Collaborator_Count`: Number of users who have contributed to this repository
- `Protected_Branch_Count`: Number of branch protection rules on this repository
- `PR_Review_Count`: Number of pull request reviews
- `Milestone_Count`: Number of issue milestones
- `Issue_Count`: Number of issues
- `PR_Count`: Number of pull requests
- `PR_Review_Comment_Count`: Number of pull request review comments
- `Commit_Comment_Count`: Number of commit comments
- `Issue_Comment_Count`: Number of issue comments
- `Issue_Event_Count`: Number of issue events
- `Release_Count`: Number of releases
- `Project_Count`: Number of projects
- `Branch_Count`: Number of branches
- `Tag_Count`: Number of tags
- `Discussion_Count`: Number of discussions
- `Has_Wiki`: Whether the repository has wiki feature enabled
- `Full_URL`: Repository URL
- `Migration_Issue`: Indicates whether the repository might have problems during migration due to:
  - 60,000 or more objects being imported
  - 1.5 GB or larger size on disk
- `Created`: Date/time when the repository was created

## Advanced Usage Examples

### Multiple Organizations

```bash
gh repo-stats-plus repo-stats --org-list <path/to/org-list-file> -t <github-token>
```

For multiple organizations, create a text file with one organization name per line:

```text
Org1
Org2
Org3
```

#### Multi-Organization Features

- **Sequential Processing**: Organizations are processed one at a time to respect GitHub's rate limits
- **Configurable Delays**: Add delays between organizations with `--delay-between-orgs`
- **Error Resilience**: Continue processing other orgs if one fails with `--continue-on-error`
- **Comprehensive Logging**: Generates a summary log with overall results plus individual org logs
- **Progress Tracking**: Shows current progress through the organization list

#### Additional Options for Multi-Org Mode

- `--delay-between-orgs <seconds>`: Delay between processing organizations in seconds (Default: 5)
- `--continue-on-error`: Continue processing other organizations if one fails
- All other single-org options are supported and apply to each organization

### Resume from a Previous Run

```bash
git clone https://github.com/mona-actions/gh-repo-stats-plus.git
cd gh-repo-stats-plus
npm install
npm run build
npm test
```

See the [Development Guide](docs/development.md) for detailed setup instructions.


## 🛠️ Development Quick Start

```bash
git clone https://github.com/mona-actions/gh-repo-stats-plus.git
cd gh-repo-stats-plus
npm install
npm run build
npm test
```

See the [Development Guide](docs/development.md) for detailed setup instructions.

## Requirements

- **Node.js** 18 or later
- **GitHub CLI** (latest version recommended)
- **GitHub Authentication** (personal token, GitHub App, or GitHub CLI)

## Contributing

We welcome contributions! Please see our [Development Guide](docs/development.md) for setup instructions and guidelines.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
