# CWFLY-WEB · 青翼模拟飞行连飞平台

CWFLY（青翼虚拟航空）的社区门户与连飞平台站点。本仓库是 2026-10-30 从主仓库拆出的**独立部署仓**，包含:

- `frontend/` —— 对外站点前端（Vue 3 + Vite 单页应用，本文档重点）
- `backend-py/` —— 配套后端（Python 3.11 + FastAPI + SQLAlchemy async + MySQL + Redis）
- `docs/` —— 前端架构、测试、运维交接文档

> 线上站点：<https://www.cwflysim.cn>（对外）。关联服务：FSD 连飞服务器 `CWFLY-FSD`、管制中心 `CWFLY-ATC`、QQ 机器人 `CWFLY-BOT`、文档站 `CWFLY-DOCS`，均为主仓库拆分出的独立仓库。

---

## 一、项目定位

面向模拟飞行玩家的**一站式连飞社区**：门户展示 + 登录后工作台 + 管理后台三层结构，覆盖以下业务域:

| 业务域 | 能力 |
|---|---|
| 门户 / 仪表盘 | 首页展示、公告、活动报名、连飞状态、个人统计、签到 |
| 在线地图 | 高德 2D + Mapbox GL 3D 地球 + three.js 飞机模型；实时机组/管制、航迹、管制边界、气象雷达、航迹回放（`/replay`） |
| 航图与机场 | 机场详情、跑道与频率、METAR/TAF 多源查询、航图 PDF 预览（pdf.js） |
| 飞行计划 | 官网提交/编辑、FSD 同步、计划锁定、呼号校验、共享链接 |
| 管制排班 | 席位排班、值班申请、交接 |
| 培训考试 | 课程、题库、在线考试、成绩记录 |
| 社区 | 知识库、通知中心、积分/成就/排行榜（论坛入口已外链至独立论坛站） |
| 申请/工单 | 管制员/职员申请、我的申请、工单中心、投诉反馈 |
| 管理后台 | 用户与权限（rating 等级 + 细分权限）、审批、内容审核、审计/登录/网络日志、系统配置、IP/设备封禁 |
| 安全 | JWT（6h，活跃滑动续签）、设备指纹、登录锁定、限流、隐身旁路 PoW 人机验证、审计留痕 |

**访问层级**：公开页（`/`、`/about`、协议页等）→ 登录后主工作台（`AppLayout`）→ 管理后台（`/admin/*`，rating ≥ 8 且按 `requiredPermission` / `requiredRating` 细分控制）。

---

## 二、技术栈与版本

版本以 `frontend/package.json` 声明为准；下表「实测」列为当前 `node_modules` 实际安装版本，便于排查。

### 运行时与框架

| 依赖 | package.json 声明 | 实测 | 用途 |
|---|---|---|---|
| Node.js | 未声明 engines；Vite 5 要求 **≥ 18**，推荐 **20 / 22 LTS** | — | 构建 / 开发运行时 |
| vue | `^3.4.0` | 3.5.40 | 视图框架 |
| vue-router | `^4.3.0` | 4.6.4 | 路由（HTML5 history 模式） |
| pinia | `^4.0.2` | 4.0.2 | 状态管理 |
| axios | `^1.7.0` | 1.18.1 | HTTP 客户端（统一拦截器） |
| socket.io-client | `^4.8.3` | 4.8.3 | 实时通道（在线人数 / 机组） |

### 业务 / 重型依赖

| 依赖 | package.json 声明 | 实测 | 加载方式 |
|---|---|---|---|
| three | `^0.185.1` | 0.185.1 | 仅在线地图页（`utils/aircraft3d.js`）使用，构建时拆为独立 vendor chunk |
| pdfjs-dist | `^6.1.200` | 6.1.200 | 仅航情查询页（`views/Charts.vue`）使用 |
| dompurify | `^3.4.12` | 3.4.12 | 富文本过滤（`utils/sanitize.js`） |
| leaflet | `^1.9.4` | 1.9.4 | **当前源码未引用**，仅保留依赖与分包规则 |
| chart.js / vue-chartjs | `^4.4.0` / `^5.3.0` | 4.5.1 / 5.3.4 | **当前源码未引用**，仅保留依赖与分包规则 |

