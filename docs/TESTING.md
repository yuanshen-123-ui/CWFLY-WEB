# 测试与质量说明（TESTING）

本文说明 CWFLY 前端（`frontend/`）的单元测试、代码检查、构建验证怎么做，当前覆盖到什么程度，以及后续补测计划。

> 相关：根 [`README.md`](../README.md) 第五节（质量命令）、[`CONTRIBUTING.md`](../CONTRIBUTING.md) 第四节（PR 检查清单）、[`ARCHITECTURE.md`](ARCHITECTURE.md)（模块与文件索引）。

---

## 一、现状速览

| 项 | 现状（2026-10-31） |
|---|---|
| 单元测试框架 | Vitest 2.1.9（`frontend/vitest.config.js`） |
| 测试目录 | `frontend/src/utils/__tests__/`（仅此目录会被收集） |
| 用例规模 | **9 个文件 / 153 个用例，全部通过** |
| 测试范围 | 仅 `src/utils/` 纯逻辑工具；组件、composables、store、路由守卫、页面均无自动化测试 |
| 代码检查 | ESLint 9 flat config（`frontend/eslint.config.js`），覆盖率见第五节 |
| 构建验证 | `npm run build`（Vite 5），作为「代码可交付」的事实门槛 |
| CI | `.github/workflows/frontend-ci.yml`：Node 20/22 矩阵跑 install → test → lint → build（push / PR） |
| E2E | **未引入**（无 Playwright / Cypress），关键路径靠手工回归清单（第九节） |

---

## 二、环境准备

```bash
cd frontend
npm ci          # 严格按 package-lock.json 安装（必须，否则 vitest/eslint 可能缺失）
node -v         # Node ≥ 18，推荐 20 / 22 LTS（与 CI 一致）
```

> 常见坑：`npm ci` 需要可用的 `package-lock.json`；若刚改过依赖，本地先用 `npm install` 更新锁文件再提交。

---

## 三、单元测试（Vitest）

### 怎么跑

```bash
cd frontend
npm run test                                    # = vitest run（跑一次，CI 同款）
npm run test:watch                              # = vitest（watch 模式，本地开发）
npx vitest run src/utils/__tests__/jwt.test.js  # 只跑一个文件
npx vitest run -t "活跃窗口"                     # 只跑用例名匹配的用例
npx vitest run --reporter=verbose               # 需要逐条用例输出时
```

`npm run test` 等价于 `npx vitest run`，**非 0 退出码即失败**，适合放进 CI 与 PR 检查。

### 配置说明（`frontend/vitest.config.js`）

| 配置 | 值 | 说明 |
|---|---|---|
| `resolve.alias.@` | `./src` | 与 `vite.config.js` 一致（`prefetch.test.js` 会走到 `@/router`） |
| `test.environment` | `node` | 默认 node 环境，纯逻辑最快 |
| 需要 DOM 的用例 | 文件首行 `// @vitest-environment jsdom` | 例如 `jwt.test.js` 需要 `localStorage` / `atob`；jsdom 25 已在 devDependencies |
| `test.include` | `src/utils/__tests__/**/*.test.js` | **只收集这个目录**；新增其它目录的测试必须同步改 include |
| `clearMocks` / `unstubGlobals` / `unstubEnvs` | `true` | 每个用例自动清理 mock 与 stub，避免串测 |

> 覆盖率报告**尚未配置**（无 `@vitest/coverage-v8`）。需要时执行 `npm i -D @vitest/coverage-v8` 后 `npx vitest run --coverage`（属于依赖变更，按 CONTRIBUTING 流程提交）。

### 当前用例清单

