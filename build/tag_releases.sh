#!/usr/bin/env bash
# Create a git tag for every service of one environment, from the version in its
# spec (info.version in base/<service>/<env>.yaml):
#
#   <service>/<env>/<version>      e.g. medical-events/stage/9.15.7
#                                       ehealth-pis/prod/9.11.0.3-v2   ("9.11.0.3 v.2")
#
# Idempotent: a tag that already exists is left alone, so it is safe to run on
# every push. Annotated tags, created on HEAD of the checked-out main.
#
# Usage: build/tag_releases.sh <env> [--push]
set -euo pipefail

ENV_NAME="${1:?usage: tag_releases.sh <env> [--push]}"
PUSH="${2:-}"
case "$ENV_NAME" in prod|preprod|stage|demo) ;; *) echo "unknown environment: $ENV_NAME" >&2; exit 1 ;; esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

created=()
while IFS=$'\t' read -r svc version; do
  # tag names cannot contain spaces: "9.15.9 v.1" -> "9.15.9-v1"
  norm="$(printf '%s' "$version" | sed -E 's/[[:space:]]+[vV]\.?/-v/; s/[[:space:]]+/-/g')"
  tag="$svc/$ENV_NAME/$norm"
  git check-ref-format "refs/tags/$tag" || { echo "invalid tag name: $tag" >&2; exit 1; }
  if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
    echo "exists   $tag"
  else
    git tag -a "$tag" -m "$svc $ENV_NAME $version"
    echo "created  $tag"
    created+=("$tag")
  fi
done < <(python3 build/spec_versions.py "$ENV_NAME")

if [[ "$PUSH" == "--push" && ${#created[@]} -gt 0 ]]; then
  for tag in "${created[@]}"; do git push -q origin "refs/tags/$tag"; done
  echo "pushed ${#created[@]} tag(s)"
fi