> 高德 JSAPI 2.0 与 Mapbox GL JS **不走 npm**：页面运行时用 `<script>` 动态注入，优先加载 `public/vendor/` 下的本地副本，失败回退官方 CDN（`views/OnlineMap.vue`、`views/Replay.vue`）。

### 工程与质量

| 依赖 | 声明 | 实测 | 用途 |
|---|---|---|---|
| vite | `^5.4.0` | 5.4.21 | 开发服务器 / 构建 |
| @vitejs/plugin-vue | `^5.0.0` | — | Vue SFC 编译 |
| cross-env | `^10.1.0` | — | 跨平台设置 `NODE_OPTIONS` |
| vitest | `^2.1.9` | 2.1.9 | 单元测试（node 环境） |
| jsdom | `^25.0.1` | — | 浏览器 DOM 仿真（备用测试环境） |
| eslint | `^9.39.5` | 9.39.5 | 代码检查（flat config） |
| eslint-plugin-vue | `^9.33.0` | — | Vue 规则（`flat/essential`） |

### 后端（`backend-py/`，仅供联调参考）

Python 3.11 · FastAPI · SQLAlchemy 2.0 async + asyncmy · MySQL/MariaDB · Redis · Alembic（baseline 冻结）· PM2 + Nginx 部署。详见 [`backend-py/README.md`](backend-py/README.md) 与 [`backend-py/deploy/PRODUCTION.md`](backend-py/deploy/PRODUCTION.md)。

---

## 三、目录结构

```
CWFLY-WEB/                          # 仓库根
├── frontend/                       # 前端（Vue 3 + Vite），本文档主体
│   ├── index.html                  # 入口：首屏主题预置脚本 + #app 挂载点
│   ├── package.json                # 依赖与 scripts；锁文件 package-lock.json
│   ├── vite.config.js              # 路径别名 @、开发代理、manualChunks 分包
│   ├── eslint.config.js            # ESLint 9 flat config
│   ├── vitest.config.js            # Vitest 单测配置（node 环境）
│   ├── .env.example                # 构建期环境变量模板
│   ├── install_panel.sh            # 第三方宝塔面板安装脚本（运维遗留，非构建链）
│   ├── public/                     # 原样拷贝的静态资源（不经打包）
│   │   ├── bg-home/                # 15 张按时段轮换的首页背景（WebP）
│   │   ├── models/aircraft/        # three.js 用的 .glb 飞机模型
│   │   ├── airports/               # 机场 / 地面数据静态 JSON
│   │   ├── aircraft-icons/         # 飞机图标
│   │   ├── vendor/                 # mapbox-gl/、pdfjs/ 本地副本（CDN 兜底）
│   │   ├── logo/ · fonts/ · favicon.svg · logo.jpg
│   └── src/
│       ├── main.js                 # 应用入口：插件、全局组件/指令、会话检查
│       ├── App.vue                 # 根组件：时段背景、全局横幅、socket 监听
│       ├── router/index.js         # 路由表 + 登录/权限守卫 + 标题兜底
│       ├── api/index.js            # axios 实例（拦截器）+ 各业务 API 封装
│       ├── store/                  # Pinia：user / onlineUsers / mapSettings / notification
│       ├── utils/                  # 工具层：jwt、socket、theme、nav、prefetch、pow…
│       ├── composables/            # 组合式逻辑：useAppNav、useOnlineMapData/Interaction、useAirportEditor…
│       ├── workers/pow.worker.js   # PoW 求解 Web Worker（手写 SHA-256）
│       ├── components/             # 通用组件、表单控件、布局、门户组件
│       │   ├── layout/             # AppLayout / TopBar / SidebarNav（登录后布局）
│       │   ├── portal/             # PortalLayout / PortalNavbar（门户布局）
│       │   ├── base/               # 基础组件：Icon / EmptyState / Skeleton / AppModal / UserAvatar / UserTag
│       │   ├── map/                # 地图子组件与 mapCore.js（在线地图拆分产物）
│       │   └── *.vue               # FormField/SelectMenu/DatePicker/ToastBanner/FloatingButton…
│       ├── views/                  # 页面（按业务域分子目录）
│       ├── assets/global.css       # 全局样式聚合入口（@import ../styles/*.css）
│       └── styles/                 # 样式分层：tokens/base/dark/mobile/forms/a11y/overlays/liquid/motion
├── backend-py/                     # Python/FastAPI 后端（Node 后端已于 2026-10-31 下线归档）
│   ├── app/                        # 入口、路由、服务、中间件、socket、定时任务
│   ├── alembic/ · data/ · scripts/ · deploy/
│   └── .env.example                # 后端环境变量模板
├── docs/                           # 文档：ARCHITECTURE / TESTING / 交接文档
├── .github/                        # CI（frontend：install → test → lint → build）
├── CONTRIBUTING.md                 # 贡献指南（提交 / 分支 / PR / 代码约定）
├── CHANGELOG.md                    # 变更日志
├── CLA.md                          # 贡献者许可协议（PR 即视为同意）
└── LICENSE                         # GPL-3.0
```