| 测试文件 | 用例数 | 覆盖的模块 | 主要断言点 |
|---|---|---|---|
| `jwt.test.js` | 28 | `utils/jwt.js` | `decodeToken` 空值/段数/非法 base64/非法 JSON/URL-safe；`getUserFromToken`；`getTokenRemaining` 无 token/无 exp/正负剩余；`isTokenExpired` 边界；`isTokenNearExpiry` 严格小于；活跃窗口 `touchLastActive`/`getLastActive`/`isWithinActiveWindow`（恰好 7 天 / 超出 1ms） |
| `timeBg.test.js` | 23 | `utils/timeBg.js` | 北京时间分钟定位、时段边界（20:00→nt_4、05:00 起渐变）、渐变进度 0/1、`getUpcomingBg` 跨午夜、稳定段 fade=0 |
| `navLayout.test.js` | 19 | `utils/navLayout.js` | localStorage 读写与非法值回退、`topbar` 持久化、收拢开关、860px 窄屏判定、`effectiveNavLayout` 强制 sidebar |
| `tableSort.test.js` | 12 | `utils/tableSort.js` | 数值/文本（zh-CN）比较、升降序切换、空状态行跳过、初始排序 MutationObserver |
| `fieldFeedback.test.js` | 10 | `utils/fieldFeedback.js` | `fail` 置错并触发抖动（rAF 时序）、`input` 自动收起、`clearAll`、`hasError`、`firstErrorField` |
| `prefetch.test.js` | 14 | `utils/prefetch.js` | 非 `/` 开头/空值/重复预取跳过、`router.resolve` 抛错容错、无 loader 静默、`requestIdleCallback` 分支 |
| `pow.test.js` | 15 | `utils/pow.js` | 令牌存取/清空、`applyPowHeader` 只在有令牌时加头、`waitForPowToken` 超时返回空串、并发 waiter 唤醒 |
| `sanitize.test.js` | 12 | `utils/sanitize.js` | `escapeHtml` 五类字符、`renderText` 换行转换、DOMPurify 白名单（脚本/事件属性/`style` 被移除） |
| `theme.test.js` | 20 | `utils/theme.js` | 模式读写、`auto` 按北京时间 19:00–07:00 判深浅、`applyTheme` 写 `data-theme`、`scheduleApplyTheme` 延迟/取消；主题扩散 `applyThemeWithTransition`：环境探测（View Transitions / reduced-motion）、降级回退（不支持/减少动效/抛异常/finished reject）、正常播放的 CSS 变量与过渡类清理、坐标钳制与并发合并 |

> 合计：**9 个文件 / 153 个用例**（`npm run test` 实测，见第十一节验证记录）。

### 测试写作约定

- 文件名 `<模块>.test.js`，与 `src/utils/<模块>.js` 同名；`describe` 用中文模块名，`it` 描述行为。
- 先覆盖**边界与异常**（空值、非法输入、临界时间、超时），再覆盖正常路径。
- 需要 `localStorage`/DOM 时首行加 `// @vitest-environment jsdom`，并在 `beforeEach` 清空存储。
- 时间相关用例用 `vi.useFakeTimers()` / `vi.setSystemTime()`，**不要依赖真实时钟**（`timeBg` 走 `Intl` 的 `Asia/Shanghai`，与宿主机时区无关）。
- 不发起真实网络请求：`fetch`/接口调用一律 mock；**禁止**在单测里 `import '@/api'` 触发 axios 真实初始化。
- 每个用例结束确保定时器/监听器清理（`afterEach` 里 `vi.useRealTimers()`、`vi.restoreAllMocks()`）。

---

## 四、代码检查（ESLint）

### 怎么跑

```bash
cd frontend
npm run lint        # = eslint src/utils src/composables src/components --no-error-on-unmatched-pattern --max-warnings=0
npm run lint -- --fix          # 自动修可修复项（prefer-const 等）
npx eslint src/utils           # 只查某目录
npx eslint src/components/base # 只查某个新目录
```

### 覆盖范围与规则

