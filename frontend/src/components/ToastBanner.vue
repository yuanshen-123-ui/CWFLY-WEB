<template>
  <Transition name="banner">
    <div v-if="bannerState.visible" :key="bannerState.key" class="toast-banner">
      <div class="toast-banner__msg">{{ bannerState.message }}</div>
      <div class="toast-banner__bar">
        <div
          class="toast-banner__bar-inner"
          :style="{ animationDuration: bannerState.duration + 'ms' }"
          @animationend="onBarEnd"
        ></div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { bannerState, hideBanner } from '@/utils/banner'

// 进度条动画结束 → 横幅向右侧缩回消失
function onBarEnd(e) {
  if (e.animationName === 'bannerBar') hideBanner()
}
</script>

<style scoped>
.toast-banner {
  position: fixed;
  top: calc(var(--header-h, 60px) + 8px);   /* 右上角菜单栏下方 */
  right: 16px;
  z-index: 2100;
  width: 340px;
  max-width: calc(100vw - 32px);
  background: #e5484d;                        /* 红色背景 */
  color: #fff;
  border-radius: 12px;
  padding: 14px 0 0;                          /* 左右内边距归零，让进度条贴满左右边缘 */
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
  overflow: hidden;
}.toast-banner__msg {
  font-size: 14px;
  line-height: 1.5;
  margin-bottom: 12px;
  word-break: break-word;
  padding: 0 16px;                            /* 文字左右留白（容器已去左右内边距） */
}
.toast-banner__bar {
  height: 3px;
  background: rgba(255, 255, 255, 0.35);
}
.toast-banner__bar-inner {
  height: 100%;
  background: #fff;
  transform-origin: left center;              /* 向左侧收缩 */
  animation-name: bannerBar;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}
@keyframes bannerBar {
  from { transform: scaleX(1); }
  to   { transform: scaleX(0); }
}
/* 进入：从右侧滑入（向左弹出） */
.banner-enter-active { transition: transform .35s cubic-bezier(.22, 1, .36, 1), opacity .35s ease; }
.banner-enter-from { transform: translateX(110%); opacity: 0; }
/* 离开：向右侧缩回 */
.banner-leave-active { transition: transform .35s ease-in, opacity .35s ease; }
.banner-leave-to { transform: translateX(110%); opacity: 0; }
</style>
