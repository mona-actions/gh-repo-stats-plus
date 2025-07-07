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
The debugger will automatically use environment variables from your `.env` file.

## Commands

### Repo Stats Command

Gathers repository statistics for a single organization or multiple organizations:

**Single Organization:**

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

The application will automatically detect any already processed repositories, resume from the last position in the API pagination, and continue adding results to the existing CSV file.

## Permissions

The permissions needed by repo-stats-ts depends on the authentication method:

### For Personal Access Token (PAT):

- `repo`: Full control of private repositories
- `read:org`: Read organization membership
- `read:user`: Read user information

### For GitHub App:

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

### Process Multiple Organizations

```bash
# Create a file with organizations to process
echo "microsoft
google
facebook
github
netflix" > my-orgs.txt

# Process all organizations
npm start repo-stats -- --org-list my-orgs.txt -t <github-token>

# Process with custom delays and error handling
npm start repo-stats -- --org-list my-orgs.txt -t <github-token> --delay-between-orgs 10 --continue-on-error
```

### Resume from a Previous Run

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
