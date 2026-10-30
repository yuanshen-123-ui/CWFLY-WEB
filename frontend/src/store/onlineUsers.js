import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useOnlineUsersStore = defineStore('onlineUsers', () => {
  const count = ref(0)
  const users = ref([])

  function setOnlineCount(n) { count.value = n }
  function setOnlineList(list) { users.value = list }

  return { count, users, setOnlineCount, setOnlineList }
})