| 项 | 内容 |
|---|---|
| 覆盖目录 | **`src/utils`、`src/composables`、`src/components`**（`package.json` 的 lint 脚本，带 `--no-error-on-unmatched-pattern --max-warnings=0`） |
| 未覆盖 | `src/views`（体量最大，历史告警多）、`src/router`、`src/api`、`src/store`、`src/workers`、`src/main.js` |
| 规则集 | ESLint `js.configs.recommended` + `eslint-plugin-vue` 的 `flat/essential` + 一批正确性规则（`no-unused-vars`(error) / `no-var` / `prefer-const` / `eqeqeq` / `no-duplicate-imports` / `vue/no-mutating-props` / `vue/require-prop-types` / `vue/no-use-v-if-with-v-for` 等）；**不启用排版类规则**（max-attributes-per-line / html-indent 等），格式交给编辑器 |
| 放宽项 | `vue/multi-word-component-names: off`；`no-unused-vars` 允许 `_` 前缀占位、忽略 catch 变量 |
| 存量豁免 | 按文件精确 override + `TODO(lint-freeze)` 注释：`composables/useAirport*.js`、`useOnlineMap*.js`（机械迁移的历史逻辑，声明 `AMap`/`mapboxgl` 全局）、`components/map/mapCore.js`、`components/layout/TopBar.vue`、`utils/aircraft3d.js`。**新代码不在豁免范围**，豁免清单由 Lead 在重构冻结后决定是否清理 |
| 忽略 | `dist/**`、`node_modules/**`、`coverage/**`、`.tmp-build-a/**`、`public/**`、`*.min.js` |

> 为什么不扩到全仓：`views/` 下历史代码存在大量 `no-empty`、未使用变量、浏览器全局（`AMap`、`mapboxgl`）等问题，一次性打开会淹没真实告警。计划见第七节 P1。

### 常见告警与处理

| 告警 | 处理 |
|---|---|
| `no-unused-vars`（error） | 删除变量；确需保留（如仅用于触发）改名为 `_xxx` 并在注释说明 |
| `no-empty` | 空 `catch {}` 是**有意静默**的，可在 catch 内写注释说明原因（本项目已对机械迁移的地图 composables 定向豁免，新代码请写注释而不是空块） |
| `no-undef`（`AMap` / `mapboxgl` / 第三方全局） | 优先改为显式 `window.AMap`；或在 `eslint.config.js` 的 `languageOptions.globals` 中登记（新增全局必须说明来源） |
| `prefer-const` / `no-var` | 直接 `--fix` |
| `vue/*` 规则 | 按提示修正模板；不要通过全局关闭规则绕过 |

> 禁止用 `/* eslint-disable */` 整文件关闭；确需关闭必须 `// eslint-disable-next-line <rule> -- 原因` 单行豁免并写明理由。

---

## 五、构建验证（`npm run build`）

```bash
cd frontend
npm run build        # vite build → dist/
ls dist/assets | head -n 5
```

- 构建成功是「可交付」的最低门槛：**任何 PR 必须保证 build 通过**（纯 JS 项目没有类型检查，构建错误多来自导入路径、未导出成员、SFC 语法、动态 import 路径）。
- 关注输出：`chunkSizeWarningLimit: 600`，超过 600KB 的 chunk 会警告；重型依赖应按 `manualChunks` 落在独立 vendor chunk（`three` / `pdfjs` / `socketio` 等），若发现 vendor 体积异常先查是否有页面静态 import 了重型库。
- 已知告警：`three` chunk ≈ 605 KB（gzip 154 KB）会触发 >600KB 提示，属**可接受**——它只在在线地图路由加载；如需彻底消警可调整 `chunkSizeWarningLimit` 或在文档中登记例外。
- 构建产物不提交（`dist/` 已 `.gitignore`）；需要本地验收时用 `npm run preview`（默认 `http://localhost:4173`）。
- 临时验证产物建议用别名目录，避免污染默认 `dist/`：
  `npx vite build --outDir .tmp-build-verify --emptyOutDir`（完成后删除该目录）。

---

## 六、CI（GitHub Actions）

工作流：`.github/workflows/frontend-ci.yml`

