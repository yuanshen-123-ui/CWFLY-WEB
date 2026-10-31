<template>
  <div class="leaderboard fade-in">
    <div class="page-header">
      <h1>排行榜</h1>
      <p>查看平台积分排行榜</p>
    </div>

    <div class="card p-lg">
      <!-- 加载态 Skeleton / 空态 EmptyState -->
      <div v-if="loading" aria-busy="true" aria-label="正在加载排行榜">
        <Skeleton :lines="6" :height="16" />
      </div>
      <div v-else-if="!leaderboard.length">
        <EmptyState icon="trophy" title="暂无排行数据" description="还没有用户产生积分，完成飞行或参与活动后即可上榜。" />
      </div>
      <div v-else class="table-wrap">
        <table v-sort>
          <thead>
            <tr>
              <th>#</th><th>用户</th><th>积分</th><th>经验值</th><th>等级</th><th>飞行次数</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(u, i) in leaderboard" :key="u.userId">
              <td class="text-center">
                <span v-if="i === 0" class="rank-icon">🥇</span>
                <span v-else-if="i === 1" class="rank-icon">🥈</span>
                <span v-else-if="i === 2" class="rank-icon">🥉</span>
                <span v-else>{{ i + 1 }}</span>
              </td>
              <td class="font-bold">{{ u.userId }}</td>
              <td>{{ u.points || 0 }}</td>
              <td>{{ u.exp || 0 }}</td>
              <td><span class="badge badge-info">Lv.{{ u.level || 1 }}</span></td>
              <td>{{ u.flights || 0 }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '@/api'
import EmptyState from '@/components/base/EmptyState.vue'
import Skeleton from '@/components/base/Skeleton.vue'

const leaderboard = ref([])
const loading = ref(false)

onMounted(async () => {
  loading.value = true
  try { const r = await api.get('/points/leaderboard'); leaderboard.value = r.data || [] } catch { /* ignore */ } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.rank-icon { font-size:1.2rem; }
</style>
