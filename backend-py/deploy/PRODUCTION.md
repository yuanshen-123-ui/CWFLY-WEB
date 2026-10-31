# 生产部署状态与运维手册（Python/FastAPI）

> 2026-10-31 已完成 **P4 停机切换**：生产 API 由 Python 后端承载，Node 后端已停止（保留用于回滚）。

## 一、生产拓扑

| 组件 | 位置 | 说明 |
|---|---|---|
| Python API | `/opt/cwfly/backend-py`，PM2 名称 **`cwfly-api-py`**，监听 `127.0.0.1:3001` | 入口 `app.asgi:application`（HTTP + Socket.IO） |
| Node API（已停止） | `/opt/cwfly/backend`，PM2 名称 `cwfly-api`（cluster ×2） | 回滚用：`pm2 start cwfly-api` |
| nginx | `/www/server/panel/vhost/nginx/{api,atc,cwfly}.cwfly.conf.conf` | 已把 `proxy_pass 127.0.0.1:3000` 全部改为 `:3001`（共 8 处） |
| 前端静态 | `root /opt/cwfly/frontend/dist`（nginx 直出，不经后端） | 不受后端切换影响 |
| 上传目录 | `/opt/cwfly/backend-py/uploads` → 软链到 `/opt/cwfly/backend/uploads` | Node/Python 共用同一份文件 |
| 配置 | `/opt/cwfly/backend-py/.env`（复制自 Node 的 `.env`，`PORT=3001`） | 同一个 MySQL 库、同一个 `JWT_SECRET` |
| venv | `/opt/cwfly/backend-py/.venv`（Python 3.11.9） | 依赖见 `requirements.txt` |

## 二、日常更新

```bash
# 本地打包（仓库根目录）
tar -czf /tmp/backend-py.tgz --exclude='backend-py/.venv' --exclude='backend-py/logs' \
    --exclude='backend-py/uploads' --exclude='backend-py/backups' --exclude='backend-py/.env' backend-py
scp /tmp/backend-py.tgz root@<server>:/tmp/
scp backend-py/deploy/deploy.sh root@<server>:/tmp/
ssh root@<server> 'bash /tmp/deploy.sh'      # 自动：停服→解包→保留 venv/.env→装依赖→编译→DB自检→起服→健康检查→pm2 save
```

## 三、回滚到 Node（一条命令）

```bash
ssh root@<server> 'bash /tmp/deploy.sh --rollback'
# 等价于：
#   nginx 恢复 /tmp/nginx-rollback-* 备份 → nginx -s reload
#   pm2 start cwfly-api   （Node 恢复）
#   pm2 stop  cwfly-api-py（Python 停止）
```

## 四、切换验收记录（2026-10-31）

- Node(:3000) vs Python(:3001) **20/20 接口响应逐字节一致**（含 admin 管理后台、weather、dashboard、分页）；
- 公网切换前后同一批 URL 状态码 + body sha256 一致；
- Socket.IO 握手正常（`0{"sid":...`）；
- 首页与 `/assets/*` 由 nginx 静态直出，200；
- 停 Node 后复验行为不变 → 完成切换。

## 五、注意

1. **PM2 持久化**：已 `pm2 save`；重启服务器后 `cwfly-api-py` 会自动拉起（Node 保持 stopped）。
2. **限流存储**：目前为进程内滑动窗口（单实例）；若扩到多实例需换 Redis/MySQL 共享 store。
3. **Node 代码保留**：`/opt/cwfly/backend` 与仓库 `backend/` 先保留 1 周观察期，确认无回滚需求后再删除。
4. **观察重点**：登录/注册、飞行计划提交（FSD 广播）、活动报名、上传（头像/海报/会议资料）、管理后台、Socket.IO 在线人数。

## 六、切换时必须同步修改的运维脚本（已完成）

`/opt/cwfly/ddos-hardening.sh`（cron 每分钟执行 `recover`）原先监控 `http://127.0.0.1:3000/health` 并
`pm2 reload cwfly-api`，Node 停止后会被它自动拉起（实测发生过一次）。切换时已改为：

```bash
RECOVER_API="http://127.0.0.1:3001/health"
pm2 reload cwfly-api-py 2>/dev/null || pm2 restart cwfly-api-py 2>/dev/null
# 备份：/opt/cwfly/ddos-hardening.sh.bak-py-cutover-<时间戳>
```

> 其它 cron（bot 健康检查 `cwfly-bot-healthcheck.sh`、数据库备份 `db_backup.sh`）与本次切换无关，未改动。
