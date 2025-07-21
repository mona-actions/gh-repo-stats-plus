# gh-repo-stats-plus

A TypeScript implementation for gathering GitHub repository statistics, including issues, pull requests, and more metrics to aid in repository analysis and migration planning. This project is a port of [mona-actions/gh-repo-stats](https://github.com/mona-actions/gh-repo-stats) from Bash to TypeScript, with significant enhancements and new features.

## Overview

gh-repo-stats-plus builds upon the solid foundation of the original gh-repo-stats project, reimplementing it in TypeScript to unlock additional capabilities and modern development patterns. While preserving the core functionality of collecting comprehensive statistics about repositories within a GitHub organization, this implementation introduces features like streaming processing, state persistence, and enhanced error handling to support larger organizations and more complex scenarios.

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

## Quickstart

1. Clone this repository

   ```bash
   git clone https://github.com/mona-actions/gh-repo-stats-plus.git
   cd gh-repo-stats-plus
   ```

2. Set up environment variables

   ```bash
   cp .env.example .env
   ```

   Edit the `.env` file and set at minimum:

   ```bash
   ORG_NAME=your_organization_name
   ACCESS_TOKEN=your_github_personal_access_token
   ```

3. Install dependencies and build the project

   ```bash
   npm install
   npm run bundle
   ```

4. Run the tool

   ```bash
   npm start repo-stats
   ```

5. Analyze the results in the generated CSV file

## Environment Variables Configuration

The following environment variables can be configured in your `.env` file:

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

## Debugging in VS Code

The project includes VS Code configurations for both running and debugging the application:

### Run Configurations

To debug the application in VS Code:

1. Open the project in VS Code
2. Make sure your `.env` file is set up with the necessary configuration noted in [environment variables](#environment-variables) above.
3. Open the Run and Debug sidebar (`Ctrl+Shift+D` or `Cmd+Shift+D` on macOS)
4. Select one of the following debug configurations:

   - **repo-stats Debug**: Run and debug the repo-stats command
   - **missing-repos Debug**: Run and debug the missing-repos command
   - **Jest Current File**: Debug tests for the currently open file
   - **Jest All Tests**: Debug all tests in the project

5. Press F5 or click the green play button to start debugging

### VS Code Tasks

The project includes several VS Code tasks for building and testing:

- **tsc: build**: Build the TypeScript project
- **jest: test current file**: Run tests for the current file
- **jest: test all**: Run all tests in the project

You can run these tasks via:

1. `View` → `Command Palette` (or `Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Type "Run Task" and select it
3. Choose the task you want to run

### Debug Commands

Using the Launch Configurations, you can debug the application with these entry points:

```bash
# Debug the repo-stats command
npm start repo-stats

# Debug the missing-repos command
npm start missing-repos -- -f your-repo-stats-file.csv
```

The debugger will automatically use environment variables from your `.env` file.

## Commands

### Repo Stats Command

Gathers repository statistics for all repositories in an organization:

```bash
npm start repo-stats -- -o <org-name> -t <github-token>
```

#### Options:

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

### Missing Repos Command

Identifies repositories that are part of an organization but not found in a specified file:

```bash
npm start missing-repos -- -o <org-name> -t <github-token> -f <output-file>
```

#### Options:

- `-f, --output-file-name <file>`: Repo Stats File to check repos against (Required)
- `-o, --org-name <org>`: The name of the organization to process
- `-t, --access-token <token>`: GitHub access token
- `-u, --base-url <url>`: GitHub API base URL (Default: https://api.github.com)
- `--proxy-url <url>`: Proxy URL if required
- `-v, --verbose`: Enable verbose logging
- `--app-id <id>`: GitHub App ID
- `--private-key <key>`: GitHub App private key
- `--private-key-file <file>`: Path to GitHub App private key file
- `--app-installation-id <id>`: GitHub App installation ID
- `--page-size <size>`: Number of items per page (Default: 10)

## Authentication

The tool supports multiple authentication methods:

1. **Personal Access Token**:

   ```bash
   npm start repo-stats -- -o <org-name> -t <github-token>
   ```

2. **GitHub App**:
   ```bash
   npm start repo-stats -- -o <org-name> --app-id <app-id> --private-key-file <key-file> --app-installation-id <installation-id>
   ```

## State Management

The gh-repo-stats-plus application implements a state management system that tries to help ensure data accuracy when handling large GitHub organizations:

### Last Known State

All processing state is persisted in a `last_known_state.json` file after each successful repository is processed. This state file contains:

- **currentCursor**: Current pagination cursor being processed in GitHub's GraphQL API
- **lastSuccessfulCursor**: Last known successful pagination cursor (used for resuming)
- **processedRepos**: Array of repository names that have been successfully processed
- **lastProcessedRepo**: The most recently processed repository
- **lastUpdated**: Timestamp of the last state update
- **completedSuccessfully**: Flag indicating if the entire process completed without errors
- **outputFileName**: Path to the CSV output file being generated

### Resume Capability

When running with the `--resume-from-last-save` flag, the application:

1. Loads the existing state from `last_known_state.json`
2. Skips already processed repositories to avoid duplicates
3. Continues from the last successful cursor position
4. Uses the same output file to append new results

This feature is particularly valuable when:

- Processing large organizations with thousands of repositories
- Recovering from network interruptions or API rate limits
- Continuing work after system maintenance or restarts

### Example Workflow

```bash
# Initial run
npm start repo-stats -- -o your-org

# If interrupted, resume where you left off
npm start repo-stats -- -o your-org --resume-from-last-save
```

The application will automatically detect any already processed repositories, resume from the last position in the API pagination, and continue adding results to the existing CSV file.

## Permissions

The permissions needed by gh-repo-stats-plus depends on the authentication method:

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

### Resume from a Previous Run

```bash
npm start repo-stats -- -o <org-name> -t <github-token> --resume-from-last-save
```

### Process Specific Repositories

```bash
# Create a file with repositories to process
echo "owner/repo1
owner/repo2
owner/repo3" > repos-to-process.txt

# Run the command
npm start repo-stats -- -o <org-name> -t <github-token> --repo-list repos-to-process.txt
```

### Auto-Process Missing Repositories

```bash
npm start repo-stats -- -o <org-name> -t <github-token> --auto-process-missing
```
