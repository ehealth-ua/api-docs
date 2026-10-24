#!/usr/bin/env bash
# Print the environments a change targets, from the paths it touches.
#
#   base/<service>/<env>.yaml, dist/<env>/**   -> that environment
#   portal/, build/, overlay/, static/, .github/ and any other shared path -> all environments
#   README.md, docs/ only                      -> none
#
# Usage: build/changed_envs.sh <base-rev> <head-rev>      prints e.g. "prod stage"
#        build/changed_envs.sh --all                      prints all four
#        build/changed_envs.sh --json <base> <head>       prints a JSON array for a matrix
set -euo pipefail

ALL=(prod preprod stage demo)
JSON=""
if [[ "${1:-}" == "--json" ]]; then JSON=1; shift; fi

if [[ "${1:-}" == "--all" ]]; then
  envs=("${ALL[@]}")
else
  base="${1:?usage: changed_envs.sh [--json] <base-rev> <head-rev> | --all}"
  head="${2:?usage: changed_envs.sh [--json] <base-rev> <head-rev> | --all}"
  # an unknown base (first push, force-push, all-zero sha) deploys everything
  if ! git rev-parse -q --verify "$base^{commit}" >/dev/null; then
    envs=("${ALL[@]}")
  else
    hit=" "
    shared=""
    while IFS= read -r f; do
      case "$f" in
        base/*/prod.yaml|dist/prod/*)       hit="${hit}prod " ;;
        base/*/preprod.yaml|dist/preprod/*) hit="${hit}preprod " ;;
        base/*/stage.yaml|dist/stage/*)     hit="${hit}stage " ;;
        base/*/demo.yaml|dist/demo/*)       hit="${hit}demo " ;;
        README.md|docs/*)                   ;;
        *)                                  shared=1 ;;
      esac
    done < <(git diff --name-only "$base" "$head")
    envs=()
    for e in "${ALL[@]}"; do
      if [[ -n "$shared" || "$hit" == *" $e "* ]]; then envs+=("$e"); fi
    done
  fi
fi

if [[ -n "$JSON" ]]; then
  printf '['
  sep=""
  for e in ${envs[@]+"${envs[@]}"}; do printf '%s"%s"' "$sep" "$e"; sep=","; done
  printf ']\n'
else
  echo "${envs[*]-}"
fi
