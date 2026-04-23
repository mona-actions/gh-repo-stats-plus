# GitHub Action

This project includes a GitHub Action that wraps the `gh-repo-stats-plus` CLI extension, allowing you to gather repository statistics directly from your GitHub workflows.

## Overview

The action is a **composite action** (defined in [`action.yml`](../action.yml)) that:

1. Sets up Node.js and installs the `gh-repo-stats-plus` CLI extension
2. Installs `gh-migration-audit` for optional migration auditing
3. Runs the appropriate stats command based on the `type` input
4. Uploads results as workflow artifacts
5. Generates markdown summaries for single-repository runs

## Quick Start

```yaml
- name: Gather Repository Stats
  uses: mona-actions/gh-repo-stats-plus@v1
  with:
    github-token: ${{ github.token }}
    access-token: ${{ secrets.ACCESS_TOKEN }}
    organization: my-org
    repository: my-repo
```

## Usage Reference

`uses: mona-actions/gh-repo-stats-plus@v1`

For the complete reference including all inputs, outputs, authentication options, and usage examples, see the [Action README](../action/README.md).

## Supported Types

| Type                | Description                                   |
| ------------------- | --------------------------------------------- |
| `repository`        | Stats for a single repository (default)       |
| `organization`      | Stats for all repos in an organization        |
| `project-stats`     | ProjectsV2 statistics                         |
| `app-install-stats` | GitHub App installation statistics (PAT only) |
| `package-stats`     | Package statistics (Maven, npm, Docker, etc.) |
| `codespace-stats`   | Codespace usage statistics                    |
| `migration-audit`   | Migration audit for an organization           |
| `combine`           | Merge CSV files from multiple batch runs      |

## Authentication

The action supports two authentication methods:

- **Personal Access Token (PAT)**: Pass via `access-token` input
- **GitHub App**: Pass `github-app-id` and `github-app-private-key` inputs

The `github-token` input (typically `${{ github.token }}`) is always required for runner-level operations.

## GitHub Enterprise Support

The action is compatible with GitHub Enterprise Server (GHES). Set the `base-url` input to your GHE API endpoint.

For GHES instances with internal or self-signed CA certificates, provide the certificate via:

- **`ca-cert`** — Pass the PEM content directly from a GitHub secret (recommended):
  ```yaml
  ca-cert: ${{ secrets.GHES_CA_CERT }}
  ```
- **`ca-cert-path`** — Point to a certificate file already on the runner:
  ```yaml
  ca-cert-path: /etc/ssl/certs/ghes-ca-bundle.pem
  ```

If your GHE instance cannot reach github.com to download CLI extensions, provide `ghec-token` as well.

## Key Features

- **Batch Processing**: Split large organizations into parallel matrix jobs using `batch-size`, `batch-index`, and `batch-delay`
- **Resume on Failure**: Automatically resumes from last saved state when re-running failed jobs
- **Post-Processing**: Transform CSV output using configurable rules
- **Rows-to-Columns**: Pivot migration audit data into stats CSV columns
- **Artifact Upload**: Results are automatically uploaded as workflow artifacts

## Example Workflows

Complete example workflows are available in the [`action/examples/`](../action/examples/) directory:

| Example                                                                         | Description                            |
| ------------------------------------------------------------------------------- | -------------------------------------- |
| [repository-stats.yml](../action/examples/repository-stats.yml)                 | Single repository on a weekly schedule |
| [organization-stats.yml](../action/examples/organization-stats.yml)             | All repos in an organization           |
| [batch-organization-stats.yml](../action/examples/batch-organization-stats.yml) | Batch processing with matrix strategy  |
| [project-stats.yml](../action/examples/project-stats.yml)                       | ProjectsV2 statistics                  |
| [app-install-stats.yml](../action/examples/app-install-stats.yml)               | GitHub App installation statistics     |
| [resume-stats.yml](../action/examples/resume-stats.yml)                         | Resume failed runs                     |
| [post-process-stats.yml](../action/examples/post-process-stats.yml)             | Post-process with rules file           |
| [rows-to-columns-stats.yml](../action/examples/rows-to-columns-stats.yml)       | Pivot audit rows into columns          |
| [issue-ops/](../action/examples/issue-ops/)                                     | IssueOps pattern via issue comments    |

## CI

The CI pipeline includes validation for the action's embedded bash scripts:

- **ShellCheck** — Lints bash scripts extracted from `action.yml`
- **yamllint** — Checks YAML syntax for `action.yml` and example workflows

## Related Documentation

- [Batch Processing Guide](batch-processing.md) — Detailed batch processing with GitHub Actions
- [Post-Process Command](commands/post-process.md) — Rules file format and examples
- [Rows-to-Columns Command](commands/rows-to-columns.md) — CSV pivoting details
