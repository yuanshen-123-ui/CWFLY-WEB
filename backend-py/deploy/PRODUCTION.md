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
- PM2 启动时显式注入 `NODE_ENV=production`（此前沿用 `.env` 的 development）：保证生产环境按生产分支逻辑运行、
  邮件走真实 SMTP 发送而不是开发模式日志；
- `SOCKETIO_REDIS_URL=redis://127.0.0.1:6379/0`（API 与 worker 都要设置，天气共享缓存也依赖它）；
- CORS/Socket.IO 允许来源：`https://www.cwflysim.cn` + `https://cwflysim.cn`（裸域）+ 开发地址（仅非生产），
  修复了裸域用户 Socket.IO 被 engineio 以 `not an accepted origin` 拒绝导致的反复重连/卡顿。

## 十一、前端首屏资源优化（2026-10-31 第三轮）

首页按时段轮换的 15 张飞机背景图原本是 **2560x1600 PNG（3.0~3.7 MB/张，合计 48.3 MB）**，
是「进页面白屏/转圈很久」的直接原因（单张 ≈ 3.8MB，跨国网络下 3~10 秒）。

| 项 | 优化前 | 优化后 |
|---|---|---|
| 单张背景图 | 3.0~3.7 MB PNG | **39~85 KB WebP**（1920x1200，质量 82） |
| 15 张合计 | 48.3 MB | **0.94 MB（51.5x）** |
| 首屏关键传输（HTML+JS+CSS+1 张背景） | ≈ 3.92 MB | **174 KB** |
| `/bg-home/` 缓存 | 无 | `Cache-Control: max-age=2592000`（30 天） |
| 旧客户端（浏览器缓存旧 JS 仍请求 .png） | 3.8MB | nginx **301 → .webp**（同样 87KB） |
| 仓库 public 体积 | 261.6 MB | 114.6 MB（删除 46 个未引用的重复 PNG） |

- 源码：`frontend/src/utils/timeBg.js` 引用改为 `.webp`；`frontend/public/bg-home/*.webp` 为压缩产物；
- 服务端：`/opt/cwfly/frontend/dist/bg-home/*.webp` + 构建产物 JS 内引用替换（`png`→`webp`）；
  原 PNG 仍保留在 dist 作为兜底（nginx 已 301 到 webp，实际不会再传大图）；
- nginx：`location /bg-home/` 30 天缓存；`location ~ ^/bg-home/xxx.png$` → 301 webp。

## 十二、隐身旁路 PoW 人机验证（2026-10-31）

| 项 | 说明 |
|---|---|
| 后端 | `app/routers/captcha.py`：`GET /api/captcha/challenge`、`POST /api/captcha/verify`、`GET /api/captcha/status`；`require_pow_token` 依赖校验 `X-PoW-Token` |
| 算法 | `sha256(challenge + nonce)` 前导 4 个十六进制 0（约 6.5 万次哈希，实测 ~0.1s） |
| 存储 | 进程内存字典 + Redis 镜像（`cwfly:pow:*`，多 worker 一致；Redis 不可用自动回退内存） |
| 防重放 | 验证前原子 pop（Redis 用 Lua GET+DEL），同一 challenge 只能使用一次 |
| 令牌 | 通过后签发 10 分钟短期 JWT（HS256，复用按天轮换签名密钥，`typ=pow`） |
| 前端 | `src/workers/pow.worker.js`（手写同步 SHA-256，无第三方、无 crypto.subtle）、`src/components/PoWCaptcha.vue`（render 返回 null，不渲染任何 DOM）、`src/utils/pow.js`（内存令牌 + 请求头注入） |
| CSP | 必须允许 `worker-src 'self' blob:;`（原先仅 `blob:` 会拦截 Worker）；已在主站/API vhost 更新 |
| 失败策略 | 全静默：网络/超时/校验失败均退避重试（3~8s 随机），令牌 8 分钟静默续算 |
| 第三方 | 不使用 Cloudflare Turnstile（2026-10-31 已删除前后端接入与 CSP 域名），不请求任何第三方验证服务 |

**已强制接入的接口（2026-10-31）**：

| 接口 | 原因 |
|---|---|
| `POST /api/verify/send` | 邮件验证码最易被刷（每条都有成本） |
| `POST /api/auth/register` | 批量注册 / 刷号 |
| `POST /api/auth/forgot-password` | 邮件轰炸、撞库辅助 |
| `POST /api/auth/reset-password` | 验证码爆破 |

`/auth/login`、`/auth/login-verify` 同样接入 PoW（Cloudflare Turnstile 已于 2026-10-31 全面下线，人机验证全部由本地 PoW 承担；邮箱验证码接口同时保留 60s 冷却与邮箱绑定校验）。
前端会在发送上述接口前**静默等待令牌最多 2.5s**（`waitForPowToken`），无任何 UI 提示；
若浏览器禁用 Worker 等极端情况拿不到令牌，后端返回 403「人机验证未通过，请刷新页面后重试」。

紧急回退：给 API 进程加环境变量 `POW_ENFORCE=0` 后重启，即可放行（不校验）。

使用方式：在需要人机验证的路由上加上依赖：

```python
from app.routers.captcha import require_pow_token

@router.post("/xxx", dependencies=[Depends(require_pow_token)])
async def some_action(): ...
```

## 十三、真人管制上下线播报（2026-10-31）

| 项 | 说明 |
|---|---|
| 播报群 | `NOTIFY_GROUP_ID=868785291`（主群）；`CONTROL_GROUP_ID=1031828415` 仅作管制指令/呼叫用途 |
| 触发 | FSD9 `controller:add` / `controller:remove`（真人管制员登录/退出） |
| 文案 | 带 emoji 的卡片：🛫 上线通知（含 CID/等级/频率/时间/ATC INFO）、🛬 下线通知（含时长） |
| 防抖 | 上线等 ATIS 最多 10s；下线延迟 2s（会话恢复可取消）；FSD 启动快照 2s 内不播 |
| 代码 | `bot/src/index.js`（`buildControllerCard` / `announceControllerOnline` / `announceControllerOffline`） |
| 信息更新 | 管制员修改**频率**或 **ATC INFO** 时额外播报「📝 管制信息更新」：仅在已播报上线且上线满 15s 后触发；2.5s 内多项变更合并为一条；同一席位 60s 内最多一条；ATIS 周期性重发相同内容不触发 |
| 可调参数 | `INFO_UPDATE_GRACE_MS`（默认 15000）、`INFO_UPDATE_MIN_INTERVAL_MS`（默认 60000） |

## 十四、JWT 有效期

- 生产 `.env`：`JWT_EXPIRES=6h`（2026-10-31 由 2h 调整为 6h）
- 活跃请求在剩余 < `JWT_REFRESH_BEFORE_SECONDS`（120s）时由中间件滑动续期（`X-Renewed-Token`）
- 前端文案（Cookie 政策 / 隐私政策）已同步为「6 小时」
