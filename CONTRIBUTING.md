# 贡献指南（CONTRIBUTING）

感谢你愿意为 **CWFLY** 做出贡献！提交任何代码、文档或资源前，请先阅读本指南与 [CLA.md](CLA.md)。

本仓库是 `frontend/`（Vue 3 前端）+ `backend-py/`（Python/FastAPI 后端）的独立部署仓。**本指南的约定以前端为主**，后端相关约定见 [`backend-py/README.md`](backend-py/README.md)。

---

## 一、基本流程

1. **先开 Issue 讨论**：新功能 / 较大改动请先开 Issue 说明背景与方案，避免重复劳动。
2. **Fork → 分支**：从 `main` 拉出功能分支（分支策略见第二节），不要在 `main` 上直接堆积大改动。
3. **小步提交**：一次提交只做一件事，提交信息遵循 `type(scope): 摘要`（见第三节）。
4. **自测通过**：本地跑完第四节「PR 检查清单」里的命令与人工检查项。
5. **提交 PR**：描述问题、改动点、验证方式（截图 / 日志更佳），并在 PR 描述中写明：
   `I have read the CLA and agree to it.`

### 一次标准的前端开发循环

```bash
cd frontend
npm ci                # 首次 / 依赖变更后
npm run dev           # 开发（http://localhost:5173）
npm run test          # 单测（改到 src/utils/ 时必跑）
npm run lint          # lint（改到 utils / composables / components 时必跑）
npm run build         # 提交 PR 前必须能构建通过
```

---

## 二、分支策略

| 分支 | 用途 | 说明 |
|---|---|---|
| `main` | 唯一长期分支，永远保持**可构建、可发布** | 生产发布以 `main` 的构建产物为准 |
| `feat/<简短描述>` | 新功能 | 例：`feat/nav-topbar` |
| `fix/<简短描述>` | 缺陷修复 | 例：`fix/login-banner` |
| `docs/<简短描述>` | 文档 | 例：`docs/architecture` |
| `refactor/<简短描述>` | 不改变行为的重构 | 例：`refactor/onlinemap` |
| `perf/<简短描述>` | 性能优化 | 例：`perf/manual-chunks` |
| `chore/<简短描述>` | 工程杂项（依赖、脚本） | 例：`chore/eslint-9` |

- 分支名用小写 kebab-case，避免中文与空格。
- 合并前先 `git fetch origin && git rebase origin/main`（或 merge），保证线性、无冲突。
- 紧急线上修复：可从 `main` 拉 `hotfix/<描述>`，修复后尽快合回。
- **禁止** force push 到 `main`；**禁止**提交 `dist/`、`node_modules/`、`.env` 等被忽略文件。

---

## 三、提交信息规范

格式：

```
type(scope): 摘要
```

- `type` 必填、小写；`scope` 可选，用名词标识影响面；`摘要` 一句话说清「做了什么」，中文或英文均可，不加句号。
- 一次提交只做一类改动；格式化 / 重命名请单独提交。

### type 取值

| type | 含义 |
|---|---|
| `feat` | 新功能 |
| `fix` | 缺陷修复 |
| `docs` | 文档 |
| `style` | 仅样式 / 格式（不改变逻辑） |
| `refactor` | 重构（不改变外部行为） |
| `perf` | 性能优化 |
| `test` | 测试 |
| `build` | 构建 / 依赖 / 打包配置 |
| `ci` | CI 配置 |
| `chore` | 其它杂项 |
| `revert` | 回滚某次提交 |

### scope 建议

| 范围 | scope 示例 |
|---|---|
| 页面 / 业务域 | `nav`、`form`、`auth`、`map`、`admin`、`portal`、`flightplan`、`training`、`forum`、`points` |
| 技术层次 | `router`、`store`、`api`、`utils`、`styles`、`socket`、`perf` |
| 工程 | `deps`、`build`、`ci`、`deploy`、`docs` |
| 端 | `frontend`、`backend-py`、`backend` |

### 示例

```
feat(nav): 顶栏布局支持三段式切换
fix(auth): 验证码发送按钮重复点击导致 429
perf(map): 在线地图按路由懒加载 three.js 与飞机模型
refactor(layout): 拆分 AppLayout 为 Sidebar/TopBar 子组件
docs(readme): 补充本地开发端口说明
build(deps): 升级 vite 到 5.4.x
chore: 删除未引用的旧背景图
```

