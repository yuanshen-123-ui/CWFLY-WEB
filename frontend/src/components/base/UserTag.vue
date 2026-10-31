<script setup>
/**
 * 用户身份 / 等级标签 UserTag
 *
 * 统一 rating（权限等级）与 role（角色）到一套语义色：
 *  - default（普通） / warning（协管·职员） / danger（管理·超管） / info（管制·飞行）
 *  - 默认渲染全站已有的 .badge 胶囊样式，视觉零跳变
 *  - dot 变体：小圆点 + 文本，用于表格/列表中更轻量的身份标识
 *
 * 用法：
 *  <UserTag :rating="u.rating ?? 0" />
 *  <UserTag :rating="profileData?.rating ?? 0" />
 *  <UserTag role="controller" dot />
 *  <UserTag :rating="11" label="自定义文案" />
 */
import { computed } from 'vue'

const props = defineProps({
  /** 权限等级：0 普通 / 8 协管 / 9 高级协管 / 11 管理员 / 12 超级管理员 */
  rating: { type: [Number, String], default: null },
  /** 角色标识：admin / superadmin / staff / controller / user / pilot */
  role: { type: String, default: '' },
  /** 自定义文案（覆盖默认名称） */
  label: { type: String, default: '' },
  /** 小圆点变体（无胶囊底色） */
  dot: { type: Boolean, default: false },
})

const RATING_TAGS = Object.freeze({
  0: { text: '普通用户', tone: 'default' },
  8: { text: '协管员', tone: 'warning' },
  9: { text: '高级协管员', tone: 'warning' },
  11: { text: '管理员', tone: 'danger' },
  12: { text: '超级管理员', tone: 'danger' },
})

const ROLE_TAGS = Object.freeze({
  admin: { text: '管理员', tone: 'danger' },
  superadmin: { text: '超级管理员', tone: 'danger' },
  staff: { text: '职员', tone: 'warning' },
  controller: { text: '管制员', tone: 'info' },
  pilot: { text: '飞行员', tone: 'info' },
  user: { text: '普通用户', tone: 'default' },
})

const hasRating = computed(() => props.rating !== null && props.rating !== '' && !Number.isNaN(Number(props.rating)))

/** 基准标签：rating 优先，其次 role；都为空则不渲染 */
const base = computed(() => {
  if (hasRating.value) {
    const level = Number(props.rating)
    return RATING_TAGS[level] || { text: `未知(${props.rating})`, tone: 'default' }
  }
  if (props.role) {
    return ROLE_TAGS[props.role.toLowerCase()] || { text: props.role, tone: 'default' }
  }
  return null
})

const text = computed(() => props.label || base.value?.text || '')
const tone = computed(() => base.value?.tone || 'default')
</script>

<template>
  <span v-if="text && dot" class="cw-tag-dot" :class="`cw-tag-dot--${tone}`" :title="text">
    <span class="cw-tag-dot__mark" aria-hidden="true"></span>
    <span class="cw-tag-dot__text">{{ text }}</span>
  </span>
  <span v-else-if="text" class="badge" :class="`badge-${tone}`" :title="text">{{ text }}</span>
</template>

<style scoped>
.cw-tag-dot {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  line-height: 1.5;
  white-space: nowrap;
  color: var(--c-text-secondary, #424245);
}
.cw-tag-dot__mark {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: 50%;
  background: currentColor;
}
.cw-tag-dot--default { color: var(--c-text-muted, #86868b); }
.cw-tag-dot--success { color: #248a3d; }
.cw-tag-dot--warning { color: #b86500; }
.cw-tag-dot--danger  { color: #bf2d24; }
.cw-tag-dot--info    { color: #0077b5; }
html[data-theme='dark'] .cw-tag-dot--success { color: #30d158; }
html[data-theme='dark'] .cw-tag-dot--warning { color: #ff9f0a; }
html[data-theme='dark'] .cw-tag-dot--danger  { color: #ff6961; }
html[data-theme='dark'] .cw-tag-dot--info    { color: #64d2ff; }
</style>