### 前端 `src/views/` 子目录

| 目录 | 页面 |
|---|---|
| 根级 | `Dashboard`、`OnlineMap`、`FlightPlan`、`NetworkFlight`、`Charts`、`Replay`、`Events`、`CheckIn`、`Profile`、`Feedback`、`Tickets`、`ApplyController`、`ApplyStaff`、`StaffDisplay`、`Weather` |
| `auth/` | `Login`、`Register`、`ForgotPassword`、`OAuthAuthorize` |
| `portal/` | 门户首页、关于我们、会议记录、职员公示、Cookie 政策、隐私政策、用户协议 |
| `admin/` | 用户 / 权限 / 审批 / 公告 / 活动 / 工单 / 计划 / 日志 / 系统配置等后台页 |
| `airport/` · `flight/` · `training/` · `schedule/` · `forum/` · `knowledge/` · `points/` · `notifications/` · `applications/` · `registrations/` · `search/` · `review/` | 对应业务域页面 |
| `err/` · `banned/` | 账号封禁、地区 / 网络受限页 |

---

## 四、本地开发

### 0. 环境要求

- **Node.js ≥ 18**（推荐 20 / 22 LTS）与 npm（随 Node 提供）
- 需要真实接口时，另起后端（`backend-py/`，见 [`backend-py/README.md`](backend-py/README.md)）
- `bg-home/*.webp`、`models/*.glb` 走 Git LFS，克隆前请先执行 `git lfs install`

### 1. 安装依赖

```bash
cd frontend
npm ci            # 严格按 package-lock.json 安装（推荐，CI 同款）
# 或需要增删依赖时：npm install
```

### 2. 启动开发服务器

```bash
cd frontend
npm run dev       # 实际执行：cross-env NODE_OPTIONS=--max-old-space-size=4096 vite
```

- 访问 <http://localhost:5173>
- 开发脚本已把 Node 堆上限提到 **4 GB**（大型地图页编译需要）；低内存机器仍 OOM 时，可自行提高：
  - bash / zsh：`NODE_OPTIONS=--max-old-space-size=8192 npm run dev`
  - Windows PowerShell：`$env:NODE_OPTIONS="--max-old-space-size=8192"; npm run dev`
- `vite.config.js` 中的开发代理（**目标端口为 3000**）：

  | 前缀 | 目标 | 说明 |
  |---|---|---|
  | `/api` | `http://localhost:3000` | 所有后端接口 |
  | `/uploads` | `http://localhost:3000` | 头像 / 海报 / 会议资料等上传文件 |
  | `/socket.io` | `http://localhost:3000`（`ws: true`） | Socket.IO 实时通道，WebSocket 升级必需 |

> ⚠️ **已知端口差异**：`backend-py/.env.example` 默认 `PORT=3001`，而前端代理默认指向 `3000`（Node 后端时代的遗留值）。纯改样式 / 路由不需要后端；需要联调时二选一：
> 1. 让 Python 后端监听 3000：在 `backend-py` 下以 `PORT=3000` 启动，或直接改 `.env` 的 `PORT`；
> 2. 或临时把 `vite.config.js` 的代理目标改为 `http://localhost:3001`（**属配置改动，提交前请与维护者确认**）。

### 3. 生产构建本地预览

```bash
cd frontend
npm run build     # vite build → frontend/dist/
npm run preview   # vite preview，默认 http://localhost:4173
```

