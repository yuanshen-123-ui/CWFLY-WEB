#!/usr/bin/env bash
# ============================================================================
#  P4 停机切换：Node(:3000) → Python(:3001)
#  验证方式：同一批公网 URL 在「切换前 Node 基线」与「切换后 Python」逐字节一致
#  失败自动回滚（nginx 恢复 + 重启 Node）
# ============================================================================
set -euo pipefail

VHOST=/www/server/panel/vhost/nginx
TS=$(date +%Y%m%d-%H%M%S)
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
URLS="
https://www.cwflysim.cn/api/auth/check-admin
https://www.cwflysim.cn/api/events
https://www.cwflysim.cn/api/staff
https://www.cwflysim.cn/api/forum/boards
https://www.cwflysim.cn/api/content/search?q=a
https://www.cwflysim.cn/api/training/courses
https://www.cwflysim.cn/api/dashboard/stats
https://atc.cwflysim.cn/api/auth/check-admin
"

snapshot() {
  local tag out u code sha
  tag="$1"
  out="/tmp/snap-$tag.txt"
  : > "$out"
  for u in $URLS; do
    code=$(curl -s -A "$UA" -o /tmp/s.json -w '%{http_code}' "$u")
    sha=$(sha256sum /tmp/s.json | cut -d' ' -f1)
    echo "$u|$code|$sha" >> "$out"
  done
}

echo "=== [0] Python 就绪检查 ==="
c=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/health)
echo "  /health => $c"
[ "$c" = "200" ] || { echo "✖ Python 未就绪"; exit 1; }

echo "=== [1] 采集 Node 基线 ==="
snapshot node

echo "=== [2] 备份并切流 ==="
for f in api.cwfly.conf.conf atc.cwfly.conf.conf cwfly.conf.conf; do cp -a "$VHOST/$f" "/tmp/nginx-rollback-$f.$TS"; done
sed -i 's#proxy_pass http://127.0.0.1:3000;#proxy_pass http://127.0.0.1:3001;#' \
  "$VHOST/api.cwfly.conf.conf" "$VHOST/atc.cwfly.conf.conf" "$VHOST/cwfly.conf.conf"
nginx -t && nginx -s reload
sleep 2

echo "=== [3] Python 结果与基线比对 ==="
snapshot py
if diff -q /tmp/snap-node.txt /tmp/snap-py.txt >/dev/null; then
  echo "  ✔ 公网响应与 Node 基线逐字节一致"
else
  echo "  ✖ 不一致，回滚"
  diff /tmp/snap-node.txt /tmp/snap-py.txt || true
  for f in api.cwfly.conf.conf atc.cwfly.conf.conf cwfly.conf.conf; do cp -a "/tmp/nginx-rollback-$f.$TS" "$VHOST/$f"; done
  nginx -s reload
  exit 1
fi

SIO=$(curl -s -A "$UA" "https://www.cwflysim.cn/socket.io/?EIO=4&transport=polling" | head -c 40)
echo "  Socket.IO: $SIO"
case "$SIO" in 0\{*) echo "  ✔ 握手正常";; *) echo "  ✖ 握手异常，回滚";
  for f in api.cwfly.conf.conf atc.cwfly.conf.conf cwfly.conf.conf; do cp -a "/tmp/nginx-rollback-$f.$TS" "$VHOST/$f"; done
  nginx -s reload; exit 1;; esac

echo "=== [4] 停止 Node（PM2 条目保留，可 pm2 start cwfly-api 回滚）==="
pm2 stop cwfly-api >/dev/null 2>&1 || true
sleep 3
snapshot postnode
diff -q /tmp/snap-node.txt /tmp/snap-postnode.txt >/dev/null && echo "  ✔ 停 Node 后行为不变" || {
  echo "  ✖ 停 Node 后行为变化，回滚"
  for f in api.cwfly.conf.conf atc.cwfly.conf.conf cwfly.conf.conf; do cp -a "/tmp/nginx-rollback-$f.$TS" "$VHOST/$f"; done
  nginx -s reload; pm2 start cwfly-api >/dev/null 2>&1 || true; exit 1; }

echo "=== 切换完成（回滚：bash /tmp/deploy.sh --rollback）==="
