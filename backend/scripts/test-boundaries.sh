#!/bin/bash
TOKEN=$(curl -s -H 'User-Agent: Mozilla/5.0' -H 'Content-Type: application/json' -d '{"cid":"5966","password":"test123"}' https://cwflysim.cn/api/auth/login 2>/dev/null | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("data",{}).get("token",""))')
echo "Token len: ${#TOKEN}"
curl -s -H 'User-Agent: Mozilla/5.0' -H 'X-Requested-With: XMLHttpRequest' -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3000/api/flightplans/fsd/boundaries
