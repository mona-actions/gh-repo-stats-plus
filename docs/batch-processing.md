# Batch Processing with GitHub Actions

This guide shows how to use the batch processing options (`--batch-size`, `--batch-index`, `--batch-delay`) with GitHub Actions matrix strategy to parallelize stats collection for large organizations.

## Static Matrix (known batch count)

If you know roughly how many repos you have and can hardcode the batch count:

```yaml
name: Collect Repo Stats (Batched)

on:
  workflow_dispatch:
    inputs:
      org:
        description: 'Organization name'
        required: true
      batch-size:
        description: 'Repos per batch'
        required: true
        default: '50'

jobs:
  collect:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        batch-index: [0, 1, 2, 3, 4] # 5 batches → up to 250 repos at 50/batch
    steps:
      - uses: actions/checkout@v4

      - name: Install extension
        run: gh extension install mona-actions/gh-repo-stats-plus
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Collect stats (batch ${{ matrix.batch-index }})
        run: |
          gh repo-stats-plus repo-stats \
            --org-name "$ORG" \
            --batch-size "$BATCH_SIZE" \
            --batch-index ${{ matrix.batch-index }} \
            --batch-delay 5 \
            --output-dir output
        env:
          GH_TOKEN: ${{ secrets.STATS_TOKEN }}
          ORG: ${{ inputs.org }}
          BATCH_SIZE: ${{ inputs.batch-size }}

      - uses: actions/upload-artifact@v4
        with:
          name: batch-${{ matrix.batch-index }}
          path: output/*.csv

  combine:
    needs: collect
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install extension
        run: gh extension install mona-actions/gh-repo-stats-plus
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - uses: actions/download-artifact@v4
        with:
          path: output
          merge-multiple: true

      - name: Combine batch results
        run: |
          gh repo-stats-plus combine-stats \
            --files output/*.csv \
            --output-dir output \
            --output-file-name combined-stats.csv
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - uses: actions/upload-artifact@v4
        with:
          name: combined-results
          path: output/combined-stats.csv
```

**Key points:**

- `fail-fast: false` — if one batch fails, the others keep running
- `--batch-delay 5` — staggers each batch by 5s × its index to avoid rate-limit spikes when sharing a token
- Out-of-range batches (e.g., batch 4 when there are only 180 repos at 50/batch) process no repositories and write no data rows (you may still see a header-only CSV and state file)

## Dynamic Matrix (auto-calculated batch count)

A setup job queries the org's repo count, calculates how many batches are needed, and feeds that into the matrix:

```yaml
name: Collect Repo Stats (Dynamic Batched)

on:
  workflow_dispatch:
    inputs:
      org:
        description: 'Organization name'
        required: true
      batch-size:
        description: 'Repos per batch'
        required: true
        default: '50'

jobs:
  setup:
    runs-on: ubuntu-latest
    outputs:
      matrix: ${{ steps.calc.outputs.matrix }}
    steps:
      - name: Calculate batch matrix
        id: calc
        run: |
          REPO_COUNT=$(gh api "orgs/$ORG" --jq '.public_repos + .total_private_repos')
          BATCH_SIZE=$BATCH_SIZE_INPUT
          TOTAL_BATCHES=$(( (REPO_COUNT + BATCH_SIZE - 1) / BATCH_SIZE ))
          echo "Org has $REPO_COUNT repos → $TOTAL_BATCHES batches of $BATCH_SIZE"

          # Build JSON array [0, 1, 2, ...]
          INDICES=$(jq -nc "[range($TOTAL_BATCHES)]")
          echo "matrix={\"batch-index\":$INDICES}" >> "$GITHUB_OUTPUT"
        env:
          GH_TOKEN: ${{ secrets.STATS_TOKEN }}
          ORG: ${{ inputs.org }}
          BATCH_SIZE_INPUT: ${{ inputs.batch-size }}

  collect:
    needs: setup
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix: ${{ fromJson(needs.setup.outputs.matrix) }}
    steps:
      - uses: actions/checkout@v4

      - name: Install extension
        run: gh extension install mona-actions/gh-repo-stats-plus
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Collect stats (batch ${{ matrix.batch-index }})
        run: |
          gh repo-stats-plus repo-stats \
            --org-name "$ORG" \
            --batch-size "$BATCH_SIZE" \
            --batch-index ${{ matrix.batch-index }} \
            --batch-delay 5 \
            --output-dir output
        env:
          GH_TOKEN: ${{ secrets.STATS_TOKEN }}
          ORG: ${{ inputs.org }}
          BATCH_SIZE: ${{ inputs.batch-size }}

      - uses: actions/upload-artifact@v4
        with:
          name: batch-${{ matrix.batch-index }}
          path: output/*.csv

  combine:
    needs: collect
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install extension
        run: gh extension install mona-actions/gh-repo-stats-plus
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - uses: actions/download-artifact@v4
        with:
          path: output
          merge-multiple: true

      - name: Combine batch results
        run: |
          gh repo-stats-plus combine-stats \
            --files output/*.csv \
            --output-dir output \
            --output-file-name combined-stats.csv
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - uses: actions/upload-artifact@v4
        with:
          name: combined-results
          path: output/combined-stats.csv
```

## Using Separate PATs per Batch for Maximum Throughput

If you have multiple tokens, you can assign each batch its own token to get independent rate limits:

```yaml
steps:
  - name: Collect stats
    run: |
      gh repo-stats-plus repo-stats \
        --org-name "$ORG" \
        --batch-size "$BATCH_SIZE" \
        --batch-index ${{ matrix.batch-index }} \
        --output-dir output
    env:
      GH_TOKEN: ${{ secrets[format('STATS_TOKEN_{0}', matrix.batch-index)] }}
      ORG: ${{ inputs.org }}
      BATCH_SIZE: ${{ inputs.batch-size }}
```

This expects secrets named `STATS_TOKEN_0`, `STATS_TOKEN_1`, etc. With separate tokens, you can drop `--batch-delay` since each token has its own 5,000 requests/hour quota.

## Project Stats Variant

The same pattern works for `project-stats` — just swap the command:

```yaml
- name: Collect project stats (batch ${{ matrix.batch-index }})
  run: |
    gh repo-stats-plus project-stats \
      --org-name "$ORG" \
      --batch-size "$BATCH_SIZE" \
      --batch-index ${{ matrix.batch-index }} \
      --batch-delay 5 \
      --output-dir output
  env:
    ORG: ${{ inputs.org }}
    BATCH_SIZE: ${{ inputs.batch-size }}
```

## Tips

- **GitHub Actions matrix limit** is 256 jobs. At 50 repos/batch that covers up to 12,800 repos.
- **Resume on failure**: Add `--resume-from-last-save` and cache/persist the state files between retries so a re-run picks up where it left off.
- **`merge-multiple: true`** on `download-artifact` flattens all batch artifacts into a single directory, which is exactly what `combine-stats --files` expects.

## Using the GitHub Action

If you prefer a higher-level interface that handles extension installation, artifact uploading, and resume logic automatically, use the [GitHub Action](github-action.md) instead of installing the CLI extension manually in your workflow steps:

```yaml
- name: Gather Organization Stats (batch ${{ matrix.batch-index }})
  uses: mona-actions/gh-repo-stats-plus@v1
  with:
    type: organization
    github-token: ${{ github.token }}
    access-token: ${{ secrets.ACCESS_TOKEN }}
    organization: my-org
    batch-size: '50'
    batch-index: ${{ matrix.batch-index }}
    batch-delay: '5'
```

See [action/examples/batch-organization-stats.yml](../action/examples/batch-organization-stats.yml) for a complete batch workflow using the action.
