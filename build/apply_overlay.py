#!/usr/bin/env python3
"""Stamp the overlay's per-environment version into a base spec at build time.

The version of a document is configuration, not content: it lives in
overlay/<service>/meta.yaml and base/<service>/<env>.yaml carries none (a vendor
file arrives without one, and a spec that carries one has it removed with `strip`).
The build combines the two, so the published specs/<service>.yaml is
base + overlay.

  build/apply_overlay.py apply <env> <service> <base-spec>   print the combined spec
  build/apply_overlay.py strip <spec>                        print the spec without a version,
                                                             the version found goes to stderr
  build/apply_overlay.py version <env> <service>             print the overlay version (for tags)

Two places show the version and both are stamped:
  info.version                  `  version: "<v>"`, right after `  title:`
  the `**Version: <v>**` line   first line of info.description, in the style the
                                description is written in ('...', "..." or a block)
A value already in base is replaced (the overlay wins, with a note on stderr); a
missing one is inserted. The text is edited as lines, never through a YAML dump, so
the rest of the multi-MB file is untouched. Standard library only: the docs host
runs this without any package installed.

overlay/<service>/meta.yaml is a deliberately tiny YAML subset:

  version:
    prod: "9.15.6"
    demo: "9.15.20"
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENVS = ("prod", "preprod", "stage", "demo")
MARKER = re.compile(r"\*\*Version: [^*\n]*\*\*")


def fail(msg):
    sys.exit(f"apply_overlay: {msg}")


def overlay_versions(service):
    path = os.path.join(ROOT, "overlay", service, "meta.yaml")
    if not os.path.isfile(path):
        fail(f"missing {os.path.relpath(path, ROOT)}")
    versions, in_version = {}, False
    with open(path, encoding="utf-8") as fh:
        for n, raw in enumerate(fh, 1):
            line = raw.rstrip("\n")
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            if line == "version:":
                in_version = True
                continue
            m = re.fullmatch(r"  (prod|preprod|stage|demo): (?:\"([^\"]+)\"|([^\s\"#][^#]*?))\s*", line)
            if not (in_version and m):
                fail(f"{path}:{n}: expected 'version:' with '  <env>: \"<value>\"' lines, got {line!r}")
            versions[m.group(1)] = m.group(2) or m.group(3)
    return versions


def overlay_version(env, service):
    versions = overlay_versions(service)
    if env not in versions:
        fail(f"overlay/{service}/meta.yaml has no version for {env}")
    return versions[env]


def info_range(lines):
    if not lines or lines[0].rstrip("\n") != "openapi: 3.1.0" and not lines[0].startswith("openapi:"):
        fail("not an OpenAPI document")
    try:
        start = next(i for i, l in enumerate(lines) if l.rstrip("\n") == "info:")
    except StopIteration:
        fail("no top-level info:")
    end = next((i for i in range(start + 1, len(lines)) if lines[i] and not lines[i][0].isspace()), len(lines))
    return start, end


def find(lines, start, end, prefix):
    for i in range(start + 1, end):
        if lines[i].startswith(prefix):
            return i
    return None


def description_style(lines, i):
    """How info.description is written, from its first line."""
    first = lines[i].rstrip("\n")
    value = first[len("  description:"):].strip()
    if value.startswith("'"):
        return "single"
    if value.startswith('"'):
        return "double"
    if value in ("|", "|-", "|+"):
        return "block"
    fail(f"unsupported info.description style: {first[:60]!r}")


def strip(lines):
    """Remove info.version and the **Version:** line; return (lines, version or None)."""
    lines = list(lines)
    start, end = info_range(lines)
    version = None
    v = find(lines, start, end, "  version:")
    if v is not None:
        version = lines[v].split(":", 1)[1].strip().strip("\"'")
        del lines[v]
        end -= 1
    d = find(lines, start, end, "  description:")
    if d is not None:
        style = description_style(lines, d)
        if style == "single":
            lines[d] = MARKER.sub("", lines[d], count=1)
        elif style == "double":
            lines[d] = re.sub(r'(?<=")\*\*Version: [^*\n]*\*\*(?:\\n\\n)?', "", lines[d], count=1)
        else:
            m = next((i for i in range(d + 1, end) if MARKER.fullmatch(lines[i].strip())), None)
            if m is not None:
                del lines[m]
                if m < len(lines) and not lines[m].strip():
                    del lines[m]
    return lines, version


def apply(lines, version, where):
    lines = list(lines)
    start, end = info_range(lines)
    v = find(lines, start, end, "  version:")
    new_v = f'  version: "{version}"\n'
    if v is not None:
        old = lines[v].split(":", 1)[1].strip().strip("\"'")
        if old != version:
            sys.stderr.write(f"apply_overlay: {where}: base has info.version {old!r}, overlay wins ({version!r})\n")
        lines[v] = new_v
    else:
        t = find(lines, start, end, "  title:")
        if t is None:
            fail(f"{where}: no info.title to place the version after")
        lines.insert(t + 1, new_v)
        end += 1
    d = find(lines, start, end, "  description:")
    if d is None:
        fail(f"{where}: no info.description")
    style = description_style(lines, d)
    text = f"**Version: {version}**"
    if style == "block":
        m = next((i for i in range(d + 1, end) if MARKER.search(lines[i])), None)
        if m is not None:
            lines[m] = MARKER.sub(text, lines[m], count=1)
        else:
            lines[d + 1:d + 1] = [f"    {text}\n", "\n"]
    else:
        # the marker sits on the description's first line, right after the opening quote
        first = lines[d]
        if MARKER.search(first):
            lines[d] = MARKER.sub(text, first, count=1)
        elif style == "single":
            if first.rstrip("\n") != "  description: '":
                fail(f"{where}: unexpected single-quoted description start {first[:60]!r}")
            lines[d] = "  description: '" + text + "\n"
        else:
            q = first.index('"') + 1
            lines[d] = first[:q] + text + "\\n\\n" + first[q:]
    return lines


def read(path):
    with open(path, encoding="utf-8", newline="") as fh:
        return fh.read().splitlines(keepends=True)


def main(argv):
    if len(argv) >= 2 and argv[0] == "version" and len(argv) == 3:
        print(overlay_version(argv[1], argv[2]))
    elif len(argv) == 4 and argv[0] == "apply":
        env, service, path = argv[1:]
        if env not in ENVS:
            fail(f"unknown environment {env}")
        sys.stdout.write("".join(apply(read(path), overlay_version(env, service), f"{service}/{env}")))
    elif len(argv) == 2 and argv[0] == "strip":
        out, version = strip(read(argv[1]))
        sys.stderr.write(f"version: {version}\n")
        sys.stdout.write("".join(out))
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
