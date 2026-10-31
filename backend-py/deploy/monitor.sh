#!/bin/bash
# ============================================================
#  CWFLY Python API 监控（cron 每分钟）
#  - 健康检查失败 -> pm2 重启 + 告警
#  - 最近 60s ERROR/5xx 数量 -> 超阈值告警
#  - 告警经 OneBot 发到 QQ 群（/opt/cwfly/bot/.env），失败仅记日志
#  - 相同告警 10 分钟内不重复（状态文件去重）
# ============================================================
set -u
NAME=cwfly-api-py
URL=http://127.0.0.1:3001/health
ERRLOG=/root/.pm2/logs/$NAME-error.log
LOG=/opt/cwfly/monitor-api-py.log
STATE=/tmp/.monitor-api-py.state
BOTENV=/opt/cwfly/bot/.env
TS=$(date '+%F %T')

log() { echo "[$TS] $*" >> "$LOG"; }

notify() {
  local msg="$1" key="$2" now last
  now=$(date +%s)
  last=$(grep -E "^$key " "$STATE" 2>/dev/null | awk '{print $2}')
  last=${last:-0}
  if [ $((now - last)) -lt 600 ]; then
    log "（10 分钟内已告警，跳过）$msg"
    return
  fi
  echo "$key $now" >> "$STATE"
  if [ ! -f "$BOTENV" ]; then log "告警（无 bot env）: $msg"; return; fi
  local token gid
  token=$(grep -E '^ONEBOT_ACCESS_TOKEN=' "$BOTENV" | cut -d= -f2- | tr -d '"')
  gid=$(grep -E '^NOTIFY_GROUP_ID=' "$BOTENV" | cut -d= -f2- | tr -d '"' | cut -d, -f1)
  [ -z "$gid" ] && gid=$(grep -E '^CONTROL_GROUP_ID=' "$BOTENV" | cut -d= -f2- | tr -d '"' | cut -d, -f1)
  if [ -z "$gid" ]; then log "告警（无群号）: $msg"; return; fi
  if [ "${MONITOR_NO_NOTIFY:-0}" = "1" ]; then log "告警（测试模式未发送）: $msg"; return; fi
  curl -s -m 5 -X POST "http://127.0.0.1:6700/send_group_msg?access_token=$token" \
    -H 'Content-Type: application/json' \
    -d "{\"group_id\":$gid,\"message\":\"[CWFLY-API监控] $msg\"}" >/dev/null 2>&1 \
    && log "已发送告警: $msg" || log "告警发送失败: $msg"
}

# ---- 1) 健康检查 ----
code=$(curl -s -o /dev/null -m 5 -w '%{http_code}' "$URL")
if [ "$code" != "200" ]; then
  log "健康检查失败（HTTP $code），尝试重启 $NAME"
  pm2 restart "$NAME" --update-env >/dev/null 2>&1 || true
  sleep 8
  code2=$(curl -s -o /dev/null -m 5 -w '%{http_code}' "$URL")
  log "重启后健康检查: HTTP $code2"
  [ "$code2" = "200" ] && notify "API 健康检查失败（已自动重启恢复）" health || notify "API 健康检查失败（重启后仍未恢复！）" health
  exit 0
fi

# ---- 2) 最近 60s 错误日志计数 ----
errs=0
if [ -f "$ERRLOG" ]; then
  errs=$(awk -v cutoff="$(date -d '-90 seconds' '+%Y-%m-%d %H:%M:%S' 2>/dev/null)" '
    { ts = $1 " " $2 }
    ts >= cutoff && /(ERROR|Traceback|Exception)/ { c++ }
    END { print c+0 }' "$ERRLOG" 2>/dev/null)
fi
if [ "${errs:-0}" -ge 3 ]; then
  log "最近 90s 错误数=$errs"
  notify "最近 90 秒出现 $errs 条错误日志，请检查 pm2 logs $NAME" errors
fi

# ---- 3) 进程状态 ----
pid=$(pm2 pid "$NAME" 2>/dev/null | tr -d '[:space:]')
if [ -z "$pid" ] || [ "$pid" = "0" ]; then
  log "进程未运行（pm2 pid=0），尝试启动"
  pm2 start "$NAME" >/dev/null 2>&1 || true
  notify "API 进程未运行，已尝试启动" proc
fi

# ---- 4) 日志轮转（>50MB 截断）----
if [ -f "$ERRLOG" ]; then
  size=$(stat -c%s "$ERRLOG")
  if [ "$size" -gt 52428800 ]; then
    : > "$ERRLOG"
    log "错误日志超 50MB，已截断"
  fi
fi
if [ -f "$LOG" ]; then
  size=$(stat -c%s "$LOG")
  [ "$size" -gt 10485760 ] && tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
