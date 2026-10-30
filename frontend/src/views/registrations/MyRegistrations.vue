<template>
  <div class="my-registrations fade-in">
    <div class="page-header">
      <h1>我的报名</h1>
      <p>查看我报名的活动</p>
    </div>

    <!-- 分类标签 -->
    <div class="tabs mb-lg">
      <button class="tab-btn" :class="{ active: tab === 'all' }" @click="tab = 'all'">全部 ({{ registrations.length }})</button>
      <button class="tab-btn" :class="{ active: tab === 'pilot' }" @click="tab = 'pilot'">飞行员报名 ({{ pilotRegs.length }})</button>
      <button class="tab-btn" :class="{ active: tab === 'controller' }" @click="tab = 'controller'">管制员报名 ({{ ctrlRegs.length }})</button>
    </div>

    <div class="card p-lg">
      <div v-for="r in filteredRegs" :key="r.id" class="reg-item flex justify-between items-center p-md">
        <div>
          <h4 class="font-bold text-sm">{{ r.event?.title || '活动' }}</h4>
          <p class="text-xs text-muted">
            <span class="badge" :class="r.type === 'controller' ? 'badge-info' : 'badge-success'" style="margin-right:6px;">{{ r.type === 'controller' ? '管制员' : '飞行员' }}</span>
            {{ r.event?.date }} · {{ r.position || r.callsign || '-' }}{{ r.aircraft ? ' · ' + r.aircraft : '' }}
          </p>
        </div>
        <div class="flex gap-sm items-center">
          <span class="badge" :class="r.event?.status === '报名中' ? 'badge-success' : 'badge-default'">{{ r.event?.status }}</span>
          <!-- 活动已结束则不显示取消报名按钮 -->
          <button v-if="r.event?.status !== '已结束'" class="btn btn-outline btn-danger btn-cancel-badge" @click="cancelReg(r)">取消报名</button>
        </div>
      </div>
      <div v-if="!filteredRegs.length" class="text-center text-muted p-lg">暂无报名记录</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '@/api'

const registrations = ref([])
const tab = ref('all')

const pilotRegs = computed(() => registrations.value.filter(r => r.type !== 'controller'))
const ctrlRegs = computed(() => registrations.value.filter(r => r.type === 'controller'))
const filteredRegs = computed(() => {
  if (tab.value === 'pilot') return pilotRegs.value
  if (tab.value === 'controller') return ctrlRegs.value
  return registrations.value
})

onMounted(async () => {
  try { const r = await api.get('/events/my-registrations'); registrations.value = r.data || [] } catch {}
})

async function cancelReg(r) {
  if (!confirm('确定取消报名？')) return
  try {
    await api.delete('/events/registrations/' + r.id)
    registrations.value = registrations.value.filter(x => x.id !== r.id)
    alert('已取消报名')
  } catch (e) { alert('取消失败: ' + e.message) }
}
</script>

<style scoped>
.tabs { display:flex; gap:6px; flex-wrap:wrap; border-bottom:1px solid var(--c-border-light); padding-bottom:8px; }
.tab-btn { padding:5px 14px; border-radius:6px; border:none; background:transparent; color:var(--c-text-secondary); font-size:13px; font-weight:500; cursor:pointer; transition:all .15s; }
.tab-btn:hover { background:var(--glass-bg); }
.tab-btn.active { background:var(--c-primary); color:#fff; }
.reg-item { border-bottom:1px solid var(--c-border-light); }
.reg-item:last-child { border-bottom:none; }
.btn-danger { color:var(--c-danger);border-color:var(--c-danger); }
.btn-danger:hover { background:var(--c-danger);color:#fff; }
/* 取消报名按钮与“报名中”状态徽章同尺寸（padding/字号/圆角一致） */
.btn-cancel-badge { font-size:12px;padding:4px 14px;border-radius:99px;line-height:1.4; }
</style>
