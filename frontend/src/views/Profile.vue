<template>
  <div class="profile fade-in">
    <div class="page-header">
      <h1>个人中心</h1>
      <p>管理您的账号信息</p>
    </div>

    <!-- 头像 -->
    <div class="card p-lg mb-lg">
      <h3 class="mb-md">头像</h3>
      <div class="flex items-center gap-md">
        <div class="avatar-preview">
          <img :src="avatarUrl || defaultAvatar" class="avatar-img" />
        </div>
        <div>
          <input type="file" accept="image/*" ref="fileInput" style="display:none;" @change="uploadAvatar" />
          <button class="btn btn-primary btn-sm" @click="$refs.fileInput.click()" :disabled="uploading">{{ uploading ? '上传中...' : '上传头像' }}</button>
          <button class="btn btn-outline btn-sm ml-sm" @click="deleteAvatar" :disabled="!profileData?.avatar">删除头像</button>
          <p class="text-xs text-muted mt-sm">支持 JPG/PNG，最大 5MB。绑定QQ后可通过删除头像按钮使用QQ头像</p>
        </div>
      </div>
    </div>

    <!-- 基本信息 -->
    <div class="card p-lg mb-lg">
      <h3 class="mb-md">基本信息</h3>
      <div class="profile-info">
        <div class="profile-row"><span class="text-muted">CID</span><span class="font-bold">{{ user.cid }}</span></div>
        <div class="profile-row"><span class="text-muted">用户名</span><span>{{ user.username }}</span></div>
        <div class="profile-row"><span class="text-muted">注册时间</span><span>{{ formatDate(profileData?.createdAt || user.profile?.createdAt) }}</span></div>
        <div class="profile-row"><span class="text-muted">权限等级</span><span class="badge" :class="ratingBadge(profileData?.rating ?? 0)">{{ ratingName(profileData?.rating ?? 0) }}</span></div>
        <div class="profile-row"><span class="text-muted">FSD 权限</span><span class="fsd-level-badge">{{ fsdLevelName(profileData?.fsdLevel ?? 1) }}</span></div>

      </div>
    </div>

    <!-- 绑定信息 -->
    <div class="card p-lg mb-lg">
      <h3 class="mb-md">绑定设置</h3>
      <div style="max-width:400px;">
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">邮箱</label>
          <div class="flex gap-sm">
            <input v-model="bind.email" class="input" placeholder="绑定邮箱" style="flex:1;" />
            <button class="btn btn-outline btn-sm" @click="sendVerifyCode" :disabled="codeSending">{{ codeSending ? '发送中' : '发送验证码' }}</button>
          </div>
          <div v-if="showVerifyInput" class="flex gap-sm mt-sm">
            <input v-model="bind.verifyCode" class="input" placeholder="输入验证码" style="flex:1;" />
            <button class="btn btn-primary btn-sm" @click="verifyEmail" :disabled="verifyLoading">{{ verifyLoading ? '验证中' : '验证' }}</button>
          </div>
        </div>
        <div class="mb-md">
          <label class="text-sm font-bold mb-sm" style="display:block;">QQ</label>
          <input v-model="bind.qq" class="input" placeholder="绑定 QQ 号（自动获取QQ头像）" />
        </div>
        <button class="btn btn-primary btn-sm" @click="saveBind" :disabled="bindLoading">{{ bindLoading ? '保存中...' : '保存绑定' }}</button>
        <p v-if="bindMsg" class="text-sm mt-sm" :style="{ color: bindMsgType === 'ok' ? 'var(--c-success)' : 'var(--c-danger)' }">{{ bindMsg }}</p>
      </div>
    </div>

    <!-- 自定义背景图 -->
    <div class="card p-lg mb-lg">
      <h3 class="mb-md">自定义背景图</h3>
      <p class="text-sm text-muted mb-md">上传一张图片作为平台的全局背景（支持 JPG/PNG，最大 10MB）</p>
      <div class="flex items-center gap-md flex-wrap">
        <div class="bg-preview" v-if="currentBg">
          <img :src="currentBg" style="width:100%;max-height:150px;object-fit:cover;border-radius:8px;" />
        </div>
        <div>
          <input type="file" accept="image/*" ref="bgFileInput" style="display:none;" @change="uploadBgImage" />
          <button class="btn btn-primary btn-sm" @click="$refs.bgFileInput.click()" :disabled="bgUploading">{{ bgUploading ? '上传中...' : '上传背景图' }}</button>
          <button v-if="profileData?.bgImage" class="btn btn-outline btn-sm ml-sm" @click="resetBgImage" :disabled="bgUploading">恢复默认</button>
          <p v-if="bgMsg" class="text-sm mt-sm" :style="{ color: bgMsgType === 'ok' ? 'var(--c-success)' : 'var(--c-danger)' }">{{ bgMsg }}</p>
        </div>
      </div>
    </div>

    <!-- 修改密码 -->
    <div class="card p-lg">
      <h3 class="mb-md">修改密码</h3>
      <div style="max-width:360px;">
        <div class="mb-md"><input v-model="pwd.old" class="input" type="password" placeholder="当前密码" /></div>
        <div class="mb-md"><input v-model="pwd.newP" class="input" type="password" placeholder="新密码" /></div>
        <div class="mb-md"><input v-model="pwd.confirm" class="input" type="password" placeholder="确认新密码" /></div>
        <button class="btn btn-primary" @click="changePwd" :disabled="pwdLoading">{{ pwdLoading ? '修改中...' : '修改密码' }}</button>
        <p v-if="pwdMsg" class="text-sm mt-sm" :style="{ color: pwdMsgType === 'ok' ? 'var(--c-success)' : 'var(--c-danger)' }">{{ pwdMsg }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useUserStore } from '@/store/user'