```yaml
# 触发：push / pull_request（仅当 frontend/** 或该 workflow 变更）+ 手动 workflow_dispatch
# 并发：同一 ref 只保留最新一次运行（cancel-in-progress）
# 矩阵：Node 20 / 22（fail-fast: false）
# 所有 run 步骤默认 working-directory: frontend，缓存 npm（frontend/package-lock.json）
# 步骤：
#   npm ci
#   npm run test          # vitest run
#   npm run lint          # eslint，--max-warnings=0
#   npx vite build        # 生产构建
```

- 与本地等价的「一把过」命令：

  ```bash
  cd frontend && npm ci && npm run test && npm run lint && npx vite build
  ```

- CI 只做质量校验，**不自动部署**（前端发布仍是人工流程，见 [`交接文档.md`](交接文档.md) 第四节）。
- 若 PR 的 CI 全绿但本地失败：优先怀疑 Node 版本差异（本地升级到 20/22）与 `npm ci` 与锁文件不一致。

---

## 七、覆盖范围矩阵与缺口

### 工具层（`src/utils/`）

| 模块 | 自动化测试 | 说明 |
|---|---|---|
| `jwt.js` | ✅ 28 例 | 会话判定核心，必须保持高覆盖 |
| `timeBg.js` | ✅ 23 例 | 北京时间渐变时间表 |
| `navLayout.js` | ✅ 19 例 | 布局偏好与 860px 断点 |
| `tableSort.js` | ✅ 12 例 | 纯 DOM 排序指令 |
| `fieldFeedback.js` | ✅ 10 例 | 表单校验反馈 |
| `prefetch.js` | ✅ 14 例 | 路由预取容错 |
| `pow.js` | ✅ 15 例 | PoW 令牌存取 |
| `sanitize.js` | ✅ 12 例 | XSS 过滤 |
| `theme.js` | ✅ 20 例 | 主题模式与 auto 判定 + 扩散动效降级/回退 |
| `banner.js` / `bannerAction.js` | ❌ 未覆盖 | reactive 状态 + 定时器，可直接单测 |
| `confirm.js` | ❌ 未覆盖 | 动态创建 DOM + Promise，需 jsdom |
| `deviceFp.js` | ❌ 未覆盖 | 依赖 Canvas/WebGL，需 mock |
| `tracking.js` | ❌ 未覆盖 | localStorage + 打点上报，需 mock Image/fetch |
| `nav.js` | ❌ 未覆盖 | 纯数据，建议校验「每项 path 都能被 router 解析」 |
| `socket.js` | ❌ 未覆盖 | 单例 + io 连接，需 mock `socket.io-client` |
| `aircraft3d.js` | ❌ 未覆盖 | 依赖 Mapbox/WebGL，建议先重构为可测的纯函数再测 |

### 其它层次

| 层次 | 自动化测试 | 缺口影响 | 建议 |
|---|---|---|---|
| `src/composables/`（`useAppNav`、`useAirportEditor`、`useAirportGroundLayers`） | ❌ | 导航交互/机场编辑回归靠手点 | 优先 `useAppNav`（jsdom + mock `matchMedia`） |
| `src/components/`（表单控件、base 组件、布局） | ❌ | 控件行为回归靠手点 | 引入 `@vue/test-utils` 后覆盖 `FormField` / `SelectMenu` / `DatePicker` / `SubmitButton` / `PoWCaptcha`（不渲染 DOM 的断言）/ base 组件 |
| `src/store/`（user / onlineUsers / mapSettings / notification） | ❌ | 登录态、权限计算回归靠手点 | `user` store 优先（mock `authApi`），断言 `isAdmin` / `hasPermission` |
| `src/router/` 守卫 | ❌ | 权限/续签逻辑最易出安全事故 | 用 `createMemoryHistory` + mock `utils/jwt`，覆盖公开页/无 token/过期/续签失败/权限不足 |
| `src/api/` 拦截器 | ❌ | 401 重放、403 跳转、PoW 注入无回归保护 | mock axios adapter，断言头注入与错误分支 |
| `src/views/` 页面 | ❌ | 全靠手工回归 | 暂不追求单测；优先 E2E（见下） |
| E2E | ❌ 未引入 | 关键链路无自动化冒烟 | 建议 Playwright：登录 → 仪表盘 → 在线地图 2D/3D 切换 → 管理后台用户页 → 表单提交 → 主题切换 |

