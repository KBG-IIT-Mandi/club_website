#!/usr/bin/env bash
# Publish a release: build the site (no sourcemaps) and push ONLY the build
# artifacts to the public deploy repo. The source never leaves this machine —
# the deployment team works from the deploy repo alone.
#
#   ./scripts/publishRelease.sh ["release message"]
#
# Expects a clone of the deploy repo next to this one (override with
# KBG_DEPLOY_REPO=/path/to/clone).

set -euo pipefail
cd "$(dirname "$0")/.."

DEPLOY_REPO="${KBG_DEPLOY_REPO:-../club_website-deploy}"
test -d "$DEPLOY_REPO/.git" || { echo "FATAL: deploy repo clone not found at $DEPLOY_REPO"; exit 1; }

echo "▸ building (closed-source: no sourcemaps)"
npm run build

# Belt and braces: a public artifact must never carry source maps.
find dist -name '*.map' -delete
if grep -rl "sourceMappingURL" dist/assets >/dev/null 2>&1; then
  echo "FATAL: sourceMappingURL references found in dist — refusing to publish"
  exit 1
fi

echo "▸ syncing dist/ → $DEPLOY_REPO"
rsync -a --delete \
  --exclude '.git' \
  --exclude 'DEPLOY.md' \
  --exclude 'deploy.sh' \
  dist/ "$DEPLOY_REPO"/

cd "$DEPLOY_REPO"
git add -A
if git diff --cached --quiet; then
  echo "▸ nothing changed — no release to publish"
  exit 0
fi
git commit -m "${1:-release $(date +%Y-%m-%d\ %H:%M)}"
git push
echo "▸ published to $(git remote get-url origin)"
