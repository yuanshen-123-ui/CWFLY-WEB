#!/usr/bin/env bash
# ============================================================================
#  CWFLY Python 后端 · 生产部署/更新脚本（在服务器上执行）
#  用法：bash /tmp/deploy.sh            # 更新代码并重启 Python 实例
#        bash /tmp/deploy.sh --rollback # 回滚到 Node（nginx + PM2）
#  服务器现状：Node 已停止（cwfly-api），Python 由 PM2 托管（cwfly-api-py, :3001）
# ============================================================================
set -euo pipefail

DIR=/opt/cwfly/backend-py
# Node 后端已下线（2026-10-31），不再依赖 /opt/cwfly/backend
VHOST=/www/server/panel/vhost/nginx
PKG=${PKG:-/tmp/backend-py.tgz}
TS=$(date +%Y%m%d-%H%M%S)

rollback() {
  echo "=== 回滚到 Node ==="
  latest=$(ls -dt /tmp/nginx-rollback-*.${TS} /tmp/nginx-rollback-* 2>/dev/null | head -n 1 || true)
  for f in api.cwfly.conf.conf atc.cwfly.conf.conf cwfly.conf.conf; do
    bak=$(ls -t /tmp/nginx-rollback-$f.* 2>/dev/null | head -n 1 || true)
    [ -n "$bak" ] && cp -a "$bak" "$VHOST/$f" && echo "  恢复 $f <- $bak"
  done
  nginx -t && nginx -s reload
  pm2 start cwfly-api >/dev/null 2>&1 || true
  pm2 stop cwfly-api-py >/dev/null 2>&1 || true
  pm2 save >/dev/null 2>&1 || true
  echo "  已回滚到 Node（Node 在线，Python 已停止）"
  exit 0
}
[ "${1:-}" = "--rollback" ] && rollback

echo "=== [1] 停 Python 并暂存 uploads/.env ==="
pm2 stop cwfly-api-py >/dev/null 2>&1 || true
rm -rf /tmp/backend-py-uploads.preserve
[ -d "$DIR/uploads" ] && mv "$DIR/uploads" /tmp/backend-py-uploads.preserve

echo "=== [2] 解包（保留 venv / .env）==="
rm -rf /tmp/backend-py.extract && mkdir -p /tmp/backend-py.extract
tar -xzf "$PKG" -C /tmp/backend-py.extract
[ -d "$DIR/.venv" ] && mv "$DIR/.venv" /tmp/backend-py.extract/backend-py/.venv
[ -d "$DIR" ] && mv "$DIR" "${DIR}.bak-$TS"
mv /tmp/backend-py.extract/backend-py "$DIR"
if [ -f "${DIR}.bak-$TS/.env" ]; then
  cp -a "${DIR}.bak-$TS/.env" "$DIR/.env"
elif [ ! -f "$DIR/.env" ]; then
  echo "✖ 缺少 $DIR/.env，请从备份恢复后再部署"; exit 1
fi
sed -i 's/^PORT=.*/PORT=3001/' "$DIR/.env"
grep -q '^BACKEND_LOG_DIR=' "$DIR/.env" || echo "BACKEND_LOG_DIR=$DIR/logs" >> "$DIR/.env"

echo "=== [3] 恢复 uploads（真实目录，部署前已暂存）==="
if [ -d /tmp/backend-py-uploads.preserve ]; then
  rm -rf "$DIR/uploads"
  mv /tmp/backend-py-uploads.preserve "$DIR/uploads"
else
  mkdir -p "$DIR/uploads"/{avatars,posters,backgrounds,meetings}
fi
ls -ld "$DIR/uploads"

echo "=== [4] 依赖 + 编译 + DB 自检 ==="
cd "$DIR"
.venv/bin/python -m pip install -q -r requirements.txt
.venv/bin/python -m compileall -q app
.venv/bin/python - <<'PY'
import asyncio
from sqlalchemy import text
from app.db.session import SessionLocal

async def main():
    async with SessionLocal() as db:
        n = (await db.execute(text("SELECT COUNT(*) AS c FROM `User`"))).first()._mapping["c"]
        print(f"  DB OK, User={n}")

asyncio.run(main())
PY

echo "=== [5] 启动 + 健康检查 ==="
pm2 start .venv/bin/python --name cwfly-api-py -- -m uvicorn app.asgi:application --host 127.0.0.1 --port 3001 --log-level info
sleep 10
for p in /health /api/auth/check-admin /whazzup.json; do
  printf '  %-26s ' "$p"
  curl -s -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:3001$p"
done
pm2 save >/dev/null 2>&1 || true
echo "=== 部署完成 ==="
