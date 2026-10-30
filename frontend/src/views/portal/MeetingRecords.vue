<template>
  <div class="meetings fade-in">
    <div class="meetings__inner">
      <div class="page-header flex justify-between items-start flex-wrap gap-md">
        <div>
          <h1>会议记录</h1>
          <p>上传 PDF/Word 文档自动转为 HTML 查看</p>
        </div>
        <label class="btn btn-primary btn-sm" style="cursor:pointer;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          上传文档
          <input type="file" accept=".pdf,.doc,.docx" hidden @change="uploadFile" />
        </label>
      </div>

      <!-- 上传进度 -->
      <div v-if="uploading" class="card p-md mb-md">
        <div class="flex justify-between mb-sm"><span>上传中...</span><span class="text-muted">{{ uploadProgress }}%</span></div>
        <div style="height:4px;background:var(--c-border);border-radius:99px;overflow:hidden;">
          <div :style="{ width: uploadProgress+'%', height:'100%', background:'var(--c-primary)', transition:'width .3s' }"></div>
        </div>
      </div>

      <!-- 上传结果提示 -->
      <div v-if="message" class="card p-md mb-md" :class="messageType === 'success' ? 'msg-success' : 'msg-error'">
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-sm">
            <span v-if="messageType === 'success'" class="msg-icon">✓</span>
            <span v-else class="msg-icon">✕</span>
            <span>{{ message }}</span>
          </div>
          <button class="btn btn-outline btn-sm" @click="message = ''" style="font-size:16px;line-height:1;padding:2px 8px;border:none;">&times;</button>
        </div>
      </div>

      <!-- 会议列表 -->
      <div v-if="list.length" class="card">
        <div v-for="item in list" :key="item.id" class="meeting-item flex justify-between items-center p-md" style="border-bottom:1px solid var(--c-border-light);">
          <div class="flex-1">
            <div class="font-bold">{{ item.title }}</div>
            <div class="text-sm text-muted mt-sm">{{ item.date }} &middot; {{ item.size }}</div>
          </div>
          <button class="btn btn-outline btn-sm" @click="preview(item)">预览</button>
        </div>
      </div>
      <div v-else class="card p-lg text-center text-muted">
        暂无会议记录，点击右上角上传
      </div>

      <!-- 预览弹窗 -->
      <Teleport to="body">
        <div v-if="previewItem" class="modal-overlay" @click.self="previewItem=null">
          <div class="modal card">
            <div class="modal__header flex justify-between items-center p-md" style="border-bottom:1px solid var(--c-border-light);">
              <h3>{{ previewItem.title }}</h3>
              <button class="btn btn-outline btn-sm" @click="previewItem=null">&times;</button>
            </div>
            <div class="modal__body p-lg" v-html="sanitizeHtml(previewItem.content)"></div>
          </div>
        </div>
      </Teleport>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { meetingsApi } from '@/api'
import { sanitizeHtml } from '@/utils/sanitize'

const list = ref([])
const uploading = ref(false)
const uploadProgress = ref(0)
const previewItem = ref(null)
const message = ref('')
const messageType = ref('success')
let messageTimer = null

function preview(item) {
  previewItem.value = item
}

function showMessage(text, type = 'success') {
  message.value = text
  messageType.value = type
  if (messageTimer) clearTimeout(messageTimer)
  // 5 秒后自动消失，给用户充足的阅读时间
  messageTimer = setTimeout(() => { message.value = '' }, 5000)
}

onMounted(async () => {
  try {
    const res = await meetingsApi.list()
    list.value = res.data
  } catch { /* ignore */ }
})

async function uploadFile(e) {
  const file = e.target.files[0]
  if (!file) return
  // 清除之前的消息
  message.value = ''
  uploading.value = true
  uploadProgress.value = 0
  const fd = new FormData()
  fd.append('file', file)
  try {
    const res = await meetingsApi.upload(fd)
    uploadProgress.value = 100
    list.value.unshift(res.data)
    setTimeout(() => {
      uploading.value = false
      showMessage(`上传成功：${file.name}`)
    }, 500)
  } catch (err) {
    clearInterval(timer)
    uploading.value = false
    showMessage(err.message || '上传失败，请检查文件类型和大小（支持 PDF/DOC/DOCX，最大 20MB）', 'error')
  }
  e.target.value = ''
}
</script>

<style scoped>
.meetings__inner { max-width: 860px; margin: 0 auto; padding: 0 24px; }

.modal-overlay {
  position: fixed; inset: 0; z-index: 2000;
  background: rgba(0,0,0,.4);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}
.modal {
  width: 100%; max-width: 700px; max-height: 80vh;
  display: flex; flex-direction: column;
}
.modal__body { overflow-y: auto; }
.modal__body :deep(h1), .modal__body :deep(h2), .modal__body :deep(h3) { margin: 16px 0 8px; }
.modal__body :deep(p) { margin-bottom: 8px; line-height: 1.7; }
.modal__body :deep(img) { max-width: 100%; }

.msg-success {
  border-left: 4px solid var(--c-success, #30d158);
  background: rgba(48, 209, 88, 0.08);
}
.msg-error {
  border-left: 4px solid var(--c-danger, #ff453a);
  background: rgba(255, 69, 58, 0.08);
}
.msg-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  font-size: 12px;
  font-weight: bold;
  flex-shrink: 0;
}
.msg-success .msg-icon {
  background: var(--c-success, #30d158);
  color: #fff;
}
.msg-error .msg-icon {
  background: var(--c-danger, #ff453a);
  color: #fff;
}
</style>