import { profileApi } from '@/api'
import api from '@/api'

const user = useUserStore()
const fileInput = ref(null)
const uploading = ref(false)
const profileData = ref(null)
const defaultAvatar = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="#ccc"><circle cx="12" cy="8" r="4"/><path d="M12 14c-4 0-6 2-6 4v2h12v-2c0-2-2-4-6-4z"/></svg>')

const avatarUrl = computed(() => profileData.value?.avatar ? profileData.value.avatar : null)

const bind = reactive({ email: '', qq: '', verifyCode: '' })
const bindLoading = ref(false)
const bindMsg = ref('')
const bindMsgType = ref('ok')
const showVerifyInput = ref(false)
const codeSending = ref(false)
const verifyLoading = ref(false)

const pwd = ref({ old: '', newP: '', confirm: '' })
const pwdLoading = ref(false)
const pwdMsg = ref('')
const pwdMsgType = ref('ok')

// 自定义背景图
const bgFileInput = ref(null)
const bgUploading = ref(false)
const bgMsg = ref('')
const bgMsgType = ref('ok')
const currentBg = computed(() => profileData.value?.bgImage ? getBgUrl(profileData.value.bgImage) : null)

// FSD 等级映射与用户管理页一致（以用户管理页为准）：
// 0=飞行员 1=观察员 2=地面/放行S1 3=塔台S2 4=终端S3 5=区域C1 6=区域C2 7=区域C3
// 8=塔台教员I1 9=进近教员I2 10=区域教员I3 11=SUP 12=ADM
const FSD_LEVEL_NAMES = {
  0: '飞行员', 1: '观察员', 2: '地面/放行 S1', 3: '塔台 S2',
  4: '终端 S3', 5: '区域 C1', 6: '区域 C2', 7: '区域 C3',
  8: '塔台教员 I1', 9: '进近教员 I2', 10: '区域教员 I3',
  11: 'SUP', 12: 'ADM'
}
function fsdLevelName(level) { return FSD_LEVEL_NAMES[level] || `未知(${level})` }

// 权限等级名称/徽章（与用户管理一致）
const RATING_NAMES = { 0: '普通用户', 8: '协管员', 9: '高级协管员', 11: '管理员', 12: '超级管理员' }
function ratingName(level) { return RATING_NAMES[level] || `未知(${level})` }
function ratingBadge(level) { return level >= 11 ? 'badge-danger' : level >= 8 ? 'badge-warning' : 'badge-default' }

// 日期格式化：只显示 YYYY-MM-DD（本地时区）
function formatDate(v) {
  if (!v) return '未知'
  const d = new Date(v)
  if (isNaN(d.getTime())) return String(v)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

onMounted(async () => {
  try {
    const res = await profileApi.get()
    profileData.value = res.data
    bind.email = res.data.email || ''
    bind.qq = res.data.qq || ''
    applyBg(res.data.bgImage)
  } catch {}
})

async function uploadAvatar(e) {
  const file = e.target.files[0]
  if (!file) return
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('avatar', file)
    const res = await api.post('/profile/avatar', fd, { headers: { 'Content-Type': undefined } })
    profileData.value.avatar = res.data.avatar
  } catch (e) { alert('上传失败: ' + e.message) }
  finally { uploading.value = false }
}

// 背景图相关
function getBgUrl(url) {
  return url ? url + '?t=' + Date.now() : ''
}
function applyBg(url) {
  const bg = getBgUrl(url)
  if (bg) {
    document.documentElement.style.setProperty('--custom-bg', `url(${JSON.stringify(bg)})`)
  } else {
    document.documentElement.style.removeProperty('--custom-bg')
  }
  // 通知 App.vue 的背景层做 3 秒渐变显示
  window.dispatchEvent(new CustomEvent('cw:custom-bg', { detail: bg }))
}

