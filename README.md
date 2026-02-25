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
   gh repo-stats-plus repo-stats --org-name my-org
   ```

The tool will generate a CSV file with comprehensive repository statistics in the `./output/` directory (or a custom directory you specify).

## Key Features

This TypeScript rewrite offers several advantages:

1. **Octokit SDK Integration**: Built on GitHub's official Octokit.js SDK, providing:
   - Token renewal
   - Built-in retries
   - Rate limit handling
   - Pagination
   - GraphQL and REST API support

2. **Streaming Processing with Async Generators**: Writes results incrementally as they're processed rather than collecting everything up front, resulting in better memory management and reliability.

3. **State Persistence with Multi-Organization Support**: Saves processing state to organization-specific files (e.g., `last_known_state_<org>.json`) after each successful repository, storing the current cursor position and processed repositories. Each organization maintains its own isolated state, allowing sequential or parallel processing of multiple organizations without conflicts.

4. **Resume Capability**: Can resume operations from the last saved state in case of interruptions or failures.

5. **Smart Duplicate Avoidance**: Skips already processed repositories when resuming to prevent duplicates and save processing time.

6. **Advanced Retry Logic**: Implements exponential backoff strategy for retries to gracefully handle rate limits and transient errors.

7. **Enhanced Debugging**: Easier to debug and maintain with modern TypeScript development tools like VS Code.

8. **Comprehensive Logging**: Detailed logs stored in log files for later review and troubleshooting.

9. **Missing Repositories Detection**: Dedicated command to identify repositories that might have been missed during processing.

10. **Configurable Output Directory**: Control where output files and state files are saved with the `--output-dir` option (defaults to `./output/`) for organized file management.

11. **Project Stats Tracking**: Counts unique ProjectsV2 linked to repositories via issues and directly, based on [jcantosz/Count-repo-projects](https://github.com/jcantosz/Count-repo-projects).

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
| [LFS Sizing](docs/lfs-sizing.md)     | Git LFS storage analysis per repo      |
| [Development](docs/development.md)   | Setup and development workflow         |

## Common Usage Examples

### Basic Organization Analysis

```bash
# Generate repository statistics (output saved to ./output/ directory)
gh repo-stats-plus repo-stats --org-name my-org
```

### Multiple Organizations

Process multiple organizations from a single file:

```bash
# Create an org list file (one org per line)
cat > orgs.txt << EOF
Org1
Org2
Org3
EOF

# Process all organizations with a single command
gh repo-stats-plus repo-stats --org-list orgs.txt

# Add delays between organizations (default: 5 seconds)
gh repo-stats-plus repo-stats --org-list orgs.txt --delay-between-orgs 10

# Continue processing other orgs if one fails
gh repo-stats-plus repo-stats --org-list orgs.txt --continue-on-error

# Combine options
gh repo-stats-plus repo-stats \
  --org-list orgs.txt \
  --delay-between-orgs 10 \
  --continue-on-error \
  --output-dir ./reports
```

> [!NOTE]
> Organizations are processed strictly sequentially. This design choice is intentional to respect GitHub API rate limits and provide predictable resource usage. For large organization lists, consider the configurable delay between organizations and the estimated processing time logged at startup.

Or process organizations individually:

```bash
# Process multiple organizations sequentially (each maintains its own state)
gh repo-stats-plus repo-stats --org-name org1
gh repo-stats-plus repo-stats --org-name org2
gh repo-stats-plus repo-stats --org-name org3

# Use custom output directory (state files are stored here too)
gh repo-stats-plus repo-stats --org-name my-org --output-dir ./reports

# Clean up state file after successful completion
gh repo-stats-plus repo-stats --org-name my-org --clean-state
```

### Custom Output Directory

```bash
# Save output files to a custom directory
gh repo-stats-plus repo-stats --org-name my-org --output-dir /path/to/my/reports

# Use relative path from current directory
gh repo-stats-plus repo-stats --org-name my-org --output-dir reports
```

### Resume Long-Running Collection

```bash
gh repo-stats-plus repo-stats --org-name my-org --resume-from-last-save
```

### High-Volume Processing with GitHub App

```bash
gh repo-stats-plus repo-stats \
  --org-name my-org \
  --app-id 12345 \
  --private-key-file app.pem \
  --app-installation-id 67890 \
  --output-dir /path/to/reports
```

### Find and Process Missing Data

```bash
# Check for missing repositories (looks for CSV in ./output/ by default)
gh repo-stats-plus missing-repos --org-name my-org --file results.csv

# Use custom output directory for missing repos check
gh repo-stats-plus missing-repos \
  --org-name my-org \
  --file results.csv \
  --output-dir /path/to/reports

# Auto-process missing repositories
gh repo-stats-plus repo-stats --org-name my-org --auto-process-missing
```

### Project Statistics

```bash
# Count ProjectsV2 linked to repositories via issues
gh repo-stats-plus project-stats --org-name my-org

# Process specific repos from a file
gh repo-stats-plus project-stats --org-name my-org --repo-list repos.txt

# Multiple organizations
gh repo-stats-plus project-stats --org-list orgs.txt --continue-on-error

