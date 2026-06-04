#!/usr/bin/env bash
# scripts/git-sync.sh — Force a full sync of the local main branch to GitHub.
#
# Usage: bash scripts/git-sync.sh
#
# Requires GITHUB_TOKEN to be set in the environment (Replit secret).
# Never hard-codes credentials.

set -euo pipefail

REPO="https://github.com/JBlizzard-sketch/duka-connect.git"
BRANCH="main"

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "Error: GITHUB_TOKEN environment variable is not set." >&2
  echo "Add it as a Replit secret and re-run." >&2
  exit 1
fi

REMOTE_URL="https://${GITHUB_TOKEN}@github.com/JBlizzard-sketch/duka-connect.git"

echo "=== Duka Connect — GitHub Sync ==="
echo "Repo   : $REPO"
echo "Branch : $BRANCH"
echo ""

# Ensure the remote is registered (idempotent)
if git remote get-url github &>/dev/null; then
  git remote set-url github "$REMOTE_URL"
else
  git remote add github "$REMOTE_URL"
fi

echo "--- Fetching from github remote ---"
git fetch github 2>&1 | sed "s|${GITHUB_TOKEN}|***|g"

LOCAL_SHA=$(git rev-parse "$BRANCH")
REMOTE_SHA=$(git rev-parse "github/$BRANCH" 2>/dev/null || echo "none")

echo ""
echo "Local  HEAD : $LOCAL_SHA"
echo "GitHub HEAD : $REMOTE_SHA"

if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  echo ""
  echo "Already in sync. Nothing to push."
  exit 0
fi

echo ""
echo "--- Pushing $BRANCH to github remote ---"
git push github "$BRANCH" 2>&1 | sed "s|${GITHUB_TOKEN}|***|g"

echo ""
echo "Sync complete."
echo "GitHub: https://github.com/JBlizzard-sketch/duka-connect/commits/$BRANCH"
