#!/usr/bin/env bash
# git-push.sh — Push latest changes to GitHub
# Usage: bash scripts/git-push.sh "optional commit message"
#
# Requires GITHUB_TOKEN environment variable to be set.
# The remote URL is set to use the token for authentication.

set -euo pipefail

REPO_URL="https://${GITHUB_TOKEN}@github.com/JBlizzard-sketch/whatsapp-order-management.git"
BRANCH="main"
COMMIT_MSG="${1:-"chore: auto-sync $(date '+%Y-%m-%d %H:%M:%S')"}"

echo "🔄 Staging all changes..."
git add -A

# Only commit if there are staged changes
if git diff --cached --quiet; then
  echo "✅ Nothing to commit — working tree is clean."
else
  echo "📝 Committing: $COMMIT_MSG"
  git commit -m "$COMMIT_MSG"
fi

echo "🚀 Pushing to GitHub (branch: $BRANCH)..."
git push "$REPO_URL" "$BRANCH"

echo "✅ Done! View at: https://github.com/JBlizzard-sketch/whatsapp-order-management"
