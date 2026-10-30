<template>
  <div class="banned-page">
    <div class="banned-card fade-in">
      <div class="banned-icon">
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <circle cx="50" cy="50" r="48" fill="var(--c-danger)" />
          <rect x="44" y="24" width="12" height="34" rx="6" fill="#fff" />
          <circle cx="50" cy="70" r="7" fill="#fff" />
        </svg>
      </div>
      <p class="banned-text">您好，您当前所处地区不受平台支持，我们将暂停为您提供任何服务</p>
    </div>
  </div>
</template>

<script setup>
</script>

<style scoped>
.banned-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--c-bg, #f5f5f7);
}
.banned-card {
  max-width: 480px;
  width: 100%;
  text-align: center;
  padding: 48px 32px;
  border-radius: 20px;
  background: var(--c-bg-card, rgba(255, 255, 255, 0.85));
  border: 1px solid var(--c-border, rgba(0, 0, 0, 0.1));
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(12px) saturate(1.4);
  -webkit-backdrop-filter: blur(12px) saturate(1.4);
}
.banned-icon {
  width: 120px;
  height: 120px;
  margin: 0 auto 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.banned-icon svg {
  width: 100%;
  height: 100%;
  filter: drop-shadow(0 8px 24px rgba(255, 69, 58, 0.35));
}
.banned-text {
  margin: 0;
  font-size: 17px;
  line-height: 1.8;
  color: var(--c-text, #1d1d1f);
}
</style>
