import json, sys
d = json.load(sys.stdin)
cs = d.get('data', {}).get('data', {}).get('charts', []) or d.get('data', {}).get('charts', [])
cats = {}
for c in cs:
    k = c.get('category', '?')
    t = c.get('type_code', '?')
    n = (c.get('name') or c.get('id') or '?')[:40]
    if k not in cats: cats[k] = []
    cats[k].append(f'  [{t}] {n}')
for k in sorted(cats):
    print(f'{k}: ({len(cats[k])})')
    for x in cats[k][:4]: print(x)
