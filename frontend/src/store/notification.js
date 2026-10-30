import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useNotificationStore = defineStore('notification', () => {
  const messages = ref([])
  let nextId = 1

  function add(type, text, duration = 4000) {
    const id = nextId++
    messages.value.push({ id, type, text })
    if (duration > 0) {
      setTimeout(() => remove(id), duration)
    }
    return id
  }

  function remove(id) {
    messages.value = messages.value.filter(m => m.id !== id)
  }

  function success(text) { return add('success', text) }
  function error(text) { return add('error', text) }
  function info(text) { return add('info', text) }
  function warning(text) { return add('warning', text) }

  return { messages, add, remove, success, error, info, warning }
})
