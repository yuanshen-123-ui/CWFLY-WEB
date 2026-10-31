<script>
/**
 * PoW 人机验证（100% 隐身）
 *
 * 行为：
 * 1. 挂载后静默请求 /api/captcha/challenge
 * 2. 启动 Web Worker（src/workers/pow.worker.js，手写同步 SHA-256）算题
 * 3. 算完静默 POST /api/captcha/verify，成功则 emit('verified', token) 并存入内存
 * 4. 任何失败（网络/超时/校验失败）都静默退避重试，绝不打扰用户
 *
 * UI 铁律：本组件不渲染任何 HTML —— setup 返回 null 渲染函数。
 */
import { onMounted, onBeforeUnmount } from 'vue'
import { setPowToken } from '@/utils/pow'

const CHALLENGE_URL = '/api/captcha/challenge'
const VERIFY_URL = '/api/captcha/verify'
const SOLVE_TIMEOUT_MS = 20000 // 单次算题上限（超时视为失败，静默重来）
const RETRY_MIN_MS = 3000
const RETRY_MAX_MS = 8000
const REFRESH_MS = 8 * 60 * 1000 // 令牌 10 分钟，提前 2 分钟静默续算

export default {
  name: 'PoWCaptcha',
  emits: ['verified'],
  setup(props, { emit }) {
    let worker = null
    let disposed = false
    let retryTimer = null
    let solveTimer = null
    let refreshTimer = null
    let inFlight = false

    function stopWorker() {
      if (worker) {
        try {
          worker.terminate()
        } catch {
          /* ignore */
        }
        worker = null
      }
    }

    function clearRetry() {
      if (retryTimer) {
        clearTimeout(retryTimer)
        retryTimer = null
      }
    }

    function clearSolveTimer() {
      if (solveTimer) {
        clearTimeout(solveTimer)
        solveTimer = null
      }
    }

    /** 静默退避重试：不弹任何提示，只在后台重新取 challenge。 */
    function scheduleRetry() {
      if (disposed) return
      clearRetry()
      clearSolveTimer()
      stopWorker()
      const delay = RETRY_MIN_MS + Math.floor(Math.random() * (RETRY_MAX_MS - RETRY_MIN_MS))
      retryTimer = setTimeout(() => {
        retryTimer = null
        run()
      }, delay)
    }

    async function fetchChallenge() {
      const res = await fetch(CHALLENGE_URL, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) throw new Error('challenge http ' + res.status)
      const json = await res.json()
      const data = (json && json.data) || json
      if (!json || !json.success || !data || !data.challenge) throw new Error('challenge invalid')
      return {
        challenge: String(data.challenge),
        difficulty: Number(data.difficulty || 4),
      }
    }

    async function submitAnswer(challenge, nonce) {
      const res = await fetch(VERIFY_URL, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ challenge, nonce }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json || !json.success || !json.token) throw new Error('verify failed')
      return String(json.token)
    }

    function startSolve(data) {
      stopWorker()
      let settled = false
      const finish = (ok) => {
        if (settled) return
        settled = true
        clearSolveTimer()
        if (!ok) scheduleRetry()
      }

      try {
        worker = new Worker(new URL('../workers/pow.worker.js', import.meta.url), {
          type: 'module',
        })
      } catch {
        finish(false)
        return
      }

      solveTimer = setTimeout(() => finish(false), SOLVE_TIMEOUT_MS)

      worker.onmessage = async (event) => {
        const msg = event.data || {}
        if (msg.type === 'solved' && msg.nonce !== undefined && msg.nonce !== null) {
          clearSolveTimer()
          try {
            const token = await submitAnswer(data.challenge, String(msg.nonce))
            if (disposed) return
            settled = true
            setPowToken(token)
            emit('verified', token)
          } catch {
            finish(false)
          }
          return
        }
        if (msg.type === 'error') finish(false)
      }
      worker.onerror = () => finish(false)

      worker.postMessage({
        type: 'solve',
        challenge: data.challenge,
        difficulty: data.difficulty,
      })
    }

    async function run() {
      if (disposed || inFlight) return
      inFlight = true
      try {
        const data = await fetchChallenge()
        if (disposed) return
        startSolve(data)
      } catch {
        scheduleRetry()
      } finally {
        inFlight = false
      }
    }

    onMounted(() => {
      run()
      // 令牌会过期：静默重新算一次，不做任何界面提示
      refreshTimer = setInterval(() => {
        if (!disposed) run()
      }, REFRESH_MS)
    })

    onBeforeUnmount(() => {
      disposed = true
      clearRetry()
      clearSolveTimer()
      if (refreshTimer) {
        clearInterval(refreshTimer)
        refreshTimer = null
      }
      stopWorker()
    })

    // 不渲染任何 DOM 结构
    return () => null
  },
}
</script>
