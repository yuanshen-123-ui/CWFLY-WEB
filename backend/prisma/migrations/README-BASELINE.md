# 迁移基线与漂移说明（2026-10-16 核对）

本目录的迁移记录与生产库（`cwfly`）**并不一致**。以下为逐条核对结果，
**在阅读本节并完成基线之前，请不要在生产库执行 `prisma migrate deploy`** ——
它会重放下列迁移，其中既有可能失败的（表名大小写错误）也有**破坏性的**（DROP COLUMN）。

## 生产库实际记录（`_prisma_migrations`）

| 迁移 | 记录 | 实际效果是否在库中 |
|---|---|---|
| `20260718164005_init` | 已完成 | ✅ |
| `20260718170458_add_salt` | **未完成**（finished_at 为空） | ❌ `User.salt` 不存在。该 SQL 写的是 `ALTER TABLE \`user\``（小写），而真实表名是 `User`（Linux 下 MySQL 表名大小写敏感）→ 当时执行失败。 |
| `20260719083753_add_email_qq_avatar` | 无记录 | ✅ email/qq/avatar 均在 |
| `20260719090741_add_all_features` | 无记录 | ✅ EventRegistration / Notification / FlightLog / Ticket 等 23 张表均在 |
| `20260719091513_add_reset_password` | 无记录 | ✅ resetCode / resetCodeExpires 均在 |
| `20260719091544_add_fields` | 无记录 | ✅ Achievement.condition、Application.reviewComment 均在 |
| `20260719091845_text_fields` | 无记录 | ✅ KnowledgeBase.content / TrainingCourse.content 已是 TEXT |
| `20260723035250_add_rating_field` | 无记录 | ✅（`User.rating` 存在） |
| `20260723055649_add_fsd_level` | 无记录 | ⚠️ **部分**：`User.fsdLevel` 存在，但 `User.fsdType` **不存在** |
| `20260723075705_merge_rating_into_fsd_level` | 无记录 | ❌ 未执行（其 `DROP COLUMN rating` 若执行会破坏仍在使用 `rating` 的应用） |
| `20261016220000_add_fsd_snapshot_tables_and_missing_columns` | 已标记已应用 | ✅ 对象已核对存在（本次新增，SQL 幂等） |

补充：`salt` / `fsdType` 均**未定义在 `schema.prisma` 的 `User` 模型**中，因此 Prisma 不会选择它们；
引用它们的 `backend/prisma.js`、`backend/profile.js` 属于未被 `src/` 引用的历史副本 → 不构成线上故障。

## 安全基线步骤（建议由熟悉本库的人执行）

1. 备份：`mysqldump cwfly > 备份.sql`
2. 逐条标记**效果确实存在**的迁移：
   ```bash
   npx prisma migrate resolve --applied 20260719083753_add_email_qq_avatar
   npx prisma migrate resolve --applied 20260719090741_add_all_features
   npx prisma migrate resolve --applied 20260719091513_add_reset_password
   npx prisma migrate resolve --applied 20260719091544_add_fields
   npx prisma migrate resolve --applied 20260719091845_text_fields
   npx prisma migrate resolve --applied 20260723035250_add_rating_field
   ```
3. 处理三条例外（**不要**直接标记为已应用，需先决定语义）：
   - `20260718170458_add_salt`：`salt` 已不再被 schema 使用 → 建议标记为已应用并把 SQL 里的表名改为 `User`，
     或者保留列（`ALTER TABLE \`User\` ADD COLUMN salt VARCHAR(191) NOT NULL DEFAULT ''`）。
   - `20260723055649_add_fsd_level`：若确需在 API 暴露 `fsdType`，则给 `User` 补列并写入 schema；
     否则把该迁移拆分为"已应用部分"并修正 SQL。
   - `20260723075705_merge_rating_into_fsd_level`：**其 DROP 与当前 schema/应用冲突**，
     应删除或改写该迁移，再标记为已应用（当前状态会让 `migrate deploy` 试图执行 DROP）。
4. 全部处理完后再执行 `npx prisma migrate status`，确认 "Database schema is up to date"。
