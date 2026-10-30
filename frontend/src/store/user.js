import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '@/api'

export const useUserStore = defineStore('user', () => {
  const token = ref(localStorage.getItem('cw_token') || '')
  const profile = ref(JSON.parse(localStorage.getItem('cw_user') || 'null'))

  const isLoggedIn = computed(() => !!token.value)
  // 管理员判定改为 rating >= 11（原 role==='admin' 字段已移除）
  const isAdmin = computed(() => (profile.value?.rating ?? 0) >= 11)

  /** 当前用户的 rating（平台权限等级），用于节点权限控制
   *  0=普通用户 8=协管 9=高级协管 11=管理员 12=超级管理员 */
  const rating = computed(() => profile.value?.rating ?? 0)

  /** 当前用户的 fsdLevel（FSD 协议等级），仅用于 FSD 连飞
   *  0=SUSPENDED 1=OBS 2=S1 3=S2 4=S3 5=C1 6=C2 7=C3 8=I1 9=I2 10=I3 11=SUP 12=ADM */
  const fsdLevel = computed(() => profile.value?.fsdLevel ?? 1)



  /** 当前用户的细分权限列表（逗号分隔） */
  const permissions = computed(() => (profile.value?.permissions || '').split(',').filter(Boolean))

  /** 检查当前用户是否满足最低 rating 要求 */
  function hasRating(minLevel = 0) {
    // 管理员(11)/超级管理员(12) 自动拥有所有权限
    if (rating.value >= 11) return true
    return rating.value >= minLevel
  }

  /** 检查当前用户是否有指定的细分权限 */
  function hasPermission(perm) {
    // 管理员(11)/超级管理员(12) 自动拥有所有权限
    if (rating.value >= 11) return true
    return permissions.value.includes(perm)
  }

  /** 检查当前用户是否有任意细分权限
   *  管理后台访问完全基于细分权限，不再依赖 rating */
  function hasAnyPermission() {
    return permissions.value.length > 0
  }

  const username = computed(() => profile.value?.username || '飞友')
  const cid = computed(() => profile.value?.cid || '---')

  function save() {
    if (token.value) localStorage.setItem('cw_token', token.value)
    else localStorage.removeItem('cw_token')
    if (profile.value) localStorage.setItem('cw_user', JSON.stringify(profile.value))
    else localStorage.removeItem('cw_user')
  }

  async function login(cidVal, password) {
    const res = await authApi.login({ cid: cidVal, password })
    // 新设备/IP 登录：后端要求邮箱验证码二次验证（needVerify 在响应顶层，未返回 token）
    if (res && res.needVerify) {
      return { needVerify: true, email: res.data?.email || '' }
    }
    token.value = res.data.token
    profile.value = res.data.user
    save()
    localStorage.setItem('cw_last_active', String(Date.now()))
    return res.data
  }

  /** 应用登录成功数据（二次验证通过后调用，签发 JWT） */
  function applyLogin(data) {
    token.value = data.token
    profile.value = data.user
    save()
    localStorage.setItem('cw_last_active', String(Date.now()))
  }

  async function register(data) {
    const res = await authApi.register(data)
    token.value = res.data.token
    profile.value = res.data.user
    save()
    localStorage.setItem('cw_last_active', String(Date.now()))
    return res.data
  }

  function logout() {
    token.value = ''
    profile.value = null
    save()
  }

  function setProfile(p) {
    profile.value = p
    save()
  }

  return { token, profile, isLoggedIn, isAdmin, rating, fsdLevel, permissions, hasRating, hasPermission, hasAnyPermission, username, cid, login, applyLogin, register, logout, setProfile }
})
