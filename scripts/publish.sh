#!/usr/bin/env bash
# Publishes into the `prod` branch (the GitHub Pages source for squattersnights.fun):
#   scripts/publish.sh root|nightly|restore-root|media <dir> "<commit message>"
# It takes the CURRENT contents of the branch, replaces only the part that belongs to this channel (see assemble.mjs)
# and pushes the result as a single fresh commit (no history piles up on the Pages branch). If somebody else published
# in the meantime it simply starts again from their result, so Stable and Nightly publishes can never overwrite each other.
set -euo pipefail
MODE=$1; SRC=$(cd "$2" && pwd); MSG=$3
: "${GITHUB_REPOSITORY:?}" "${GH_TOKEN:?}"
HERE=$(cd "$(dirname "$0")" && pwd)
AUTH="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$GH_TOKEN" | base64 | tr -d '\n')"
REMOTE=${PUBLISH_REMOTE:-https://github.com/${GITHUB_REPOSITORY}.git}   # (tests point this at a local repo)
g() { git -c "http.https://github.com/.extraheader=$AUTH" "$@"; }

for attempt in 1 2 3 4 5; do
  W=$(mktemp -d)
  g clone -q --branch prod --single-branch --depth 1 "$REMOTE" "$W"
  OLD=$(git -C "$W" rev-parse HEAD)
  node "$HERE/assemble.mjs" "$MODE" "$SRC" "$W"
  cd "$W"
  git config user.name "game-night-bot"; git config user.email "game-night-bot@users.noreply.github.com"
  git checkout -q --orphan publish
  git add -A
  git commit -q -m "$MSG"
  if g push --force-with-lease="prod:${OLD}" origin publish:prod; then
    gh api -X POST "repos/${GITHUB_REPOSITORY}/pages/builds" --silent || true
    echo "published ($MODE) on attempt $attempt"
    exit 0
  fi
  echo "someone published at the same time — retrying ($attempt)" >&2
  cd /; sleep $((attempt * 3))
done
echo "could not publish" >&2
exit 1
