<template>
    <div class="map-status">
      <span :class="connected ? 'status-ok' : 'status-err'">● {{ connected ? '实时' : '轮询' }}</span>
      <span v-if="lastUpdate" class="status-time">更新 {{ lastUpdate }}</span>
    </div>
</template>

<script setup>
/**
 * MapStatusBar —— 右下角数据状态条（● 实时/轮询 + 最近更新时间）
 * props: connected（是否实时）、lastUpdate（更新时间文案，空则不显示）
 * 无副作用、无监听、无定时器。
 */
defineProps({
  connected: { type: Boolean, default: false },
  lastUpdate: { type: String, default: '' },
})
</script>

<style scoped>
.map-status {
  position: absolute;
  bottom: 2%;
  left: 1.4%;
  z-index: 1000;
  display: flex;
  gap: 8px;
  align-items: center;
  background: rgba(0,0,0,.6);
  color: #fff;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
}
.status-ok { color: #4caf50; }
.status-err { color: #ff9800; }
.status-time { color: rgba(255,255,255,.6); }
</style>
