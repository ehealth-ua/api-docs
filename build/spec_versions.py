#!/usr/bin/env python3
"""Print "<service><TAB><version>" for every base/<service>/<env>.yaml.

The version is configuration and lives in overlay/<service>/meta.yaml (see
build/apply_overlay.py), not in base/.

Usage: build/spec_versions.py <env>   (run from the repository root)
"""
import glob
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from apply_overlay import overlay_version  # noqa: E402

env = sys.argv[1]
for path in sorted(glob.glob(f"base/*/{env}.yaml")):
    service = os.path.basename(os.path.dirname(path))
    print(f"{service}\t{overlay_version(env, service)}")
