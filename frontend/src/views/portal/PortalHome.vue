<template>
  <div class="portal-home fade-in">
    <!-- Hero -->
    <section class="hero">
      <div class="hero__content">
        <h1>CWFLY</h1>
        <p>加入我们，体验最真实的连飞乐趣</p>
        <div class="hero__actions">
          <router-link to="/register" class="btn-primary">立即注册</router-link>
          <router-link to="/login" class="btn-outline">已有账号？登录</router-link>
          <a target="_blank" href="https://qm.qq.com/cgi-bin/qm/qr?k=qpFkQa6Gs7MsNG11TS42OcnWAk68bmMu&amp;jump_from=webapi&amp;authKey=pvqyd90WjaPwxJMPUt0tR5BU5ZSEMyxOJObY+iQh//S44UUR7p4+N2X8hXmYrfEO" class="btn-qq">加入QQ群</a>
        </div>
      </div>
    </section>

    <!-- 近期活动 -->
    <section class="section">
      <div class="section__inner">
        <h2 class="section__title">近期活动</h2>
        <div class="events-preview">
          <div v-for="e in events" :key="e.id" class="event-card card card--hover p-md flex gap-md">
            <div class="event-card__date">
              <div class="event-card__day">{{ dayOf(e.date) }}</div>
              <div class="event-card__mon">{{ monthOf(e.date) }}</div>
            </div>
            <div class="flex-1">
              <h4>{{ e.title }}</h4>
              <p class="text-sm text-muted mt-sm">{{ e.date }} &mdash; {{ e.dep }} → {{ e.arr }}</p>
            </div>
            <div class="flex items-center">
              <span class="badge" :class="e.status === '报名中' ? 'badge-success' : e.status === '进行中' ? 'badge-info' : 'badge-default'">{{ e.status }}</span>
            </div>
          </div>
        </div>
        <div v-if="!events.length" class="text-center text-muted p-md">暂无活动</div>
        <div class="text-center mt-lg">
          <router-link to="/events" class="btn btn-outline">查看全部活动</router-link>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { eventsApi } from '@/api'

const events = ref([])
let titleTimer = null

function dayOf(d) { return d ? new Date(d).getDate() : '-' }
function monthOf(d) { return d ? ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'][new Date(d).getMonth()] : '' }

// 标题伪加载动画：Loading. → Loading.. → Loading...
function startTitleLoading() {
  const dots = ['.', '..', '...']
  let i = 0
  document.title = 'Loading.'
  titleTimer = setInterval(() => {
    i = (i + 1) % dots.length
    document.title = 'Loading' + dots[i]
  }, 400)
}

onMounted(async () => {
  startTitleLoading()
  const minLoadingMs = 1500
  const startedAt = Date.now()
  try {
    const res = await eventsApi.list({})
    events.value = (res.data || []).slice(0, 3)
  } catch { /* ignore */ }
  const elapsed = Date.now() - startedAt
  if (elapsed < minLoadingMs) {
    await new Promise(r => setTimeout(r, minLoadingMs - elapsed))
  }
  // 加载完成 → 设置正式标题
  if (titleTimer) { clearInterval(titleTimer); titleTimer = null }
  document.title = 'CW - 青翼模拟飞行连飞平台'
})

onUnmounted(() => {
  if (titleTimer) { clearInterval(titleTimer); titleTimer = null }
})
</script>

<style scoped>
.hero {
  position: relative;
  padding: 100px 24px 80px;
  text-align: center;
  color: #1d1d1f;
  overflow: hidden;
}
.hero__bg {
  display: none;
}
.hero__content { position: relative; z-index: 1; max-width: 640px; margin: 0 auto; }
.hero__content h1 {
  font-size: 42px; font-weight: 700;
  letter-spacing: -.02em;
  margin-bottom: 12px;
  color: var(--c-text); /* 深色模式下为白色 */
}
.hero__content p {
  font-size: 18px;
  color: var(--c-text-muted); /* 深色模式下自动提亮 */
  margin-bottom: 32px;
  font-weight: 400;
}
/* 深色模式: 副标题进一步提亮, 保证可读 */
html[data-theme='dark'] .hero__content p {
  color: var(--c-text-secondary);
}
.hero__actions { display: flex; gap: 12px; justify-content: center; }
.hero__actions a {
  display: inline-block;
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  padding: 10px 24px;
  border-radius: 20px;
  transition: all .2s;
  cursor: pointer;
}
.hero__actions a.btn-primary {
  background: #1d1d1f;
  border: none;
  color: #fff;
}
.hero__actions a.btn-primary:hover {
  background: #000;
  transform: scale(1.02);
}
.hero__actions a.btn-outline {
  background: rgba(255, 255, 255, .72); /* 半透明白: 浅色下接近白, 深色下柔和不刺眼 */
  border: 1px solid var(--c-border);
  color: #1d1d1f; /* 该按钮为浅底黑字品牌按钮, 文字固定黑色 */
}
.hero__actions a.btn-outline:hover {
  background: rgba(255, 255, 255, .92);
  border-color: #1d1d1f;
}
.hero__actions a.btn-qq {
  display: inline-flex; align-items: center; gap: 6px;
  text-decoration: none;
  font-size: 14px; font-weight: 500;
  padding: 10px 20px;
  border-radius: 20px;
  background: #12b7f5; color: #fff;
  transition: all .2s;
  cursor: pointer;
}
.hero__actions a.btn-qq:hover {
  background: #0da0d6;
  transform: scale(1.02);
  text-decoration: none;
}

.section { padding: 48px 24px; }
.section__inner { max-width: 1100px; margin: 0 auto; }
.section__title { font-size: 22px; font-weight: 700; margin-bottom: 24px; }

.events-preview { display: flex; flex-direction: column; gap: 12px; }
.event-card { align-items: center; }
.event-card__date { text-align: center; min-width: 56px; }
.event-card__day { font-size: 22px; font-weight: 800; color: var(--c-primary); line-height: 1; }
.event-card__mon { font-size: 12px; color: var(--c-text-muted); }

@media (max-width: 600px) {
  .hero__content h1 { font-size: 26px; }
}
</style>