### 破坏性变更

不兼容变更在 type/scope 后加 `!`，并在 body 里写 `BREAKING CHANGE:` 说明影响与迁移方式：

```
feat(api)!: 统一接口响应为 { code, message, data }

BREAKING CHANGE: 旧版直接返回数据体的接口全部改为包裹结构，调用方需读取 res.data.data。
```

### 提交信息反例

- `update`、`fix bug`、`改了点东西` —— 没有类型与影响面，无法检索。
- 一个提交同时改导航、表单、样式、依赖 —— 无法 review、无法二分定位。
- 提交里夹带 `.env`、服务器地址、密钥 —— 直接拒绝。

---

## 四、PR 检查清单

提交 PR 前逐项勾选（建议直接复制到 PR 描述里）：

```markdown
## 自检清单
- [ ] 已开 Issue / 已关联 Issue：#___
- [ ] 分支基于最新 main，无冲突
- [ ] `cd frontend && npm ci` 可正常安装（如动了依赖）
- [ ] `cd frontend && npm run test` 通过
- [ ] `cd frontend && npm run lint` 通过（至少不新增报错）
- [ ] `cd frontend && npm run build` 构建通过
- [ ] 本地 `npm run dev` 手动点过改动路径，控制台无新增报错/警告
- [ ] UI 改动附**改动前后截图**（桌面 + <860px 移动端）
- [ ] 深色 / 浅色主题都验证过（涉及颜色/背景时）
- [ ] 动效相关改动验证了 `prefers-reduced-motion` 降级
- [ ] 未提交 `.env` / 服务器地址 / 密钥 / 账号口令
- [ ] 行为变更已同步更新文档（README / docs / CHANGELOG）
- [ ] 我同意 [CLA.md](CLA.md)：`I have read the CLA and agree to it.`
```

### 人工检查重点（自动化覆盖不到）

1. **导航与权限**：新页面是否在 `utils/nav.js` 注册、未授权用户是否被路由守卫正确拦回 `/dashboard`。
2. **移动端**：视口宽度 < 860px 时侧边栏切为抽屉、顶部栏布局回退、表单不横向溢出。
3. **主题**：`data-theme="dark"` 下新增颜色是否走 CSS 变量而不是写死色值。
4. **会话**：受保护页面刷新、切后台再回来、token 临期时是否表现正常（见 `main.js` 的会话检查逻辑）。
5. **地图页**：修改 `OnlineMap.vue` / `aircraft3d.js` 必须验证 2D 高德与 3D Mapbox 两种引擎、无 WebGL 报错、离开页面后定时器与图层销毁（无内存泄漏）。
6. **本地存储**：新增 `localStorage` 键必须使用 `cw_` 前缀，并同步登记到 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) 的键位表。

---

## 五、代码风格

项目为 **JavaScript（非 TypeScript）**，ESLint 9 flat config（`frontend/eslint.config.js`）。

### 通用约定（与现有代码保持一致）

- 缩进 **2 空格**；字符串用**单引号**；**不写行尾分号**；对象/数组尾逗号不强制。
- Vue 组件统一 `<script setup>` + 组合式 API；逻辑复杂的页面可拆 `composables/`（命名 `useXxx.js`）。
- 注释用中文，解释「为什么」而不是「是什么」；工具函数写 JSDoc（参数、返回值、调用时机）。
- 错误处理：业务请求错误由 `api/index.js` 响应拦截器统一弹红色横幅，页面内只处理**需要定制提示**的分支；静默失败（如预取、埋点）必须写 `catch {}` 并注明原因。
- 禁止 `console.log` 留在提交里（调试用 `console.warn/error` 也需有明确用途）；禁止 `debugger`。
- 禁止把密钥、内网 IP、账号口令写进源码；环境变量只放 `.env.local` / `.env.production`（模板见 `frontend/.env.example`）。
- 依赖变更必须同步 `package.json` 与 `package-lock.json`（用 `npm install <pkg>` 而非手改锁文件）。

### 目录归属