> 项目是纯 JavaScript（无 `vue-tsc` / TypeScript），`npm run build` 不做类型检查；构建失败会以非 0 退出码报错。

---

## 五、质量命令

```bash
cd frontend
npm run test       # 单元测试：vitest run（配置 frontend/vitest.config.js）
npm run test:watch # 单测 watch 模式（本地开发用）
npm run lint       # 代码检查：eslint src/utils src/composables src/components --max-warnings=0
npm run build      # 构建兜底：能产出 dist/ 才算可交付
```

- **lint 覆盖范围**：仅 `src/utils`、`src/composables`、`src/components` 三个目录，且要求 **0 error / 0 warning**（`--max-warnings=0`）。规则基线为 ESLint recommended + `eslint-plugin-vue` 的 `flat/essential` + 一批「只查正确性、不查排版」的规则（`no-unused-vars`/`prefer-const`/`no-var`/`vue/no-mutating-props` 等，详见 `frontend/eslint.config.js`）；对重构期**机械迁移的历史文件**（地图 composables、`mapCore.js`、`TopBar.vue`、`aircraft3d.js`）有定向 `TODO(lint-freeze)` 豁免，**新代码不在豁免范围**。`src/views`、`src/router`、`src/api`、`src/store` **当前不在 lint 范围**，改动这些目录时请自行保证风格一致。
- **测试覆盖范围**：当前只有 `src/utils/__tests__/` 下的工具函数单测（node 环境，9 个文件 / 153 个用例）。页面 / 组件 / 路由均无自动化测试，现状、缺口与补测计划见 [`docs/TESTING.md`](docs/TESTING.md)。
- CI：`.github/workflows/frontend-ci.yml` 在 `frontend/` 变更的 push / PR 上执行 `npm ci → npm run test → npm run lint → npx vite build`（Node 20 / 22 矩阵）。

---

## 六、环境变量

前端只使用 **Vite 构建期注入** 的环境变量（源码中以 `import.meta.env.VITE_*` 读取）。模板见 `frontend/.env.example`：

```bash
# CWFLY 前端构建期环境变量（Vite）
# 复制为 frontend/.env.production 或 .env.local 后填入；不要提交真实值
VITE_MAPBOX_TOKEN=
VITE_OWM_KEY=
```

| 变量 | 是否必需 | 作用 | 缺失时表现 |
|---|---|---|---|
| `VITE_MAPBOX_TOKEN` | 使用 3D 地图时必需 | Mapbox GL JS 访问令牌（`views/OnlineMap.vue`：3D 地球、Mapbox 卫星底图） | 3D 地球 / Mapbox 卫星底图不可用，需切到高德 2D 底图 |
| `VITE_OWM_KEY` | 可选 | OpenWeatherMap Key（在线地图「气象雷达」降水图层） | 雷达图层加载失败，其余地图功能正常 |

使用方式：

```bash
cd frontend
cp .env.example .env.local     # 本地开发
# 或 .env.production            # 生产构建（不要提交）
# 编辑填入真实值后：重启 dev / 重新 build
```

注意事项：

