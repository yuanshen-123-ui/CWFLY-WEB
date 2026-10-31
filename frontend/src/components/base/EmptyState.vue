<script setup>
/**
 * 统一空态 EmptyState
 *
 * 用途：列表 / 表格无数据时的占位，视觉与全站液态玻璃风格一致。
 *  - 默认插槽可完全接管说明区（例如追加「刷新」按钮）
 *  - actionText + actionTo 组合渲染 router-link；只有 actionText 时触发 action 事件
 *  - role="status" 让「加载完成但无数据」的变化被屏幕阅读器播报
 */
import Icon from './Icon.vue'

defineProps({
  /** 图标名（见 Icon 注册表），默认 inbox */
  icon: { type: String, default: 'inbox' },
  /** 主标题 */
  title: { type: String, default: '暂无数据' },
  /** 补充说明 */
  description: { type: String, default: '' },
  /** 操作按钮文案 */
  actionText: { type: String, default: '' },
  /** 操作按钮跳转路由 */
  actionTo: { type: [String, Object], default: '' },
  /** 紧凑模式（表格内、卡片内小面积使用） */
  compact: { type: Boolean, default: false },
})

defineEmits(['action'])
</script>

<template>
  <div class="cw-empty" :class="{ 'cw-empty--compact': compact }" role="status">
    <span class="cw-empty__icon" aria-hidden="true">
      <slot name="icon">
        <Icon :name="icon" :size="compact ? 24 : 32" :stroke-width="1.6" />
      </slot>
    </span>
    <p class="cw-empty__title">{{ title }}</p>
    <p v-if="description" class="cw-empty__desc">{{ description }}</p>
    <div v-if="actionText || $slots.default" class="cw-empty__action">
      <router-link v-if="actionTo" :to="actionTo" class="btn btn-outline btn-sm">{{ actionText }}</router-link>
      <button v-else-if="actionText" type="button" class="btn btn-outline btn-sm" @click="$emit('action')">
        {{ actionText }}
      </button>
      <slot />
    </div>
  </div>
</template>

<style scoped>
.cw-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 40px 20px;
  text-align: center;
  color: var(--c-text-muted, #86868b);
}
.cw-empty--compact {
  padding: 22px 16px;
}
.cw-empty__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  margin-bottom: 6px;
  border-radius: 50%;
  color: var(--c-text-muted, #86868b);
  background: var(--glass-bg, rgba(255, 255, 255, 0.22));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.28));
}
.cw-empty--compact .cw-empty__icon {
  width: 44px;
  height: 44px;
}
.cw-empty__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--c-text-secondary, #424245);
  line-height: 1.5;
}
.cw-empty--compact .cw-empty__title {
  font-size: 14px;
}
.cw-empty__desc {
  max-width: 420px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--c-text-muted, #86868b);
}
.cw-empty__action {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 10px;
}
</style>