---

## 八、补测计划（按优先级）

### P0（下一迭代必须）

1. **`store/user.js`**：登录成功/二次验证/`applyLogin`/`logout`/`isAdmin`（rating 11）/`hasPermission`（管理员全通过、普通用户按列表）——mock `@/api` 与 localStorage。
2. **路由守卫**：抽取可测函数或直接用 `createRouter` + memory history，覆盖「未登录跳登录 / 过期且窗口外跳登录 / 窗口内续签成功放行 / 续签失败跳登录 / rating 不足跳 dashboard」五类分支。
3. **`api/index.js` 拦截器**：请求头注入（`Authorization` / `X-Device-Fp` / `X-PoW-Token`）、401 只重放一次、403 `IP_BANNED` / `DEVICE_BANNED` / `INTERNET_BANNED` 分支。
4. **`banner.js` / `bannerAction.js` / `confirm.js`**：状态机 + 定时器 + Promise（jsdom）。
5. **覆盖率工具**：接入 `@vitest/coverage-v8`，先设 `src/utils` 行覆盖 ≥ 80% 的门槛，逐步提高。

### P1（随后补齐）

6. `deviceFp` / `tracking`（mock Canvas/WebGL/Image）与 `sanitize` 的恶意样例扩充（`javascript:` URL、`<img onerror>`）。
7. `@vue/test-utils` + jsdom 覆盖核心表单控件与 base 组件（含 `prefers-reduced-motion` 与 `aria-*` 断言）。
8. 引入 Playwright E2E 冒烟（3–5 条关键链路），接入 CI 的独立 job（按需启动后端或 mock 接口）。
9. 把 `src/views` 逐步纳入 lint（先只开 `no-unused-vars` / `no-undef` 等低噪声规则，再扩大）。

### P2（长期）

10. 统一错误上报与测试覆盖门禁（PR 覆盖率不下降）；
11. 地图类重型模块（`OnlineMap` 拆分后）对纯逻辑部分（坐标转换、筛选排序、图层面板状态）补单测；
12. 视觉回归（截图对比）可选引入，覆盖首页/工作台/表单/地图工具栏。

---

## 九、手工回归清单（自动化缺口兜底）

每次发布前按变更范围勾选（全量发布建议全勾）：

- [ ] 门户首页：背景按时段正确、主题切换、导航下拉、Cookie 提示、协议页可打开
- [ ] 登录 / 注册 / 找回密码：表单校验（红边+摇晃+提示）、验证码倒计时、PoW 不报错（控制台无 403）
- [ ] 会话：刷新保持登录；切后台 7 天内回来不掉线；过期后跳登录并提示
- [ ] 主工作台：仪表盘、通知、个人中心、主题切换、侧栏收拢/展开、侧栏⇄顶栏布局切换
- [ ] 在线地图：2D 高德与 3D Mapbox 双向切换、机组/管制显示、机场图层、雷达开关、离开页面无残留报错
- [ ] 航情查询：METAR/TAF、航图 PDF 渲染、航线查询
- [ ] 飞行计划：提交/编辑/共享链接、FSD 同步入口
- [ ] 管理后台：用户管理、审批、日志（超管）、系统配置；普通用户无法直接访问 `/admin/*`
- [ ] 响应式：< 860px 移动端抽屉、表格不横向溢出、表单可提交
- [ ] 深色主题：所有改动页面的文字/边框/背景对比度可读
- [ ] 控制台：无新增 `error`；无 Vue warning（尤其 `Failed to resolve component`）

---

## 十、常见问题排查

