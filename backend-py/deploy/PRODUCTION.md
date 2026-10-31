# 生产部署状态与运维手册（Python/FastAPI）

> 2026-10-31 已完成 **P4 停机切换 + Node 下线**：生产 API 完全由 Python 后端承载，Node 代码已归档到 `/opt/cwfly/backups/backend-node-final-<ts>.tar.gz` 并从服务器移除。

## 一、生产拓扑

| 组件 | 位置 | 说明 |
|---|---|---|
| Python API | `/opt/cwfly/backend-py`，PM2 名称 **`cwfly-api-py`**，监听 `127.0.0.1:3001` | `uvicorn app.asgi:application --workers 2`（HTTP + Socket.IO，Redis manager 跨 worker 广播） |
| 后台任务 | PM2 名称 **`cwfly-worker-py`**（`python -m app.worker`） | 定时任务/whazzup/FSD 轮询/备份 + **热门机场天气预热**，与 API 进程隔离 |
| Redis | `127.0.0.1:6379`（CentOS `redis-5.0.3`，systemd 自启） | Socket.IO 多 worker 广播 + 天气共享缓存（`cwfly:weather:*`） |
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

## 七、Node 下线记录（2026-10-31）

| 项 | 处理 |
|---|---|
| PM2 | `pm2 delete cwfly-api`（已 `pm2 save`，重启后只拉起 `cwfly-api-py`） |
| Node 源码 | 归档 `/opt/cwfly/backups/backend-node-final-<ts>.tar.gz`（59MB，不含 node_modules）后删除 `/opt/cwfly/backend` |
| 上传文件 | 52 个文件（35MB）迁移到 `backend-py/uploads`（实体目录，抽样 sha256 校验通过） |
| 数据库备份脚本 | `scripts/db_backup.sh` 的 env 路径由 `backend/.env` 改为 `backend-py/.env`（已备份原脚本） |
| nginx | 不变（`/api` `/socket.io` `/uploads` 已指向 `:3001`） |
| 自愈脚本 | `ddos-hardening.sh` 监控 `:3001/health`、自愈 `cwfly-api-py`（已备份原脚本） |

## 八、监控与告警

- 脚本：`/opt/cwfly/cwfly-api-py-monitor.sh`，cron **每分钟**执行；
- 检查：`/health` 200、最近 90s ERROR 日志数（≥3 告警并触发自愈重启）、进程存活、日志轮转（错误日志 50MB 截断）；
- 告警：OneBot（`/opt/cwfly/bot/.env` 的 `ONEBOT_ACCESS_TOKEN` + `NOTIFY_GROUP_ID`）发 QQ 群，同一告警 10 分钟内去重；
- 测试：`MONITOR_NO_NOTIFY=1 bash /opt/cwfly/cwfly-api-py-monitor.sh`（只记日志不发送）；
- 日志：`/opt/cwfly/monitor-api-py.log`。

## 九、性能基线（单实例，4 vCPU 机器，curl/httpx 客户端并发 10）

| 端点 | Node（2 进程 cluster） | Python（1 worker） |
|---|---|---|
| `/health` | 218 req/s · p50 37ms · p95 88ms | 192 req/s · p50 40ms · p95 118ms |
| `/api/auth/check-cid` | 232 req/s · p50 32ms · p95 100ms | 205 req/s · p50 38ms · p95 114ms |
| `/api/events` | 265 req/s · p50 26ms · p95 108ms | 223 req/s · p50 33ms · p95 103ms |

> 结论：单实例 Python 约为 Node 双进程的 **80~85%** 吞吐，p95 均在 120ms 内，远高于站点实际流量；
> 如需更高并发：`uvicorn --workers 2`（需给定时任务加单实例锁，避免备份/whazzup 重复执行）。

优化记录：访问日志改为**内存缓冲 + 每秒批量落盘**（原每请求 flush 在该机器上约 7ms 磁盘开销），
并把 UA/安全头/续签头/IP 聚合/访问日志合并为单个 `GatewayMiddleware`。

## 十、性能优化记录（2026-10-31 第二轮）

### 架构
- **API 2 worker**：`uvicorn --workers 2`（4 vCPU），Socket.IO 用 `AsyncRedisManager` 保证跨 worker 房间广播一致；
- **后台任务独立进程**（`cwfly-worker-py`）：whazzup 解析、FSD 轮询、备份等不再阻塞 API 事件循环，且只跑一份；
- **nginx**：upstream `cwfly_api_pool` 连接池（keepalive 64）+ `gzip_proxied any` + `gzip_static on` + `open_file_cache`，865 个静态资源已预压缩；
- **DB**：SQLAlchemy 连接池 15+15；API 启动时预热 8 条连接（消除首请求建连）；
- **天气共享缓存**：`weather_cache`（Redis + 内存兜底），worker 每 40s 预热 10 个热门机场（TTL 180s），API 首请求直接命中；
- **FIR 边界**：API 启动时预加载（`load_fir_boundaries`），首请求 255ms → 17ms。

### 实测（白名单国内 IP，直连后端）
| 指标 | 优化前 | 优化后 |
|---|---|---|
| 首屏 12 个并发 API 第 1 轮 | **1769.8 ms** | **105.3 ms** |
| 首屏 12 个并发第 2/3 轮 | 52.4 / 45.3 ms | 85.9 / 91.4 ms |
| `/api/weather` 冷启动首个机场 | **1376 ms** | ZSPD 10.3ms / ZGGG 8.2ms（ZBAA 首个请求 82.7ms 含建连） |
| `/api/flightplans/fsd/boundaries` 首请求 | 255 ms | 17.6 ms |
| `/health` 热态 | 8.5 ms | 9.4 ms |
| 首屏静态资源传输（gzip_static） | 动态 gzip | index.js 85.9KB + css 4.7KB = **88KB** |

> 说明：Site 端到端体验还受用户到服务器的网络 RTT 影响；本次改动把「服务端冷启动/重复请求」的等待基本消除，
> 首屏数据请求由 1.7s 降到 0.1s 量级。若还慢，下一层优化点是前端资源体积（three.js/Charts 懒加载）与 CDN。

### 生产环境变量（关键）
- PM2 启动时显式注入 `NODE_ENV=production`（此前沿用 `.env` 的 development）：保证 Turnstile 在缺密钥时 fail-closed、
  邮件走真实 SMTP 发送而不是开发模式日志；
- `SOCKETIO_REDIS_URL=redis://127.0.0.1:6379/0`（API 与 worker 都要设置，天气共享缓存也依赖它）；
- CORS/Socket.IO 允许来源：`https://www.cwflysim.cn` + `https://cwflysim.cn`（裸域）+ 开发地址（仅非生产），
  修复了裸域用户 Socket.IO 被 engineio 以 `not an accepted origin` 拒绝导致的反复重连/卡顿。