# Resume interrupted processing
gh repo-stats-plus project-stats --org-name my-org --resume-from-last-save
```

#### Repo Stats Options

**Organization Selection** (one required):

- `-o, --org-name <org>`: Process a single organization
- `--org-list <file>`: Process multiple organizations from a file (one org per line)

**Multi-Organization Options**:

- `--delay-between-orgs <seconds>`: Delay between processing organizations (Default: 5)
- `--continue-on-error`: Continue processing other organizations if one fails

**Authentication**:

- `-t, --access-token <token>`: GitHub access token
- `--app-id <id>`: GitHub App ID
- `--private-key <key>`: GitHub App private key
- `--private-key-file <file>`: Path to GitHub App private key file
- `--app-installation-id <id>`: GitHub App installation ID

**Processing Options**:

- `--resume-from-last-save`: Resume from the last saved state
- `--repo-list <file>`: Path to file containing list of repositories to process (format: owner/repo_name)
- `--auto-process-missing`: Automatically process any missing repositories when main processing is complete
- `--clean-state`: Remove state file after successful completion

**Configuration**:

- `-u, --base-url <url>`: GitHub API base URL (Default: <https://api.github.com>)
- `--proxy-url <url>`: Proxy URL if required
- `--output-dir <dir>`: Output directory for generated files (Default: ./output)
- `-v, --verbose`: Enable verbose logging

**Performance Tuning**:

- `--page-size <size>`: Number of items per page (Default: 10)
- `--extra-page-size <size>`: Extra page size (Default: 50)
- `--rate-limit-check-interval <seconds>`: Interval for rate limit checks (Default: 60)
- `--retry-max-attempts <attempts>`: Maximum number of retry attempts (Default: 3)
- `--retry-initial-delay <milliseconds>`: Initial delay for retry (Default: 1000)
- `--retry-max-delay <milliseconds>`: Maximum delay for retry (Default: 30000)
- `--retry-backoff-factor <factor>`: Backoff factor for retry delays (Default: 2)
- `--retry-success-threshold <count>`: Successful operations before resetting retry count (Default: 5)

#### Project Stats Options

The `project-stats` command supports the same authentication, retry, multi-org, and processing options as `repo-stats` above, with these differences:

- `--page-size <size>`: Number of issues per page (Default: 100)
- No `--extra-page-size` or `--auto-process-missing` options

See the [Commands Reference](docs/commands.md) for the complete list of project-stats options.

## Permissions

The permissions needed by repo-stats-ts depends on the authentication method:

### For Personal Access Token (PAT)

- `repo`: Full control of private repositories
- `read:org`: Read organization membership
- `read:project`: Read project information
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

1. A CSV file with repository statistics (or project statistics for the `project-stats` command)
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
- `isTemplate`: Whether the repository is a template repository
- `Visibility`: Repository visibility (e.g., PUBLIC, PRIVATE, INTERNAL)
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
- `Star_Count`: Number of stargazers
- `Fork_Count`: Number of forks
- `Watcher_Count`: Number of watchers
- `Has_Wiki`: Whether the repository has wiki feature enabled
- `Has_LFS`: Whether the repository has Git LFS tracking configured (see [LFS Detection Limitations](#lfs-detection-limitations))
- `Default_Branch`: Name of the default branch
- `Primary_Language`: Primary programming language of the repository
- `Languages`: Semicolon-separated list of languages with usage percentages (e.g., `TypeScript:85.2%;JavaScript:14.8%`)
- `License`: License identifier (SPDX ID or name)
- `Topics`: Semicolon-separated list of repository topics
- `Description`: Repository description
- `Homepage_URL`: Repository homepage URL
- `Auto_Merge_Allowed`: Whether auto-merge is enabled for pull requests
- `Delete_Branch_On_Merge`: Whether branches are automatically deleted after merging
- `Merge_Commit_Allowed`: Whether merge commits are allowed
- `Squash_Merge_Allowed`: Whether squash merging is allowed
- `Rebase_Merge_Allowed`: Whether rebase merging is allowed
- `Full_URL`: Repository URL
- `Migration_Issue`: Indicates whether the repository might have problems during migration due to:
  - 60,000 or more objects being imported
  - 1.5 GB or larger size on disk
- `Created`: Date/time when the repository was created

### LFS Detection Limitations

The `Has_LFS` column indicates whether the repository's `.gitattributes` file on the default branch contains `filter=lfs` entries. This is a lightweight check performed as part of the existing GraphQL query with no additional API calls.

### Project Stats CSV Output Columns

The `project-stats` command generates a separate CSV file with the following columns:

- `Org_Name`: Organization login
- `Repo_Name`: Repository name
- `Issues_Linked_To_Projects`: Number of issues that have at least one linked ProjectV2
- `Unique_Projects_Linked_By_Issues`: Count of distinct ProjectV2 items found across all issues
- `Projects_Linked_To_Repo`: Total count of projects directly associated with the repository

**Limitations to be aware of:**

- **Default branch only**: The check reads `.gitattributes` from `HEAD` (the default branch). LFS tracking configured only on other branches will not be detected.
- **Root `.gitattributes` only**: Nested `.gitattributes` files in subdirectories are not inspected.
- **Detection, not sizing**: This column only indicates whether LFS is configured — it does not report the number or size of LFS objects.
- **Empty repositories**: Empty repositories will always report `FALSE` since there is no `.gitattributes` file to read.

**For actual LFS sizing**, use the standalone `script/lfs-size.sh` script to inspect individual repositories where `Has_LFS` is `TRUE`. This performs a shallow bare clone and reports per-file LFS sizes and totals. See the [LFS Sizing Guide](docs/lfs-sizing.md) for prerequisites and usage.

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
