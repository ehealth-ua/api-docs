#!/usr/bin/env python3
"""Print "<service><TAB><info.version>" for every base/<service>/<env>.yaml.

Usage: build/spec_versions.py <env>   (run from the repository root)
"""
import glob
import os
import re
import sys

env = sys.argv[1]
pattern = re.compile(r'^info:\n(?:(?:  .*|)\n)*?  version:\s*["\']?([^"\'\n]+)', re.M)
for path in sorted(glob.glob(f"base/*/{env}.yaml")):
    service = os.path.basename(os.path.dirname(path))
    with open(path, encoding="utf-8") as fh:
        match = pattern.search(fh.read())
    if not match:
        sys.exit(f"no info.version in {path}")
    print(f"{service}\t{match.group(1).strip()}")
