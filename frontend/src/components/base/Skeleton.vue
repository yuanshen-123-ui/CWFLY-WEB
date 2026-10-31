<script setup>
/**
 * 骨架屏 Skeleton
 *
 * 用途：列表 / 卡片数据加载占位，统一 shimmer 动效；
 *  - `lines` > 1 时渲染多行，最后一行自动收窄，模拟真实段落
 *  - 尊重系统「减少动态效果」：prefers-reduced-motion: reduce 时降级为静态底色
 *  - 纯装饰元素，对屏幕阅读器隐藏；加载中的容器请自行加 aria-busy="true"
 */
import { computed } from 'vue'

const props = defineProps({
  /** 宽度：数字按 px，字符串原样（默认 100%） */
  width: { type: [Number, String], default: '100%' },
  /** 高度：数字按 px，字符串原样（默认 14px） */
  height: { type: [Number, String], default: 14 },
  /** 圆角：数字按 px，字符串原样（默认 6px） */
  radius: { type: [Number, String], default: 6 },
  /** 行数，默认 1 */
  lines: { type: Number, default: 1 },
})

const cssSize = (value, fallback) => {
  if (value === '' || value === null || value === undefined) return fallback
  return typeof value === 'number' ? `${value}px` : value
}

const count = computed(() => Math.max(1, Math.floor(Number(props.lines) || 1)))

/** 多行时：最后一行收窄到 60%，更像真实文本段落 */
const lineStyle = (index) => ({
  width: index > 0 && index === count.value - 1 && count.value > 1 ? '60%' : cssSize(props.width, '100%'),
  height: cssSize(props.height, '14px'),
  borderRadius: cssSize(props.radius, '6px'),
})
</script>

<template>
  <div class="cw-skeleton" role="presentation" aria-hidden="true">
    <span v-for="i in count" :key="i" class="cw-skeleton__line" :style="lineStyle(i)"></span>
  </div>
</template>

<style scoped>
.cw-skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.cw-skeleton__line {
  position: relative;
  display: block;
  overflow: hidden;
  max-width: 100%;
  background: rgba(120, 120, 128, 0.16);
}
/* 覆盖层：自左向右扫过的柔光（shimmer） */
.cw-skeleton__line::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.42) 50%,
    transparent 100%
  );
  animation: cw-skeleton-shimmer 1.4s ease-in-out infinite;
}
@keyframes cw-skeleton-shimmer {
  from { transform: translateX(-100%); }
  to   { transform: translateX(100%); }
}
html[data-theme='dark'] .cw-skeleton__line {
  background: rgba(255, 255, 255, 0.1);
}
html[data-theme='dark'] .cw-skeleton__line::after {
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.16) 50%,
    transparent 100%
  );
}
/* 减少动态效果：关闭扫光，退回静态底色 */
@media (prefers-reduced-motion: reduce) {
  .cw-skeleton__line::after {
    content: none;
    animation: none;
  }
  .cw-skeleton__line {
    background: rgba(120, 120, 128, 0.18);
  }
  html[data-theme='dark'] .cw-skeleton__line {
    background: rgba(255, 255, 255, 0.12);
  }
}
</style>
