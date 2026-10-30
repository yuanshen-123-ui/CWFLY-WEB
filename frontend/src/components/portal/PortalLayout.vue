<template>
  <div class="portal">
    <!-- 顶部导航 -->
    <PortalNavbar />

    <!-- 主内容 -->
    <main class="portal__main">
      <router-view />
    </main>

    <!-- Cookie 同意提示 -->
    <CookieConsent />

    <!-- 页脚 -->
    <footer class="portal__footer">
      <div class="portal__footer-inner">
        <p>&copy; {{ new Date().getFullYear() }} CWFLY &mdash; All rights reserved.</p>
        <p class="text-sm text-muted">本站由 CW 连飞网络提供技术支持</p>
        <div class="footer-links">
          <router-link to="/cookie-policy">Cookie Policy</router-link>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup>
import PortalNavbar from './PortalNavbar.vue'
import CookieConsent from '@/components/CookieConsent.vue'
</script>

<style scoped>
.portal {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: transparent;
}

.portal__main {
  flex: 1;
  padding-top: calc(var(--header-h) + 16px);
  padding-bottom: 40px;
}

.portal__footer {
  background: var(--glass-bg-strong);
  backdrop-filter: blur(var(--glass-blur-lg)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur-lg)) saturate(var(--glass-saturate));
  border-top: 1px solid var(--glass-border-strong);
  padding: 24px 0;
  text-align: center;
}

.portal__footer-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
  color: var(--c-text-secondary);
}
.footer-links {
  margin-top: 8px;
}
.footer-links a {
  color: var(--c-text-muted);
  text-decoration: none;
  font-size: 13px;
  transition: color .2s;
}
.footer-links a:hover {
  color: var(--c-primary);
  text-decoration: underline;
}
</style>
