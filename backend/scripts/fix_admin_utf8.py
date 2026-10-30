import re, os

path = "/opt/cwfly/backend/src/routes/admin.js"

# Read the file as bytes
with open(path, "rb") as f:
    data = f.read()

# The structure (imports, function calls, etc.) is ASCII and intact.
# Only Chinese text in comments and string literals is corrupted.
# Strategy: extract all ASCII structure, then replace known corrupted
# Chinese patterns.

# Actually, let's try a simpler approach:
# 1. Read the file as UTF-8 (with error replacement)
# 2. Find all lines with non-ASCII characters
# 3. Replace corrupted Chinese with correct versions

with open(path, "r", encoding="utf-8", errors="replace") as f:
    content = f.read()

# Define replacements - map corrupted patterns to correct Chinese
# The corruption is: original UTF-8 bytes interpreted as some ANSI encoding
replacements = {
    "ç¨æ·": "用户",
    "ç®¡ç": "管理",
    "æé": "权限",
    "ç­çº§": "等级",
    "å®ä¹": "定义",
    "æ¯ä¸ª": "每个",
    "åè½": "功能",
    "èç¹": "节点",
    "ä½¿ç¨": "使用",
    "ç»å": "细分",
    "æ§å¶": "控制",
    "åºç¨": "应用",
    "å¨å±": "全局",
    "æä½": "最低",
    "è¦æ±": "要求",
    "è·¯ç±": "路由",
    "è³å°": "至少",
    "éè¦": "需要",
    "éç¥": "通知",
    "è´¦å·": "账号",
    "åæ´": "变更",
    "ä¿®æ¹": "修改",
    "å é¤": "删除",
    "å¬å": "公告",
    "ä¸å­å¨": "不存在",
    "å·²å é¤": "已删除",
    "å·²æ´æ°": "已更新",
    "ç¼ºå°": "缺少",
    "å¿å¡«": "必填",
    "å­æ®µ": "字段",
    "æ¥è¯¢": "查询",
    "å·²å­å¨": "已存在",
    "æ·»å ": "添加",
    "åå·¥": "员工",
    "æ´»å¨": "活动",
    "è§è²": "角色",
    "ç³è¯·": "申请",
    "å®¡æ¹": "审批",
    "éè¿": "通过",
    "èªå¨": "自动",
    "æ·»å å°": "添加到",
    "åå¾": "前往",
    "ä¸ªäºº": "个人",
    "ä¸­å¿": "中心",
    "å¡«å": "填写",
    "ç­¾å": "签名",
    "å±ç¤º": "展示",
    "å®æ´": "完整",
    "ä¿¡æ¯": "信息",
    "ç®¡å¶": "管制",
    "ç®¡å¶é¨": "管制部",
    "ç®¡å¶å": "管制员",
    "å¨çº¿": "在线",
    "éç¥å·²åé": "通知已发送",
    "ç¶æ": "状态",
    "ç­¹å¤": "筹备",
    "è¯·èç³»": "请联系",
    "çé®": "疑问",
    "æ¨ç": "您的",
    "æ¨å¥½": "您好",
    "å·²éè¿": "已通过",
    "å®¡æ ¸": "审核",
    "è¯·åå¾": "请前往",
    "ç»å½": "登录",
    "æ°æ®": "数据",
    "æ ¼å¼": "格式",
    "åä¸º": "化为",
    "ç»æ": "结构",
    "ä¼è®®": "会议",
    "éªè®¡": "审计",
    "è¾å©": "辅助",
    "å¤±è´¥": "失败",
    "å½±å": "影响",
    "ä¸»æµç¨": "主流程",
    "ç»¼åé¨": "综合部",
    "åå¾ä¸ªäººä¸­å¿": "前往个人中心",
    # Specific email strings
    "è´¦å·ä¿¡æ¯å·²åæ´": "账号信息已变更",
    "åå·¥ç³è¯·å·²éè¿": "员工申请已通过",
    "ç®¡å¶åç³è¯·å·²éè¿": "管制员申请已通过",
    "ç®¡çåå·²ä¿®æ¹æ¨çè´¦å·ä¿¡æ¯ã": "管理员已修改您的账号信息。",
    "æ¨çåå·¥ç³è¯·å·²éè¿å®¡æ ¸ã": "您的员工申请已通过审核。",
    "æ¨çç®¡å¶åç³è¯·å·²éè¿å®¡æ ¸ã": "您的管制员申请已通过审核。",
    "è¯·åå¾ä¸ªäººä¸­å¿å¡«åæ¨çä¸ªäººç­¾åï¼ä»¥ä¾¿å¬ç¤ºé¡µé¢å±ç¤ºå®æ´ä¿¡æ¯ã": "请前往个人中心填写您的个人签名，以便公示页面展示完整信息。",
    "è¯·åå¾ä¸ªäººä¸­å¿å¡«åä¸ªäººç­¾åï¼ä»¥ä¾¿å¬ç¤ºé¡µé¢å±ç¤ºå®æ´ä¿¡æ¯ã": "请前往个人中心填写个人签名，以便公示页面展示完整信息。",
    "å¦æçé®è¯·èç³»ç®¡çåã": "如有疑问请联系管理员。",
    # Arrow
    "â": "→",
}

for old, new in replacements.items():
    count = content.count(old)
    if count > 0:
        content = content.replace(old, new)
        print(f"  {old[:20]:20s} -> {new} ({count} occurrences)")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print(f"\nWritten {len(content)} chars to {path}")
