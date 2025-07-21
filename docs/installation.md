# Installation Guide

## Prerequisites

- **GitHub CLI**: [Install the GitHub CLI](https://cli.github.com/) (version 2.0 or later)
- **Node.js**: Version 18 or later ([Download Node.js](https://nodejs.org/))

## Installation

Install this extension using the GitHub CLI:

```bash
gh extension install mona-actions/gh-repo-stats-plus
```

### Alternative Installation Methods

**Install from source (for development):**

```bash
git clone https://github.com/mona-actions/gh-repo-stats-plus.git
cd gh-repo-stats-plus
gh extension install .
```

## Verify Installation

```bash
gh repo-stats-plus --help
```

## Troubleshooting

### Extension not found

1. Verify the extension is installed: `gh extension list`
2. Reinstall if needed: `gh extension install mona-actions/gh-repo-stats-plus`

### Node.js not found

Install Node.js from [nodejs.org](https://nodejs.org/) and ensure it's in your PATH.

## Alternative Installation Methods

### Install from a Specific Release

To install a specific version of the extension:

```bash
gh extension install mona-actions/gh-repo-stats-plus --pin v1.0.0
```

This is useful when you want to use a specific version for consistency across your team or environment.

### Install for Development (From Source)

If you want to contribute to the project or test the latest changes:

```bash
git clone https://github.com/mona-actions/gh-repo-stats-plus.git
cd gh-repo-stats-plus
gh extension install .
```

## Upgrading

To upgrade to the latest version:

```bash
gh extension upgrade repo-stats-plus
```

To upgrade to a specific version:

```bash
gh extension upgrade repo-stats-plus --pin v2.0.0
```

## Uninstalling

To remove the extension:

```bash
gh extension remove repo-stats-plus
```

## Verification

After installation, verify the extension is working:

```bash
gh extension list
gh repo-stats-plus --help
```

## Troubleshooting Installation

### Extension not found

If you get a "command not found" error:

1. Verify the extension is installed: `gh extension list`
2. Reinstall if needed: `gh extension install mona-actions/gh-repo-stats-plus`

### Node.js not found

The extension requires Node.js. Install it from [nodejs.org](https://nodejs.org/) and ensure it's in your PATH.

### Permission errors

If you encounter permission errors during installation, you may need to:

1. Update your GitHub CLI: `gh extension upgrade gh`
2. Check your GitHub authentication: `gh auth status`
3. Ensure you have proper permissions to install extensions

### Network Issues

If you experience network-related installation failures:

- Check your internet connection
- If behind a corporate firewall, ensure GitHub CLI can access GitHub.com
- Try using a different network or VPN if corporate restrictions apply
