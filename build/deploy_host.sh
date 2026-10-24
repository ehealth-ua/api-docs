#!/usr/bin/env bash
# Run ON THE DOCS HOST. Pulls the repository fresh and publishes every
# environment to the folder nginx serves for it. The host pulls; nothing needs
# to be pushed to it, so CI can stay on GitHub-hosted runners.
#
# Every environment is built from main (which holds one file per environment):
#   $SRC_ROOT/<env>   a clone of main, reset to origin on every run
#   $PUBLISH_BASE/<dir>   the nginx root of that environment (rsync target)
#
# Usage: build/deploy_host.sh [--dry-run] [env ...]     (default: all four)
#   --dry-run   build everything, but only list what rsync would change
#
# Needs: git, python3 (3.9+), rsync. Node is not needed here; the stale-docs
# check runs in CI on every PR.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/ehealth-ua/api-docs.git}"
SRC_ROOT="${SRC_ROOT:-$HOME/projects/api-docs-src}"
PUBLISH_BASE="${PUBLISH_BASE:-$HOME/projects}"

publish_dir() {
  case "$1" in
    prod)    echo "$PUBLISH_BASE/api-docs" ;;
    preprod) echo "$PUBLISH_BASE/api-docs-preprod" ;;
    stage)   echo "$PUBLISH_BASE/api-docs-stage" ;;
    demo)    echo "$PUBLISH_BASE/api-docs-demo" ;;
    *) echo "unknown environment: $1" >&2; return 1 ;;
  esac
}

DRY=""
ENVS=()
for arg in "$@"; do
  if [[ "$arg" == "--dry-run" ]]; then DRY="--dry-run"; else ENVS+=("$arg"); fi
done
[[ ${#ENVS[@]} -gt 0 ]] || ENVS=(prod preprod stage demo)

mkdir -p "$SRC_ROOT"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

for env in "${ENVS[@]}"; do
  dest="$(publish_dir "$env")"
  src="$SRC_ROOT/$env"
  echo "=== $env  ->  $dest ${DRY:+(dry run)}"

  # pull fresh: clone once, then force the checkout to match origin
  if [[ ! -d "$src/.git" ]]; then
    git clone -q --branch main --single-branch "$REPO_URL" "$src"
  fi
  git -C "$src" fetch -q origin main
  git -C "$src" reset -q --hard FETCH_HEAD
  echo "commit: $(git -C "$src" log -1 --format='%h %s')"

  # build the publishable site and stamp the per-service deploy times
  site="$WORK/$env"
  (cd "$src" && SKIP_PREBUILD_CHECK=1 build/assemble_site.sh "$env" "$site" >/dev/null)
  (cd "$src" && build/stamp_deploy_badge.sh "$site/index.html" "$env" >/dev/null)

  # publish in place (same directory, so the container's bind mount stays valid)
  [[ -d "$dest" ]] || { echo "publish dir missing: $dest" >&2; exit 1; }
  chmod -R u=rwX,go=rX "$site"   # nginx in the container must be able to read everything
  rsync -rltp --delete --checksum --itemize-changes $DRY "$site/" "$dest/"
done
echo "done${DRY:+ (dry run: nothing was changed)}"