async function uploadBgImage(e) {
  const file = e.target.files[0]
  if (!file) return
  bgUploading.value = true
  bgMsg.value = ''
  try {
    const fd = new FormData()
    fd.append('bgImage', file)
    const res = await api.post('/profile/bg-image', fd, { headers: { 'Content-Type': undefined } })
    profileData.value.bgImage = res.data.bgImage
    applyBg(res.data.bgImage)
    bgMsg.value = '背景图已更新'
    bgMsgType.value = 'ok'
  } catch (e) {
    bgMsg.value = '上传失败: ' + (e.response?.data?.message || e.message)
    bgMsgType.value = 'err'
  } finally { bgUploading.value = false }
}

async function resetBgImage() {
  bgUploading.value = true
  try {
    await api.delete('/profile/bg-image')
    profileData.value.bgImage = ''
    applyBg('')
    bgMsg.value = '已恢复默认背景'
    bgMsgType.value = 'ok'
  } catch (e) {
    bgMsg.value = '操作失败: ' + e.message
    bgMsgType.value = 'err'
  } finally { bgUploading.value = false }
}

async function deleteAvatar() {
  if (!confirm('确定删除头像？' + (bind.qq ? '绑定QQ后将使用QQ头像' : ''))) return
  try {
    // 如果绑定了QQ，使用QQ头像覆盖；否则清除
    const newAvatar = bind.qq ? `https://q1.qlogo.cn/g?b=qq&nk=${bind.qq}&s=100` : ''
    await profileApi.updateInfo({ avatar: newAvatar })
    profileData.value.avatar = newAvatar
  } catch (e) { alert('操作失败: ' + e.message) }
}

async function sendVerifyCode() {
  if (!bind.email) return alert('请先输入邮箱')
  codeSending.value = true
  bindMsg.value = ''
  try {
    const res = await api.post('/profile/send-verify', { email: bind.email })
    bindMsg.value = '验证码已发送'
    bindMsgType.value = 'ok'
    showVerifyInput.value = true
  } catch (e) {
    bindMsg.value = '发送失败: ' + e.message
    bindMsgType.value = 'err'
  } finally { codeSending.value = false }
}

async function verifyEmail() {
  if (!bind.verifyCode) return alert('请输入验证码')
  verifyLoading.value = true
  try {
    await api.post('/profile/verify-email', { email: bind.email, code: bind.verifyCode })
    bindMsg.value = '邮箱验证成功'
    bindMsgType.value = 'ok'
    showVerifyInput.value = false
    bind.verifyCode = ''
    profileData.value.email = bind.email
  } catch (e) {
    bindMsg.value = '验证失败: ' + e.message
    bindMsgType.value = 'err'
  } finally { verifyLoading.value = false }
}

async function saveBind() {
  bindLoading.value = true
  bindMsg.value = ''
  try {
    // 邮箱已通过「发送验证码+验证」(verify-email) 流程单独保存,
    // 后端已禁止 PUT /info 改邮箱(安全加固), 此处仅提交 QQ 等其他字段
    const res = await profileApi.updateInfo({ qq: bind.qq })
    bindMsg.value = '绑定信息已保存'
    bindMsgType.value = 'ok'
    profileData.value = res.data
    // 如果绑定了QQ且没有自定义头像，自动用QQ头像
    if (bind.qq && !profileData.value?.avatar?.startsWith('/uploads')) {
      profileData.value.avatar = `https://q1.qlogo.cn/g?b=qq&nk=${bind.qq}&s=100`
    }
  } catch (e) { alert('保存失败: ' + e.message) }
  finally { bindLoading.value = false }
}

async function changePwd() {
  if (pwd.value.newP !== pwd.value.confirm) { pwdMsg.value = '两次密码不一致'; pwdMsgType.value = 'err'; return }
  pwdLoading.value = true
  try {
    await profileApi.update({ oldPassword: pwd.value.old, newPassword: pwd.value.newP })
    pwdMsg.value = '密码修改成功'
    pwdMsgType.value = 'ok'
    pwd.value = { old: '', newP: '', confirm: '' }
  } catch (e) {
    pwdMsg.value = e.message
    pwdMsgType.value = 'err'
  } finally {
    pwdLoading.value = false
  }
}
</script>

<style scoped>
.profile-info { max-width: 480px; }
.profile-row {
  display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px;
  padding: 10px 0; border-bottom: 1px solid var(--c-border-light);
  font-size: 14px;
}
.profile-row:last-child { border-bottom: none; }
.avatar-preview { width:80px;height:80px;border-radius:50%;overflow:hidden;border:3px solid var(--c-border);flex-shrink:0; }
.avatar-img { width:100%;height:100%;object-fit:cover; }
.rating-value {
  font-weight: 700;
  color: var(--c-primary);
  background: var(--c-bg);
  padding: 0 10px;
  border-radius: 10px;
  font-size: 14px;
}
.fsd-level-badge {
  font-weight: 600;
  color: var(--c-primary);
  background: #e3f2fd;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 13px;
}
.fsd-type-badge {
  font-weight: 600;
  color: #e65100;
  background: #fff3e0;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 13px;
}
</style>
