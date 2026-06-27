# webhook-stats Command

Retrieves webhook configuration statistics for GitHub organizations and/or
repositories. Produces a CSV file describing each webhook including its scope
(organization or repository), events, target URL, content type, SSL setting,
secret presence, and last delivery response.

Supports four input modes — a single organization, a list of organizations, a
single repository, or an explicit list of repositories — and lets you control
whether organization-level webhooks, repository-level webhooks, or both are
collected.

## Basic Syntax

```bash
gh repo-stats-plus webhook-stats [options]
```

## Options

### Source Selection (exactly one required)

- `-o, --org-name <org>`: The name of the organization to process
- `--org-list <file>`: Path to file containing list of organizations to process (one org per line)
- `--repo-list <file>`: Path to file containing a list of repositories to process (format: `owner/repo_name`). Use a single entry to process one repository.

These three modes are mutually exclusive — specify exactly one.

### Webhook Scope

- `--webhook-scope <scope>`: Which webhooks to collect (Default: `repo`). Supported values:
  - `repo`: repository-level webhooks only
  - `org`: organization-level webhooks only
  - `both`: organization-level and repository-level webhooks

In `--repo-list` mode, `org`/`both` collects organization webhooks once per unique
owner found in the list.

### Filtering

- `--only-active-repos`: Skip archived repositories when collecting repository webhooks (org modes only; `--repo-list` entries are always processed as given)
- `--only-active-webhooks`: Only include webhooks whose last delivery response status is `active`. Organization webhooks (which have no last-response payload) fall back to the webhook's `active` flag.

### Authentication

- `-t, --access-token <token>`: GitHub access token
- `--app-id <id>`: GitHub App ID for authentication
- `--private-key <key>`: GitHub App private key content
- `--private-key-file <path>`: Path to GitHub App private key file
- `--app-installation-id <id>`: GitHub App installation ID (optional — automatically looked up if omitted)

### Configuration

- `-u, --base-url <url>`: GitHub API base URL (Default: `https://api.github.com`)
- `--proxy-url <url>`: Proxy URL if required
- `--ca-cert <path>`: Path to CA certificate bundle (PEM) for TLS verification (e.g. GHES with internal CA, Env: `NODE_EXTRA_CA_CERTS`)
- `--api-version <version>`: GitHub API version to use (`2022-11-28` or `2026-03-10`, Default: `2022-11-28`, Env: `GITHUB_API_VERSION`)
- `--output-dir <dir>`: Output directory for generated files (Default: output)
- `--output-file-name <name>`: Name for the primary output CSV file (default: auto-generated with timestamp)
- `-v, --verbose`: Enable verbose logging

### Performance

- `--page-size <size>`: Number of items per page (Default: 100)
- `--rate-limit-check-interval <seconds>`: Interval for rate limit checks (Default: 60)

### Retry Logic

- `--retry-max-attempts <attempts>`: Maximum number of retry attempts (Default: 3)
- `--retry-initial-delay <milliseconds>`: Initial delay for retry (Default: 1000)
- `--retry-max-delay <milliseconds>`: Maximum delay for retry (Default: 30000)
- `--retry-backoff-factor <factor>`: Backoff factor for retry delays (Default: 2)
- `--retry-success-threshold <count>`: Successful operations before resetting retry count (Default: 5)

### Processing Options

- `--resume-from-last-save`: Resume from the last saved state
- `--force-fresh-start`: Force a fresh start, ignoring any existing state
- `--clean-state`: Remove state file after successful completion

### Multi-Organization Options

- `--delay-between-orgs <seconds>`: Delay between processing organizations (Default: 5)
- `--continue-on-error`: Continue processing other organizations if one fails

## Examples

### Single Organization (repository webhooks)

```bash
gh repo-stats-plus webhook-stats --org-name my-org
```

### Organization and Repository Webhooks

```bash
gh repo-stats-plus webhook-stats --org-name my-org --webhook-scope both
```

### Organization Webhooks Only

```bash
gh repo-stats-plus webhook-stats --org-name my-org --webhook-scope org
```

### Single Repository

```bash
# repos.txt contains a single line: my-org/my-repo
gh repo-stats-plus webhook-stats --repo-list repos.txt
```

### Explicit Repository List

```bash
gh repo-stats-plus webhook-stats --repo-list repos.txt --webhook-scope both
```

### Multiple Organizations

```bash
gh repo-stats-plus webhook-stats \
  --org-list orgs.txt \
  --delay-between-orgs 10 \
  --continue-on-error
```

### Filter Out Archived Repos and Inactive Webhooks

```bash
gh repo-stats-plus webhook-stats \
  --org-name my-org \
  --only-active-repos \
  --only-active-webhooks
```

### With Access Token

```bash
gh repo-stats-plus webhook-stats \
  --org-name my-org \
  --access-token ghp_xxxxxxxxxxxx
```

### With GitHub App Authentication

```bash
# Installation ID is auto-looked up when omitted
gh repo-stats-plus webhook-stats \
  --org-name my-org \
  --app-id 12345 \
  --private-key-file ./key.pem
```

## Output

The command generates a CSV file in the output directory with the following columns:

| Column                  | Description                                                      |
| ----------------------- | ---------------------------------------------------------------- |
| `Org_Name`              | Organization (owner) name                                        |
| `Repo_Name`             | Repository name (empty for organization-level webhooks)          |
| `Webhook_Type`          | `Organization` or `Repository`                                   |
| `Webhook_Id`            | Numeric webhook ID                                               |
| `Name`                  | Webhook name (typically `web`)                                   |
| `Active`                | Whether the webhook is marked active                             |
| `Has_Secret`            | Whether a secret is configured                                   |
| `Events`                | Semicolon-separated list of subscribed events                    |
| `Url`                   | Webhook target URL                                               |
| `Content_Type`          | Configured content type (e.g., `json`, `form`)                   |
| `Insecure_SSL`          | Insecure SSL setting (`0` or `1`)                                |
| `Created_At`            | Webhook creation timestamp                                       |
| `Updated_At`            | Webhook last-updated timestamp                                   |
| `Last_Response_Code`    | HTTP status code of the last delivery (repository webhooks only) |
| `Last_Response_Status`  | Status of the last delivery (repository webhooks only)           |
| `Last_Response_Message` | Message of the last delivery (repository webhooks only)          |

### Secondary Outputs

Alongside the CSV, the command writes two text files (derived from the CSV file
name) containing the distinct webhook URLs discovered during the run:

- `<output>-unique-base-urls.txt`: unique `protocol://host` values
- `<output>-unique-urls-no-query.txt`: unique `protocol://host/path` values (query strings stripped)

These are useful for quickly auditing which external endpoints receive webhook
deliveries.

## Auth Requirements

This command uses the GitHub REST API to read webhook configuration. The
authenticated user or app must have:

- **Admin access** to each repository for repository webhooks (`admin:repo_hook` scope for a classic PAT, or equivalent fine-grained permissions)
- **Admin access** to the organization for organization webhooks (`admin:org_hook` scope for a classic PAT, or equivalent fine-grained permissions)

## Notes

- Processing is incremental: webhooks are written to the CSV as they are fetched, so partial results are available even if processing is interrupted
- `--repo-list` is mutually exclusive with `--org-name` and `--org-list`. Relative repo-list paths resolve from the directory where you invoked `gh repo-stats-plus`
- A single repository is processed by providing a `--repo-list` file with one `owner/repo` entry
- `--only-active-repos` only applies when listing an organization's repositories; explicit `--repo-list` entries are always processed