- `.env`、`.env.*` 已被 `.gitignore` 忽略，仓库只提交 `.env.example`。
- **高德 JSAPI 的 Key / 安全密钥目前硬编码在源码**（`src/components/map/mapCore.js`、`src/views/Replay.vue` 顶部常量），不在 `.env` 中；修改时需同步在[高德控制台](https://console.amap.com/)配置域名白名单，否则线上会报 `INVALID_USER_SCODE`。
- 部署后修改环境变量必须**重新构建**（Vite 在构建期把值写死进产物），只重启服务无效。

### 后端环境变量（概要）

`backend-py/.env`（复制 `.env.example`），关键项：`DATABASE_URL`、`JWT_SECRET`、`JWT_EXPIRES=6h`、`CORS_ORIGIN`、`SMTP_*`、`OPENAPI_KEY`、`FSD_WHAZZUP_FILE`、`SOCKETIO_REDIS_URL`（生产）、`POW_ENFORCE`（PoW 紧急开关）。完整字段与生产配置见后端 `.env.example` 与 [`backend-py/deploy/PRODUCTION.md`](backend-py/deploy/PRODUCTION.md)。

---

## 七、构建与部署

### 构建

```bash
cd frontend
npm ci
npm run build
# 产物：frontend/dist/
#   index.html + assets/*.js|css（带 hash，可长期缓存）
#   public/ 下的静态资源原样拷贝（bg-home/、models/、vendor/、airports/…）
```

构建特性（`vite.config.js`）：

- 路径别名 `@` → `src/`
- `chunkSizeWarningLimit: 600`；重型依赖按 `manualChunks` 拆分为独立 vendor chunk：`three`、`leaflet`、`charts`（chart.js + vue-chartjs）、`pdfjs`、`socketio`；未命中的依赖交给 Rollup 默认分包
- 所有页面路由均为 `() => import(...)` 动态导入，天然按路由懒加载

### 部署（沿用现有流程：构建产物直传，Nginx 静态直出）

生产拓扑（细节见 [`docs/交接文档.md`](docs/交接文档.md)）：`dist/` 上传到服务器 `/opt/cwfly/frontend/dist`，Nginx **直接静态返回**（不经过后端进程），`/api`、`/socket.io`、`/uploads` 反代到本机后端。

```bash
# 1) 本地构建
cd frontend && npm ci && npm run build

# 2) 打包并上传（<server> 为服务器地址，按运维登记填写；不要写进仓库）
cd frontend && tar -czf /tmp/cwfly-frontend-dist.tgz -C dist .
scp /tmp/cwfly-frontend-dist.tgz root@<server>:/tmp/

# 3) 服务器上：先备份旧 dist，再增量覆盖（保留旧的 hashed 资源，避免在线用户 404）
ssh root@<server> '
  cd /opt/cwfly/frontend &&
  cp -a dist "dist.bak-$(date +%Y%m%d-%H%M%S)" &&
  tar -xzf /tmp/cwfly-frontend-dist.tgz -C dist &&
  nginx -t && nginx -s reload
'

# 4) 验证
curl -sI https://www.cwflysim.cn/ | head -n 3
```

**部署纪律（务必遵守）**：

1. `dist/` 采用**增量覆盖**，不要 `rm -rf dist`：新 `index.html` 引用带 hash 的新资源，但**正在浏览的旧页面**仍会请求旧 hash 文件，全量删除会造成 404 / 白屏。
2. 前端发布**不需要重启后端**，也不要动 PM2 进程；后端变更只操作 `cwfly-api-py` 单进程（`pm2 restart cwfly-api-py`），**禁止 `pm2 restart all`**（会让所有在线连飞用户掉线）。
3. `dist/` 下静态资源有 Nginx 长缓存（如 `bg-home/` 30 天），替换图片请换文件名，不要原地覆盖。
4. `nginx -t` 通过后再 `reload`；改配置前先备份。

**回滚**：前端回滚 = 把上一步的备份恢复成 `dist`：

```bash
ssh root@<server> '
  cd /opt/cwfly/frontend &&
  mv dist "dist.failed-$(date +%Y%m%d-%H%M%S)" &&
  mv dist.bak-<时间戳> dist &&
  nginx -s reload
'
```

> 后端发布 / 回滚脚本见 [`backend-py/deploy/deploy.sh`](backend-py/deploy/deploy.sh)（`bash deploy.sh` 更新、`bash deploy.sh --rollback` 回滚），完整手册见 [`backend-py/deploy/PRODUCTION.md`](backend-py/deploy/PRODUCTION.md)。

---

## 八、常见问题（FAQ）

**Q1：发布后用户白屏 / 控制台大量 404？**
A：典型原因是 `dist/` 被整体替换，旧 `index.html` 引用的旧 hash 资源已删除。按「增量覆盖 + 保留旧 hashed 资源」重新发布；已白屏的用户强刷（Ctrl/Cmd+Shift+R）即可恢复。

**Q2：本地 `npm run dev` 起来了，但接口全 404 / 登录不了？**
A：代理目标默认是 `localhost:3000`，而 Python 后端默认 3001（见第四节「已知端口差异」）。确认后端已启动、端口与代理一致，再看浏览器 Network 面板的具体状态码。

**Q3：在线地图空白 / 只有一半功能？**
A：看控制台：3D 相关报错 → `VITE_MAPBOX_TOKEN` 缺失或过期；高德相关报错（`INVALID_USER_SCODE`）→ 高德 Key 未配置域名白名单；雷达图层失败 → `VITE_OWM_KEY` 缺失。3D 不可用时切到高德 2D 底图仍可正常使用。

**Q4：登录后一会儿就被踢回登录页？**
A：会话机制是「JWT 6 小时 + 前端活跃窗口 7 天 + 临期静默续签」。超过 7 天没有任何活跃（无点击 / 键盘 / 滚动，也没回到页面）会强制重新登录；token 已过期且续签失败也会退出。排查：Network 里 `/api/auth/refresh` 是否 200、`localStorage.cw_last_active` 是否为近期时间、服务器时间是否准确（JWT 对时间敏感）。

**Q5：`npm ci` 很慢或卡在下载？**
A：默认 npm 源在国内可能很慢，可临时换镜像：`npm ci --registry=https://registry.npmmirror.com`。`npm ci` 需要可用的 `package-lock.json`（本仓库已提交）。

**Q6：`npm run dev` 报 JavaScript heap out of memory？**
A：脚本本身已设 4 GB（`--max-old-space-size=4096`）；仍 OOM 时按第四节提高上限，并关闭其它大型编辑器插件。

**Q7：为什么 `public/` 里有一堆大文件（`bg-home/`、`models/`、`vendor/`）？**
A：它们是**运行期按需加载**的静态资源：背景图 WebP 化后 15 张合计约 0.94 MB；`models/*.glb` 仅在在线地图按机型懒加载；`vendor/` 是 Mapbox GL / pdf.js 的本地副本，避免依赖外网 CDN。`bg-home` 与 `*.glb` 走 Git LFS（见 `.gitattributes`）。

**Q8：能直接改 `src/views/*.vue` 里的样式吗？**
A：页面内 `scoped` 样式可以；**全局样式改 `src/styles/*.css` 分层文件**（`assets/global.css` 只是聚合入口），不要往 `global.css` 里堆业务样式。表单控件请复用 `components/` 下已全局注册的组件，不要新写原生 `<select>` / `<input type="date">`。

**Q9：`frontend/install_panel.sh` 是什么？需要执行吗？**
A：第三方宝塔面板安装脚本（运维遗留物），**与前端构建无关**，不要执行、不要修改。

**Q10：提交 PR 需要签什么？**
A：本仓库采用 GPL-3.0 开源 + CLA 模式：提交 PR 即视为同意 [`CLA.md`](CLA.md)（你保留自己贡献的版权，同时授予项目方再许可能力）。提交前请阅读 [`CONTRIBUTING.md`](CONTRIBUTING.md)。

---

## 九、相关文档

| 文档 | 内容 |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 前端架构：入口、路由守卫、布局与导航、状态与 localStorage、工具层、表单系统、实时 socket、重型依赖懒加载、关键文件索引 |
| [`docs/TESTING.md`](docs/TESTING.md) | 单测 / lint / 构建怎么跑、当前覆盖范围、补测计划 |
| [`docs/交接文档.md`](docs/交接文档.md) | 接手须知：服务器角色、Nginx、发布 / 回滚、数据库 / Redis、已知限制与排查命令 |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | 分支策略、提交规范、PR 检查清单、组件 / 样式约定、新增页面步骤 |
| [`CHANGELOG.md`](CHANGELOG.md) | 按日期归档的变更记录 |
| [`frontend/docs/performance.md`](frontend/docs/performance.md) | 前端性能优化记录（分包 / 首屏 chunk 体积对比） |
| [`backend-py/README.md`](backend-py/README.md) · [`backend-py/deploy/PRODUCTION.md`](backend-py/deploy/PRODUCTION.md) | 后端说明与生产运维手册 |

---

## 十、许可与致谢

- 代码以 **GNU General Public License v3.0（GPL-3.0）** 开源，完整条款见 [`LICENSE`](LICENSE)；修改后分发必须同样以 GPL-3.0 开源并提供源码，不提供任何担保。
- 版权归**所有著作人**（项目发起人与所有贡献者）所有。
- 贡献流程与版权约定见 [`CLA.md`](CLA.md)、[`CONTRIBUTING.md`](CONTRIBUTING.md)。

© CWFLY 模拟飞行社区 · <https://www.cwflysim.cn>
