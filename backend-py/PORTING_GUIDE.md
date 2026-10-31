# 端口规范（Node/Express → Python/FastAPI）

本文件是端口作业的唯一规范。所有端口代码必须遵守，确保 **API 100% 兼容、前端零改动**。

## 0. 绝对禁令

- **不要修改** `D:\CWFLY\backend\`（Node 源码，只读参考）。
- **不要触碰** `D:\CTYFLY-WEB`、`D:\CWFLY-split\CTYFLY-WEB*`（不同项目）。
- **不要** 执行 `git commit` / `git push`（由 Lead 统一提交）。
- **不要** 启动 uvicorn / 改 `.env` / 动数据库结构。
- **不要** 修改已完成的文件：`app/main.py`、`app/deps.py`、`app/config.py`、`app/utils/*`、`app/db/*`、
  `app/middleware/*`、`app/routers/auth.py`、`app/routers/flightplans.py`、`app/services/*` 中已存在的文件
  （除你自己名下的新文件）。`app/routers/__init__.py`、`app/services/__init__.py`、`app/main.py` 由 Lead 修改。
- 只能创建/修改 **分配给你的文件**；需要新服务模块时，文件名带你的任务前缀，避免冲突。

## 1. 代码位置

- Python 项目：`D:\CWFLY\backend-py`
- Node 参考源码：`D:\CWFLY\backend\src\`（`routes/*.js`、`services/*.js`、`utils/*.js`、`middleware/*.js`）
- Prisma 表结构：`D:\CWFLY\backend\prisma\schema.prisma`

## 2. 响应与错误（必须逐字节对齐）

```python
from app.utils.json_compat import JSJSONResponse   # datetime → JS toISOString 格式

def ok(data=None, **extra):      # 成功：{"success": true, "data": ...}
def fail(status, message, **extra):  # 失败：{"success": false, "message": ...}
```

- 状态码、`message` 中文文案必须与 Node 完全一致（含感叹号/括号）。
- 字段名、字段顺序尽量与 Node 一致；`null` 不要被省略。
- 布尔值：MySQL 的 `0/1` 必须转成 `True/False`（Node Prisma Boolean → JSON true/false）。
- 时间：Node 用 `new Date()`/Prisma DateTime 输出 ISO `...000Z`；我们的 `JSJSONResponse` 已统一处理，
  但 **不要** 自己 `strftime` 出别的格式；`filedAt` 这类 **字符串列** 保持原样（Node 存 `zh-CN` 本地时间字符串）。
- 常量 `...toFixed(3)` → `f"{v:.3f}"`；`Number(x)||0` → `int(x or 0)` / `float(x or 0)`。

## 3. 鉴权与权限

```python
from app.deps import CurrentUser, get_current_user, require_rating, require_permission, require_admin_access

@router.get("/x")
async def x(current: CurrentUser = Depends(get_current_user)): ...
```

- Node `router.use(authenticate)` + 多个 `authenticate` → 每个端点都写 `Depends(get_current_user)`（或路由级 `dependencies=[...]`）。
- `requireRating(8)` → `Depends(require_rating(8))`；`requirePermission('user')` → `Depends(require_permission("user"))`；
  `requireAdminAccess` → `Depends(require_admin_access)`。
- 401/403 由 `deps.py` 统一抛出，文案与 Node 一致，**不要**自己返回 401。

## 4. 限流

Node 路由里出现的 `loginLimiter / registerLimiter / sensitiveLimiter / pixelLimiter / networkInfoLimiter / globalLimiter`
均已实现：

```python
from app.middleware.rate_limit import login_limiter, register_limiter, sensitive_limiter
router.post("/x", dependencies=[Depends(sensitive_limiter)])
```

其它自定义 window/max（如 `pixel` 120/min、`network-info` 60/min）用
`rate_limiter(Limit(scope, window, max, message))` 自建（见 `app/middleware/rate_limit.py`）。

## 5. 数据库（SQLAlchemy 2.0 async，原生 SQL）

```python
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db

rows = (await db.execute(text("SELECT ... FROM `Table` WHERE x = :x"), {"x": v})).all()
data = [dict(r._mapping) for r in rows]
```

规则：
- 表名/列名与 Prisma 完全一致（MySQL 列名是 camelCase，**用反引号包裹**，例如 `` `password` ``、`` `fsdLevel` ``）。
- **表名大小写**：生产是 Linux MySQL（区分大小写），必须用 Prisma 的原始表名（`User`、`FlightPlan`…）；
  本地 Windows 会自动折叠，不要因此改成小写。
- 事务：多次写操作需要原子时用 `await db.commit()` 分步即可（Node 版本多数是独立写，不强一致）；
  需要事务时 `async with db.begin():`。
- 布尔列写入 `1/0`，读出转 `bool(...)`。
- DATETIME：Node/Prisma 存 UTC，写入用 `datetime.utcnow()`；**不要**写本地时区。
- 写操作后 `await db.commit()`。
- 若列不存在（如 `FlightPlan` 没有 `createdAt/updatedAt`），以 `SHOW COLUMNS` / schema.prisma 为准。

## 6. 上传（multer → UploadFile）

```python
from fastapi import UploadFile, File
from app.services.uploads import save_upload   # 如已存在则复用；不存在就自行在本人文件内实现

@router.post("/avatar")
async def upload_avatar(file: UploadFile = File(...), current=Depends(get_current_user)): ...
```

必须保持：
- **表单字段名**与 Node `upload.single('xxx')` 完全一致（如 `avatar`、`poster`、`background`、`file`）。
- 落盘目录一致：`uploads/avatars`、`uploads/posters`、`uploads/backgrounds`、`uploads/meetings`（以 Node 源码为准）。
- 文件名规则一致（时间戳 + 随机 + 原扩展名，禁止路径穿越），大小上限一致
  （头像 5MB、海报 5MB、背景 5MB、会议资料 20MB，以源码为准）。
- MIME 白名单与 `src/utils/uploadSafety.js` 一致；返回 JSON 结构一致（含 `url`/`path` 字段名）。

## 7. 外部请求

Node 的 `fetch(url, {signal: AbortSignal.timeout(ms)})` → Python：

```python
async with httpx.AsyncClient(timeout=ms/1000) as client:
    r = await client.get(url)
```
- 超时、兜底返回（Node 常见 `catch → {success:true,data:[]}` / 503 / 502）必须一致。
- 不要新增缓存；Node 有缓存的照抄其 TTL 行为（可用模块级 dict）。

## 8. 文件与路由注册

- 一个 Node 路由文件 → 一个 Python 文件：`app/routers/<name>.py`，`router = APIRouter(prefix="/<name>", tags=["<name>"])`。
- 路径、HTTP 方法、`params/query/body` 字段名必须一致。
- 依赖关系：`GET /:id` 这类动态路由必须放在具体路径（`/fsd/xxx`、`/share/...`）之后。
- 路由注册由 Lead 在 `app/routers/__init__.py` + `app/main.py` 完成，你不要改。

## 9. 验证（必须做）

```powershell
cd D:\CWFLY\backend-py
.\.venv\Scripts\python.exe -m compileall -q app
if ($LASTEXITCODE -eq 0) { "OK" } else { "FAIL" }
```

可选（不启动服务器）：用 `.venv\Scripts\python.exe -c "import app.routers.<你的模块>"` 验证导入。

## 10. 交付报告格式（最后一个消息里给出）

```
完成文件：
  app/routers/xxx.py（N 个端点）
  app/services/yyy.py
端点清单：METHOD /path → 对应 Node 行号
不一致/缺口：...（没有就写“无”）
编译校验：OK
```
