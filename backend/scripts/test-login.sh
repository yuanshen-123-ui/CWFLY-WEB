#!/bin/bash
LOGIN=$(curl -s -H 'User-Agent: Mozilla/5.0' -H 'Content-Type: application/json' -d '{"cid":"5966","password":"test123"}' https://cwflysim.cn/api/auth/login 2>/dev/null)
echo "LOGIN: $LOGIN"
TOKEN=$(echo "$LOGIN" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("data",{}).get("token",""))' 2>/dev/null)
echo "TOKEN: [$TOKEN]"