| 位置 | 放什么 |
|---|---|
| `src/views/<域>/` | 页面级组件（一个路由一个文件）；只在页面内复用的子组件放同目录 |
| `src/components/` | 跨页面复用的通用组件、表单控件 |
| `src/components/layout/` | 登录后布局（`AppLayout` 及后续拆出的 Sidebar/TopBar 等） |
| `src/components/portal/` | 门户（未登录首页）布局 |
| `src/components/base/` | 无业务语义的基础组件（图标、空态、骨架、弹窗、头像、标签） |
| `src/composables/` | 组合式函数（`use` 前缀，返回响应式状态/方法） |
| `src/utils/` | 与框架无关的工具函数（纯逻辑优先，便于单测） |
| `src/store/` | Pinia store（`useXxxStore`） |
| `src/api/index.js` | 所有后端接口封装（按模块导出对象） |
| `src/styles/` | 全局样式分层（tokens/base/dark/mobile/forms/a11y/overlays/liquid） |

---

## 六、组件与样式约定

### 组件命名

- 文件与组件名统一 **PascalCase**：`FormField.vue`、`OnlineMap.vue`、`SidebarNav.vue`。
- 业务页面用业务名；管理后台页面沿用现有命名（如 `Users.vue`、`EventsManage.vue`），不强制 `Admin` 前缀。
- 基础组件语义化：`EmptyState` / `Skeleton` / `AppModal` / `UserAvatar` / `UserTag` / `Icon`。
- 组合式函数 `useXxx.js`；工具函数 `camelCase`；常量全大写 `UPPER_SNAKE_CASE`。

### 表单控件（已全局注册，直接用）

`main.js` 已全局注册，无需 import：

| 组件 | 用途 | 关键 props |
|---|---|---|
| `<FormField>` | 字段容器：label、必填标记、帮助文字、可滑入错误提示 | `label` `required` `optional` `hint` `error` `shake` `forId` |
| `<SelectMenu>` | 下拉选择（替代原生 `<select>`，Teleport 面板） | `v-model` `options[{value,label,hint}]` `placeholder` `disabled` |
| `<DatePicker>` | 日期 / 日期时间（替代原生 date input） | `v-model`（`YYYY-MM-DD` / `YYYY-MM-DDTHH:mm`）`withTime` |
| `<CheckBox>` | 复选框 / iOS 开关 | `v-model`（布尔或数组）`value` `label` `variant="check|switch"` |
| `<SubmitButton>` | 带状态机提交按钮 | `status="idle|loading|success|error"` `label` |
| `<ToastBanner>` / `<ActionBanner>` | 全局红色横幅 / 右侧滑入动作条 | 由 `utils/banner.js`、`utils/bannerAction.js` 驱动 |
| `<PoWCaptcha>` | 隐身人机验证（无 DOM） | 无需 props，挂在 `App.vue` |

表单校验反馈用 `utils/fieldFeedback.js`：

```js
const fb = useFieldFeedback(['cid', 'password'])
fb.fail('password', '密码不能为空')   // 红边 + 摇晃 + 提示滑入
fb.input('password')                  // 用户输入时自动收起
// 模板：<FormField :error="fb.errors.password" :shake="fb.shaking.password">
```

### 样式约定

- **全局样式只改 `src/styles/*.css` 分层文件**；`assets/global.css` 仅保留 `@import` 聚合与少量公共类（`.card` / `.btn` / `.input` / `.table` / 工具类）。
- 颜色、圆角、阴影、毛玻璃参数一律用 **CSS 变量**（`--c-primary`、`--glass-bg`、`--glass-blur` 等，见 `src/styles/tokens.css`），禁止在新代码里写死十六进制色值（图表/地图等第三方实例参数除外）。
- 深色主题通过 `html[data-theme='dark']` 覆盖变量实现（`src/styles/dark.css`）；不要在组件里手写深浅两套 CSS。
- 组件样式用 `<style scoped>`；需要穿透子组件用 `:deep()`；Teleport 到 body 的面板样式必须写在**非 scoped** 的 `<style>` 里（参考 `SelectMenu.vue`）。
- 移动端断点统一 **`max-width: 860px`**（与 `utils/navLayout.js` 的 `NARROW_MAX_WIDTH` 一致）。
- 所有动画/过渡需考虑 `prefers-reduced-motion: reduce` 降级（全局在 `styles/a11y.css`，组件内自绘动画自行兜底）。
- 视觉语言：浅色玻璃拟态（Liquid Glass）——半透明背景 + `backdrop-filter: blur()` + 细描边 + 柔和阴影；新增面板请沿用现有卡片/表单的视觉密度，避免自造第三套风格。

