import { io } from 'socket.io-client'

let socket = null

// 从 localStorage 读取当前登录 token（socket 握手时带给后端用于身份认证）
function getToken() {
  try { return localStorage.getItem('cw_token') || '' } catch { return '' }
}

export function getSocket() {
  if (!socket) {
    socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: Infinity,
      auth: (cb) => cb({ token: getToken() })
    })
  }
  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
