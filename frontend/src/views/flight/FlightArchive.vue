<template>
  <div class="flight-archive fade-in">
    <div class="page-header">
      <h1>飞行档案</h1>
      <p>查看我的历史飞行记录</p>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table v-sort>
          <thead>
            <tr>
              <th>日期</th><th>航班号</th><th>机型</th><th>起飞机场</th><th>到达机场</th>
              <th>飞行时间</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in flights" :key="f.id">
              <td>{{ formatDate(f.filedAt) }}</td>
              <td>{{ f.callsign || '-' }}</td>
              <td>{{ f.aircraft || '-' }}</td>
              <td>{{ f.depIcao || '-' }}</td>
              <td>{{ f.arrIcao || '-' }}</td>
              <td>{{ f.flightTime ? f.flightTime + 'min' : '-' }}</td>
              <td><button class="btn btn-outline btn-xs" @click="viewDetail(f)">详情</button></td>
            </tr>
            <tr v-if="!flights.length"><td colspan="7" class="text-center text-muted">暂无飞行记录</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 详情弹窗 -->
    <Teleport to="body">
    <div v-if="detail" class="modal-overlay" @click.self="detail = null">
      <div class="modal card p-lg">
        <h3 class="mb-md">飞行详情</h3>
        <div class="grid-2 gap-md">
          <div><label class="text-sm text-muted">航班号</label><p>{{ detail.callsign || '-' }}</p></div>
          <div><label class="text-sm text-muted">机型</label><p>{{ detail.aircraft || '-' }}</p></div>
          <div><label class="text-sm text-muted">起飞机场</label><p>{{ detail.depIcao || '-' }}</p></div>
          <div><label class="text-sm text-muted">到达机场</label><p>{{ detail.arrIcao || '-' }}</p></div>
          <div><label class="text-sm text-muted">飞行时间</label><p>{{ detail.flightTime || '-' }} 分钟</p></div>
          <div><label class="text-sm text-muted">距离</label><p>{{ detail.distance || '-' }} NM</p></div>
          <div><label class="text-sm text-muted">燃油消耗</label><p>{{ detail.fuelUsed || '-' }} kg</p></div>
          <div><label class="text-sm text-muted">最高高度</label><p>{{ detail.maxAlt || '-' }} ft</p></div>
        </div>
        <div class="mt-md">
          <label class="text-sm text-muted">备注</label>
          <p>{{ detail.remarks || '无' }}</p>
        </div>
        <button class="btn btn-outline mt-md" @click="detail = null">关闭</button>
      </div>
    </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '@/api'

const flights = ref([])
const detail = ref(null)

onMounted(async () => {
  try { const r = await api.get('/flightplans'); flights.value = (r.data || []) } catch { /* ignore */ }
})

function formatDate(t) {
  if (!t) return '-'
  const d = new Date(t)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('zh-CN')
}

function viewDetail(f) { detail.value = f }
</script>

<style scoped>
.modal-overlay { position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:2000; animation: overlayFadeIn .25s ease; }
.modal { width:560px;max-width:90vw; animation: modalPopIn .3s cubic-bezier(.34,1.56,.64,1); }
@keyframes overlayFadeIn { from { opacity:0 } to { opacity:1 } }
@keyframes modalPopIn { from { opacity:0; transform:translateY(16px) scale(.95) } to { opacity:1; transform:translateY(0) scale(1) } }
.grid-2 { display:grid;grid-template-columns:1fr 1fr;gap:1rem; }
</style>
