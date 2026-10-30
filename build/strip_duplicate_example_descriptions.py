#!/usr/bin/env python3
"""Remove a `description` that only repeats the node's own example.

Since patch P12 (SCALAR_PATCHES.md) the example of a plain field is shown inline as
a pill, so a description that is just `e.g. <example>` (typically on header /
parameter nodes: `description: e.g. Bearer eyJ…` next to `example: Bearer eyJ…`)
shows the same value twice. This pass deletes ONLY such descriptions:

  * the node has a scalar `example` (or `schema.example`), and
  * the description (with or without an `e.g.` / `example` / `for example` lead-in) is
    >= 95% similar to it (difflib ratio after whitespace/quote normalisation).

Anything else (real prose, a different value, no example) is left alone.
Prose-only (`description` is stripped from the verified-route contract hash).
Format-preserving: deletes the key's physical lines via PyYAML node marks, never a
dump; a key sitting on a `- ` list-item line is skipped (would need the dash moved).
Idempotent. Verifies after writing: the re-parsed document equals the original with
exactly those keys removed.

usage: strip_duplicate_example_descriptions.py [--dry-run] [--list] <spec.yaml> [...]   (--list prints the non-`e.g.` fuzzy matches)
"""
import re, sys, difflib
import yaml

THRESHOLD = 0.95

PAT = re.compile(r'^\s*(?:e\.?g\.?|for example|example)[:\s]\s*(.+?)\s*$', re.I | re.S)
norm = lambda s: re.sub(r'\s+', ' ', str(s)).strip().strip('`"\'').strip()


def similar(a, b):
    """difflib ratio, with cheap length / equality shortcuts (ratio <= 2*min/(min+max))."""
    if a == b:
        return 1.0
    la, lb = len(a), len(b)
    if not la or not lb or 2 * min(la, lb) / (la + lb) < THRESHOLD or max(la, lb) > 3000:
        return 0.0
    return difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()


def duplicate(desc, example):
    """True when the description is (>= THRESHOLD) the example itself, with or without an `e.g.` lead-in."""
    if not isinstance(desc, str) or example is None or isinstance(example, (dict, list)):
        return False
    e = norm(example)
    if not e:
        return False
    m = PAT.match(desc)
    return max(similar(norm(desc), e), similar(norm(m.group(1)), e) if m else 0.0) >= THRESHOLD


def process(path, dry):
    text = open(path, encoding='utf-8').read()
    lines = text.split('\n')
    root = yaml.compose(text, Loader=yaml.SafeLoader)
    cuts, removed, skipped = [], [], {'other': 0, 'listitem': 0, 'flow': 0}

    def sval(m, key):
        for k, v in m.value:
            if isinstance(k, yaml.ScalarNode) and k.value == key:
                return k, v
        return None, None

    def lit(n):  # example scalar text if it is a plain scalar node
        return n.value if isinstance(n, yaml.ScalarNode) else None

    def walk(n, path_):
        if isinstance(n, yaml.MappingNode):
            dk, dv = sval(n, 'description')
            if dv is not None and isinstance(dv, yaml.ScalarNode):
                ek, ev = sval(n, 'example')
                if ev is None:
                    sk, sv = sval(n, 'schema')
                    if isinstance(sv, yaml.MappingNode):
                        ek, ev = sval(sv, 'example')
                e = lit(ev)
                if e is not None and duplicate(dv.value, e):
                    if n.flow_style:
                        skipped['flow'] += 1
                    else:
                        ln = dk.start_mark.line
                        before = lines[ln][:dk.start_mark.column]
                        if before.strip():
                            skipped['listitem'] += 1
                        else:
                            end = dv.end_mark.line + (1 if dv.end_mark.column > 0 else 0)
                            cuts.append((ln, end))
                            removed.append((path, dv.value.strip()[:80], str(e)[:60]))
            for k, v in n.value:
                walk(v, path_)
        elif isinstance(n, yaml.SequenceNode):
            for v in n.value:
                walk(v, path_)

    walk(root, [])
    cuts.sort()
    # no overlaps expected; guard anyway
    for a, b in zip(cuts, cuts[1:]):
        assert a[1] <= b[0], f'overlapping cuts {a} {b}'
    if cuts and not dry:
        keep = []
        i = 0
        drop = set()
        for a, b in cuts:
            drop.update(range(a, b))
        new = '\n'.join(l for idx, l in enumerate(lines) if idx not in drop)
        # verify: reparsed new == old minus those keys
        old_doc = yaml.load(text, Loader=yaml.SafeLoader)
        new_doc = yaml.load(new, Loader=yaml.SafeLoader)

        def strip(o, n_):
            if isinstance(o, dict):
                if 'description' in o and 'description' not in (n_ if isinstance(n_, dict) else {}):
                    ex = o.get('example')
                    if ex is None and isinstance(o.get('schema'), dict):
                        ex = o['schema'].get('example')
                    if duplicate(o['description'], ex):
                        o = {k: v for k, v in o.items() if k != 'description'}
                return {k: strip(v, n_.get(k, {}) if isinstance(n_, dict) else {}) for k, v in o.items()}
            if isinstance(o, list):
                return [strip(v, n_[i] if isinstance(n_, list) and i < len(n_) else {}) for i, v in enumerate(o)]
            return o
        assert strip(old_doc, new_doc) == new_doc, f'{path}: structural verification failed'
        open(path, 'w', encoding='utf-8').write(new)
    return len(cuts), skipped, removed


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    dry = '--dry-run' in sys.argv
    tot = 0
    for p in args:
        n, sk, removed = process(p, dry)
        tot += n
        if '--list' in sys.argv:
            for r in removed:
                if not PAT.match(r[1]):
                    print('   non-e.g.:', r[1], '=>', r[2])
        print(f'{p}: {"would remove" if dry else "removed"} {n}  (skipped: listitem-first-key {sk["listitem"]}, flow {sk["flow"]})')
    print('total', tot)
