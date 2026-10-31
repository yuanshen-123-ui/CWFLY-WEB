<template>
  <div class="training-exam fade-in">
    <div class="page-header">
      <h1>考试</h1>
      <p>{{ exam?.title || '在线考核' }}</p>
    </div>

    <div v-if="!started" class="card p-lg text-center">
      <h3 class="mb-md">{{ exam?.title || '考试' }}</h3>
      <p class="text-muted mb-md">{{ exam?.description || '' }}</p>
      <p class="text-sm text-muted mb-md">题目数量: {{ exam?.questions?.length || 0 }}</p>
      <button class="btn btn-primary" @click="started = true" :disabled="!exam">开始考试</button>
    </div>

    <div v-else class="space-y-md">
      <div class="card p-lg" v-for="(q, i) in exam?.questions" :key="i">
        <h4 class="mb-sm">{{ i + 1 }}. {{ q.question }}</h4>
        <div v-for="(opt, j) in q.options" :key="j" class="option-item p-sm" :class="{ selected: answers[i] === j }" @click="answers[i] = j">
          <span class="radio-circle" :class="{ checked: answers[i] === j }"></span>
          <span>{{ opt }}</span>
        </div>
      </div>

      <div class="card p-lg text-center">
        <button class="btn btn-primary" @click="submitExam" :disabled="examLoading">
          {{ examLoading ? '提交中...' : '交卷' }}
        </button>
      </div>
    </div>

    <div v-if="result" class="card p-lg mt-md text-center">
      <h3>考试结果</h3>
      <p class="text-2xl font-bold" :class="result.passed ? 'text-green' : 'text-red'">{{ result.score }} 分</p>
      <p>{{ result.passed ? '✅ 通过' : '❌ 未通过' }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/api'

const route = useRoute()
const exam = ref(null)
const started = ref(false)
const answers = ref([])
const examLoading = ref(false)
const result = ref(null)

onMounted(async () => {
  try {
    const r = await api.get('/training/exams/' + route.params.examId)
    exam.value = r.data
    answers.value = new Array(r.data?.questions?.length || 0).fill(-1)
  } catch { /* ignore */ }
})

async function submitExam() {
  const unanswered = answers.value.indexOf(-1)
  if (unanswered !== -1) return alert('请回答所有题目')
  examLoading.value = true
  try {
    const r = await api.post('/training/exams/' + route.params.examId + '/submit', { answers: answers.value })
    result.value = r.data
  } catch (e) { alert('提交失败: ' + e.message) }
  finally { examLoading.value = false }
}
</script>

<style scoped>
.option-item { cursor:pointer;display:flex;align-items:center;gap:.5rem;border-radius:6px;transition:background .2s; }
.option-item:hover { background:var(--c-bg-hover); }
.option-item.selected { background:var(--c-bg-subtle); }
.radio-circle { width:16px;height:16px;border-radius:50%;border:2px solid var(--c-border);flex-shrink:0; }
.radio-circle.checked { border-color:var(--c-primary);background:var(--c-primary); }
.text-2xl { font-size:2rem; }
.text-green { color:var(--c-success); }
.text-red { color:var(--c-danger); }
</style>
