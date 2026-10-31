<template>
  <div class="admin-page fade-in">
    <div class="page-header flex justify-between items-start flex-wrap gap-md">
      <div>
        <h1>IP 封禁</h1>
        <p>封禁恶意 IP 或网段，拦截其访问本站全部接口</p>
      </div>
      <button class="btn btn-primary btn-sm" @click="showForm=true">+ 新增封禁</button>
    </div>

    <!-- 新增封禁表单 -->
    <div v-if="showForm" class="card p-lg mb-lg">
      <h3 class="mb-md">新增封禁</h3>
      <div style="max-width:600px;">
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">IP 地址 / 网段</label>
          <input v-model="form.ip" class="input" placeholder="例如：1.2.3.4 或 1.2.3.0/24" />
          <p class="text-sm text-muted mt-sm">支持单个 IP 或 CIDR 网段（如 1.2.3.0/24 表示整个 /24 网段）</p>
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">封禁原因</label>
          <input v-model="form.reason" class="input" placeholder="例如：恶意注册 / 爬虫刷接口" maxlength="100" />
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">封禁时长</label>
          <SelectMenu v-model="durationType" :options="[{ value: 'permanent', label: '永久封禁' }, { value: 'hours', label: '按小时' }, { value: 'days', label: '按天' }]" style="max-width:220px;" />
          <input v-if="durationType !== 'permanent'" v-model.number="durationValue" type="number" min="1" class="input" style="max-width:120px;margin-left:8px;" :placeholder="durationType === 'hours' ? '小时' : '天'" />
        </div>
        <div class="flex gap-sm">
          <button class="btn btn-primary" @click="submitForm" :disabled="submitting">封禁</button>
          <button class="btn btn-outline" @click="cancelForm">取消</button>
        </div>
      </div>
    </div>

    <!-- 封禁列表 -->
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>IP / 网段</th>
              <th>类型</th>
              <th>原因</th>
              <th>封禁人</th>
              <th>状态</th>
              <th>过期时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="b in bans" :key="b.id">
              <td class="font-bold" style="font-family:monospace;">{{ b.ip }}</td>
              <td><span class="badge badge-info">{{ b.ip.includes('/') ? '网段' : '精确' }}</span></td>
              <td class="text-muted text-sm">{{ b.reason || '-' }}</td>
              <td class="text-muted text-sm">{{ b.bannedBy || '-' }}</td>
              <td>
                <span class="badge" :class="b.expired ? 'badge-default' : (b.active ? 'badge-danger' : 'badge-success')">
                  {{ b.expired ? '已过期' : (b.active ? '生效中' : '已解封') }}
                </span>
              </td>
              <td class="text-muted text-sm">{{ formatExpiry(b) }}</td>
              <td>
                <div class="flex gap-sm">
                  <button v-if="b.active" class="btn btn-outline btn-sm" @click="toggleBan(b, false)">解封</button>
                  <button v-else-if="!b.expired" class="btn btn-outline btn-sm" @click="toggleBan(b, true)">重新封禁</button>
                  <button class="btn btn-outline btn-sm" style="color:var(--c-danger);" @click="delBan(b)">删除</button>
                </div>
              </td>
            </tr>
            <tr v-if="!bans.length">
              <td colspan="7" class="text-center text-muted">暂无封禁记录</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="p-md text-sm text-muted" style="border-top:1px solid var(--c-border-light);">
        提示：封禁对站内全部 API 接口即时生效；被封禁 IP 访问将收到 403 提示。
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { adminApi } from '@/api'

const bans = ref([])
const showForm = ref(false)
const submitting = ref(false)
const durationType = ref('permanent')
const durationValue = ref(1)
const form = ref({ ip: '', reason: '' })

onMounted(() => load())

async function load() {
  try {
    const res = await adminApi.ipBans()
    bans.value = res.data || []
  } catch { /* ignore */ }
}

function cancelForm() {
  showForm.value = false
  form.value = { ip: '', reason: '' }
  durationType.value = 'permanent'
  durationValue.value = 1
}

function calcHours() {
  if (durationType.value === 'permanent') return 0
  const v = Math.max(1, Number(durationValue.value) || 1)
  return durationType.value === 'days' ? v * 24 : v
}

function isValidIp(ip) {
  const s = String(ip || '').trim()
  // 支持单个 IPv4 / IPv4 CIDR / IPv6（含 ::ffff: 前缀）
  if (!s) return false
  if (s.includes('/')) {
    const [base, prefix] = s.split('/')
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(base)) return false
    const p = Number(prefix)
    return Number.isInteger(p) && p >= 0 && p <= 32
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) {
    return s.split('.').every(n => Number(n) >= 0 && Number(n) <= 255)
  }
  // IPv6 简验
  return /^[0-9a-fA-F:]+$/.test(s) && s.includes(':')
}

async function submitForm() {
  const ip = form.value.ip.trim()
  if (!isValidIp(ip)) return alert('请输入有效的 IP 地址或 CIDR 网段')
  submitting.value = true
  try {
    await adminApi.createIpBan({ ip, reason: form.value.reason.trim(), hours: calcHours() })
    cancelForm()
    await load()
  } catch (e) {
    alert(e.message)
  } finally {
    submitting.value = false
  }
}

async function toggleBan(b, active) {
  try {
    await adminApi.updateIpBan(b.id, { active })
    await load()
  } catch (e) { alert(e.message) }
}

async function delBan(b) {
  if (!confirm(`确定删除对 ${b.ip} 的封禁记录？`)) return
  try {
    await adminApi.deleteIpBan(b.id)
    await load()
  } catch (e) { alert(e.message) }
}

function formatExpiry(b) {
  if (!b.expiresAt) return '永久'
  const d = new Date(b.expiresAt)
  return d.toLocaleString('zh-CN')
}
</script>
