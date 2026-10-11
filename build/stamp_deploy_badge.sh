#!/usr/bin/env bash
# Stamp the per-service "last deployed" badge into the published index.html.
#
# The badge is shown in the top-right corner and follows the service that is
# open on the page (the URL hash: #medical-events, #general-mis, ...). A deploy
# of one service moves only that service's time; the other services keep theirs.
#
# A service's time is the time of the last merge into this environment branch
# that changed its files (base/<service>/<env>.yaml or overlay/<service>/).
# Nothing is stored between deploys: it is read from git history, so the
# checkout must be full (actions/checkout with fetch-depth: 0).
#
# Idempotent: replaces the existing badge element and runtime script rather
# than duplicating them. index.html in the repository is never modified; run
# this on the copy that is about to be published.
#
# Usage: build/stamp_deploy_badge.sh <index.html> <env> [--now svc1,svc2]
#   <env>   prod | preprod | stage | demo
#   --now   stamp these services with the current time instead of the git time
#           (for PR previews, where the change is not merged yet)
set -euo pipefail

FILE="${1:?usage: stamp_deploy_badge.sh <index.html> <env> [--now svc1,svc2]}"
ENV_NAME="${2:?usage: stamp_deploy_badge.sh <index.html> <env> [--now svc1,svc2]}"
NOW_SERVICES=""
if [[ "${3:-}" == "--now" ]]; then NOW_SERVICES="${4:-}"; fi

if [[ ! -f "$FILE" ]]; then
  echo "no such file: $FILE" >&2
  exit 1
fi

python3 - "$FILE" "$ENV_NAME" "$NOW_SERVICES" <<'PYEOF'
import json, os, re, subprocess, sys
from datetime import datetime
from zoneinfo import ZoneInfo

path, env, now_services = sys.argv[1], sys.argv[2], {s for s in sys.argv[3].split(",") if s}
TZ = ZoneInfo("Europe/Kyiv")

def fmt(ts: int) -> str:
    return datetime.fromtimestamp(ts, TZ).strftime("%-d %b %Y %H:%M %Z")

def git_time(service: str):
    out = subprocess.run(
        ["git", "log", "-1", "--first-parent", "--format=%ct", "--",
         f"base/{service}/{env}.yaml", f"overlay/{service}"],
        capture_output=True, text=True,
    ).stdout.strip()
    return int(out) if out else None

with open(path, encoding="utf-8") as fh:
    html = fh.read()

# Services in the order the page lists them; the first one is the default.
slugs = re.findall(r"slug:\s*'([^']+)'", html)
if not slugs:
    sys.exit(f"no services (slug: '...') found in {path}")

fallback = int(subprocess.run(["git", "log", "-1", "--format=%ct"], capture_output=True, text=True).stdout.strip() or 0)
now = int(datetime.now(TZ).timestamp())
stamps = {}
for slug in slugs:
    ts = now if slug in now_services else (git_time(slug) or fallback or now)
    stamps[slug] = fmt(ts)

badge = '<div id="deploy-badge" title="Last deployed" data-stamps=\'%s\'></div>' % json.dumps(stamps, ensure_ascii=False)
new, n = re.subn(r'<div id="deploy-badge"[^>]*>[^<]*</div>', badge, html, count=1)
if n == 0:
    sys.exit(f"no #deploy-badge element found in {path}")

runtime = """<!-- deploy-badge-runtime -->
    <script>
      (function () {
        var el = document.getElementById('deploy-badge');
        if (!el) return;
        var stamps = {};
        try { stamps = JSON.parse(el.getAttribute('data-stamps') || '{}'); } catch (e) {}
        var first = Object.keys(stamps)[0];
        var last = null;
        function show() {
          var h = location.hash;
          if (h === last) return;
          last = h;
          var slug = h.replace(/^#\\/?/, '').split(/[\\/?]/)[0] || first;
          el.textContent = stamps[slug] ? 'deployed ' + stamps[slug] : '';
        }
        window.addEventListener('hashchange', show);
        setInterval(show, 400);
        show();
      })();
    </script>
    <!-- /deploy-badge-runtime -->
"""
new = re.sub(r"[ \t]*<!-- deploy-badge-runtime -->.*?<!-- /deploy-badge-runtime -->\n?", "", new, flags=re.S)
if "</body>" not in new:
    sys.exit(f"no </body> found in {path}")
new = new.replace("</body>", runtime + "  </body>", 1)

with open(path, "w", encoding="utf-8") as fh:
    fh.write(new)
for slug, s in stamps.items():
    print(f"  {slug}: deployed {s}")
print(f"stamped {len(stamps)} services into {path}")
PYEOF
