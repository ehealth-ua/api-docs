#!/usr/bin/env bash
# Stamp the "last deployed" badge into index.html at actual deploy time, so
# the timestamp reflects the real publish moment rather than whenever the
# commit happened to be authored. Idempotent: replaces the existing badge
# text (matched by id="deploy-badge") rather than duplicating it.
#
# Usage: scripts/stamp_deploy_badge.sh [<index.html path>] [<timestamp>]
#        (path defaults to ./index.html; timestamp defaults to now, format
#        "14 Sep 2026 15:30 EEST" -- matches api-docs-platform's sandbox
#        portal badge format, scripts/stamp_deploy_badge.py there)
set -euo pipefail

FILE="${1:-index.html}"
STAMP="${2:-$(date '+%-d %b %Y %H:%M %Z')}"

if [[ ! -f "$FILE" ]]; then
  echo "no such file: $FILE" >&2
  exit 1
fi

python3 - "$FILE" "$STAMP" <<'PYEOF'
import re, sys
path, stamp = sys.argv[1], sys.argv[2]
with open(path, encoding="utf-8") as fh:
    text = fh.read()
new = re.sub(
    r'(<div id="deploy-badge"[^>]*>)[^<]*(</div>)',
    lambda m: f"{m.group(1)}deployed {stamp}{m.group(2)}",
    text,
    count=1,
)
if new == text:
    print(f'warning: no #deploy-badge element found in {path}', file=sys.stderr)
    sys.exit(1)
with open(path, "w", encoding="utf-8") as fh:
    fh.write(new)
print(f"stamped 'deployed {stamp}' into {path}")
PYEOF