---

## 七、新增页面步骤

以新增「飞行日志」页面 `/flight-log` 为例：

1. **建页面**：`src/views/flight/FlightLog.vue`（`<script setup>`，页面级数据加载自己负责）。
2. **注册路由**（`src/router/index.js`）：
   - 在「主应用」`AppLayout` 的 `children` 里加懒加载路由：
     ```js
     { path: 'flight-log', name: 'FlightLog', meta: { title: '飞行日志' }, component: () => import('@/views/flight/FlightLog.vue') }
     ```
   - 管理后台页面加到 `/admin` 分支，并按需加权限 meta：`requiredPermission: 'xxx'`、`requiredRating: 12`。
   - 若是**未登录可访问**的页面，必须把路径加入 `router.beforeEach` 里的 `publicPages` 数组，否则会被守卫重定向到 `/login`。
   - 404 兜底：路由不存在时守卫会自动回 `/dashboard` 或 `/login`，无需自建 404。
3. **注册导航**（`src/utils/nav.js`）：在对应 `navGroups[].items` 或 `singleNavItems` / `accountNavItems` 增加 `{ path, label, desc, icon }`；管理后台项加 `requiredPermission`（与路由 meta 一致），仅管理员可见的分组加 `adminOnly: true`。
4. **补后端接口封装**（`src/api/index.js`）：新增模块对象（如 `flightLogApi.list()`），不要在页面里直接写 `axios`。
5. **页面实现**：
   - 表单用全局注册控件 + `useFieldFeedback`；
   - 列表空态/加载态优先用 `EmptyState` / `Skeleton`（若已存在）；
   - 需要排序的 `<table v-sort>`；需要危险操作二次确认用 `utils/confirm.js` 的 `confirmDialog`；
   - 富文本渲染必须走 `utils/sanitize.js`（`sanitizeHtml` / `renderText`），禁止 `v-html` 直接渲染后端原文。
6. **同步文档**：更新 [`README.md`](README.md) 的目录结构说明、[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) 关键文件索引、[`CHANGELOG.md`](CHANGELOG.md)。
7. **自测**：桌面 + 移动端 + 深色主题；直接访问 URL（刷新）是否 404；未登录访问是否被拦；控制台无报错；`npm run test/lint/build` 通过。

> 若新页面只需要外链（如论坛），可在路由上用 `beforeEnter` 直接跳转外部站，不必建页面组件（参考现有 `/forum` 路由）。

---

## 八、新增 / 修改工具函数与单测

- `src/utils/` 下新增函数必须：纯逻辑、无组件依赖、写 JSDoc、在 `src/utils/__tests__/<name>.test.js` 补单测（Vitest，node 环境）。
- 单测命名：`describe('<模块名>')` + `it('<行为>')`；覆盖正常/边界/异常三类输入。
- 当前 lint 与单测**只覆盖 `src/utils`、`src/composables`、`src/components`**，改动这些目录必须保证 `npm run lint`、`npm run test` 通过；详见 [`docs/TESTING.md`](docs/TESTING.md)。

---

## 九、行为准则与版权

- 尊重所有参与者：禁止人身攻击、歧视与骚扰；技术讨论对事不对人，不同意见请给出依据与替代方案。
- 本项目以 **GPL-3.0** 开源，版权归**所有著作人**所有。
- **提交即同意 CLA**：你保留自己贡献的版权，同时授予项目发起人一份永久、全球、免费、不可撤销、可再许可（含用于闭源/商业版本）的许可，详见 [CLA.md](CLA.md)。
- 请确保你的贡献为你本人原创，或你已获得合法授权；**不要引入与 GPL-3.0 不兼容的第三方代码或资源**。
- 提交前自查：不含真实密钥、内网地址、用户隐私数据、未经授权的素材（图片/字体/模型需注明来源与许可）。