| 现象 | 原因 / 处理 |
|---|---|
| `ReferenceError: localStorage is not defined` | 用例需要 DOM：文件首行加 `// @vitest-environment jsdom` |
| `Cannot find package 'jsdom'` | 依赖未装：`cd frontend && npm ci` |
| `Failed to resolve import "@/..."` | 测试文件不在 vitest `include` 内或别名失效：确认 `vitest.config.js` 的 `resolve.alias` 与 `vite.config.js` 一致 |
| 时间相关用例偶发失败 | 未使用 fake timers / 未固定时区；改用 `vi.setSystemTime()`，不要读真实系统时间 |
| 用例间互相污染 | 未清理 localStorage / 定时器 / mock；在 `beforeEach` 清空存储，`afterEach` `vi.useRealTimers()` + `vi.restoreAllMocks()` |
| `npm run lint` 报大量 `AMap is not defined` | 第三方 SDK 全局；优先改 `window.AMap`，或在 `eslint.config.js` 的 `globals` 登记并在 PR 说明 |
| 构建 OOM | `npm run dev` 已设 4GB；构建可临时 `NODE_OPTIONS=--max-old-space-size=8192 npm run build` |
| CI 通过但本地失败 | Node 版本不一致（统一 20/22）、锁文件未同步、`npm ci` 未执行 |

---

## 十一、验证记录

### 2026-10-31（文档编写时，本机实际执行）

| 命令 | 结果 |
|---|---|
| `cd frontend && npm run test` | ✅ **9 个测试文件 / 153 个用例全部通过**（约 4.5–6.5s） |
| `cd frontend && npm run lint` | ✅ **通过（0 error / 0 warning）**；历史文件按 `TODO(lint-freeze)` 定向豁免 |
| `cd frontend && npx vite build --outDir .tmp-build-docs --emptyOutDir` | ✅ 构建成功（约 7.3s）；产物：`index` ≈ 215 KB（gzip 80 KB）、`OnlineMap` ≈ 90 KB（gzip 29 KB）、`three` ≈ 605 KB（gzip 154 KB）、`pdfjs` ≈ 476 KB（gzip 142 KB）；`three` 超过 `chunkSizeWarningLimit: 600` 属**已知且可接受**（仅地图页懒加载），另见 `frontend/docs/performance.md` |
| CI 工作流 | `.github/workflows/frontend-ci.yml` 已就位（Node 20/22 矩阵） |

> 说明：以上为文档编写时的快照；接手后请把本节替换为最近一次全量验证的实际输出（命令 + 结果 + 日期），保持文档可追溯。

---

## 收口补充（2026-10-31 晚）

- **ESLint 门禁已扩到全站**：`npm run lint` = `eslint src --max-warnings=0`，覆盖 149 个源文件，当前 **0 error / 0 warning**。
  - 历史存量 113 条已清理（空 catch 补注释、删死代码、`let→const`、合并重复 import、重复对象键等），业务行为未改。
  - 仅保留 3 处最小定向豁免：`useOnlineMapInteraction.js`（迁移遗留，no-empty/no-unused-vars）、`mapCore.js`（GCJ-02 常量 no-loss-of-precision）、`MeetingRecords.vue`（历史 `clearInterval(timer)` 未定义变量，需业务立项修复）。
- **新增测试**（+4 文件 / +79 用例）：
  - `src/utils/__tests__/mapCore.test.js`（19）：GCJ-02 真实换算/边界、图层定义、`isMapboxConfigured()`。
  - `src/utils/__tests__/mapboxHealth.test.js`（23）：token 占位符判定、401/403 识别、会话失效标记与隐私模式降级、回退决策优先级。
  - `src/composables/__tests__/useOnlineMapData.test.js`（13）：加载/失败静默、5s 轮询边界、stop 清理、卸载后不再请求。
  - `src/composables/__tests__/useAppNav.test.js`（24）：权限过滤、最长前缀高亮、手风琴展开/保留手动展开。
- **Vitest include**：`src/utils/__tests__/**/*.test.js` + `src/composables/__tests__/**/*.test.js`。
- **地图 3D 降级**：无有效 Mapbox 令牌时自动回退 2D 高德（只回退一次，`sessionStorage['cw_mapbox_invalid']`），3D 入口置灰；纯逻辑在 `src/utils/mapboxHealth.js`，有单测覆盖。
