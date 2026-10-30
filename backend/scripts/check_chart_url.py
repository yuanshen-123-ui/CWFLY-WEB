import json, sys
d = json.load(sys.stdin)
cs = d.get('data', {}).get('data', {}).get('charts', [])
if cs:
    print('URL:', cs[0].get('image_day_url', 'N/A')[:100])
else:
    print('no charts')
    print(json.dumps(d, indent=2)[:500])
