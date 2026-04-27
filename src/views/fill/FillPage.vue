<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import {
  collection, query, where, getDocs, addDoc, doc, getDoc,
} from 'firebase/firestore'
import { db } from '@/firebase/config'
import { setLocale, SUPPORTED_LOCALES } from '@/i18n'
import type { Session, Template, Question, Answer, Response } from '@/types'

const route = useRoute()
const { t, locale } = useI18n()

// ── State ──────────────────────────────────────────────────────
type Step = 'lang' | 'identity' | 'fill' | 'done'
const step = ref<Step>('lang')
const loading = ref(true)
const submitting = ref(false)
const error = ref('')

const session = ref<Session | null>(null)
const template = ref<Template | null>(null)
const projectTitle = ref('')

// Identity
const identity = reactive({ company: '', name: '', email: '' })

// Answers  { questionId -> value }
const answers = ref<Record<string, string | string[]>>({})

// Timer
const timeLimit = ref(0)  // seconds, 0 = no limit
const timeLeft = ref(0)
let timerInterval: ReturnType<typeof setInterval> | null = null

// Quiz result
const quizResult = ref<{ score: number; total: number; answers: Answer[] } | null>(null)

// ── Load Session ───────────────────────────────────────────────
onMounted(async () => {
  const token = route.params.token as string
  try {
    // Find session by shareToken
    const snaps = await getDocs(
      query(collection(db, '__collectionGroup__sessions'), where('shareToken', '==', token))
    )
    // Firestore doesn't support collectionGroup directly in client like this,
    // so we use a dedicated sessions top-level index
    const idxSnap = await getDocs(
      query(collection(db, 'sessions_index'), where('shareToken', '==', token))
    )

    let sessionData: Session | null = null
    let projectId = ''

    if (!idxSnap.empty) {
      const idx = idxSnap.docs[0].data()
      projectId = idx.projectId
      const sSnap = await getDoc(doc(db, 'projects', projectId, 'sessions', idx.sessionId))
      if (sSnap.exists()) sessionData = { id: sSnap.id, ...sSnap.data() } as Session
    }

    if (!sessionData) {
      error.value = '找不到此問卷，請確認連結是否正確'
      loading.value = false
      return
    }
    if (sessionData.status === 'closed') {
      error.value = '此問卷已結束，感謝您的參與'
      loading.value = false
      return
    }
    if (sessionData.status === 'draft') {
      error.value = '此問卷尚未開放填答'
      loading.value = false
      return
    }

    session.value = sessionData

    // Set locale to session language
    setLocale(sessionData.language as any)

    // Load template
    if (sessionData.templateId) {
      const tSnap = await getDoc(doc(db, 'templates', sessionData.templateId))
      if (tSnap.exists()) template.value = { id: tSnap.id, ...tSnap.data() } as Template
    }

    // Load project title
    const pSnap = await getDoc(doc(db, 'projects', projectId))
    if (pSnap.exists()) projectTitle.value = pSnap.data().title

  } catch (e: any) {
    error.value = '載入失敗：' + e.message
  } finally {
    loading.value = false
  }
})

// ── Start Filling ──────────────────────────────────────────────
async function startFill() {
  if (!identity.company.trim()) return ElMessage.error(t('fill.company') + '為必填')
  if (!identity.name.trim()) return ElMessage.error(t('fill.name') + '為必填')
  if (!identity.email.trim() || !identity.email.includes('@')) return ElMessage.error('請輸入有效的 Email')

  // Check duplicate
  const dup = await getDocs(
    query(
      collection(db, 'responses'),
      where('sessionId', '==', session.value!.id),
      where('respondentEmail', '==', identity.email.toLowerCase().trim()),
    )
  )
  if (!dup.empty) {
    error.value = t('fill.duplicateEmail')
    return
  }

  step.value = 'fill'

  // Init answers
  const lang = locale.value
  answers.value = {}
  template.value?.questions.forEach(q => {
    if (q.type === 'multiple') answers.value[q.id] = []
    else if (q.type === 'scale') answers.value[q.id] = ''
    else answers.value[q.id] = ''
  })
}

// ── Progress ───────────────────────────────────────────────────
const totalQ = computed(() => template.value?.questions.length || 0)
const answeredQ = computed(() =>
  Object.values(answers.value).filter(v => Array.isArray(v) ? v.length > 0 : !!v).length
)
const progress = computed(() => totalQ.value ? Math.round((answeredQ.value / totalQ.value) * 100) : 0)

// ── Submit ─────────────────────────────────────────────────────
async function handleSubmit() {
  if (!template.value) return

  // Validate required
  for (const q of template.value.questions) {
    if (!q.required) continue
    const ans = answers.value[q.id]
    if (!ans || (Array.isArray(ans) && ans.length === 0)) {
      return ElMessage.error(`第 ${template.value.questions.indexOf(q) + 1} 題為必填`)
    }
  }

  submitting.value = true
  if (timerInterval) clearInterval(timerInterval)

  // Build answer list & calculate score
  const answerList: Answer[] = []
  let score = 0
  let total = 0

  for (const q of template.value.questions) {
    const val = answers.value[q.id]
    let isCorrect: boolean | undefined

    if (template.value.type === 'quiz' && q.type !== 'text') {
      if (q.type === 'multiple') {
        const correct = Array.isArray(q.correctAnswer) ? [...q.correctAnswer].sort() : []
        const given = Array.isArray(val) ? [...val].sort() : []
        isCorrect = JSON.stringify(correct) === JSON.stringify(given)
      } else {
        isCorrect = val === q.correctAnswer
      }
      if (isCorrect) score += q.score || 5
      total += q.score || 5
    }

    answerList.push({ questionId: q.id, value: val, isCorrect })
  }

  try {
    const responseData: Omit<Response, 'id'> = {
      sessionId: session.value!.id,
      projectId: session.value!.projectId,
      company: identity.company.trim(),
      respondentName: identity.name.trim(),
      respondentEmail: identity.email.toLowerCase().trim(),
      submittedAt: new Date().toISOString(),
      timeSpent: 0,
      score: template.value.type === 'quiz' ? score : undefined,
      totalScore: template.value.type === 'quiz' ? total : undefined,
      answers: answerList,
    }

    await addDoc(collection(db, 'responses'), responseData)

    if (template.value.type === 'quiz') {
      quizResult.value = { score, total, answers: answerList }
    }
    step.value = 'done'
  } catch (e: any) {
    ElMessage.error('提交失敗：' + e.message)
  } finally {
    submitting.value = false
  }
}

// ── Helpers ────────────────────────────────────────────────────
function getQText(q: Question) {
  return q.text[locale.value] || q.text['zh-TW'] || Object.values(q.text)[0] || ''
}
function getOptions(q: Question) {
  return q.options?.[locale.value] || q.options?.['zh-TW'] || Object.values(q.options || {})[0] || []
}
function getExplanation(q: Question) {
  return q.explanation?.[locale.value] || q.explanation?.['zh-TW'] || ''
}

const passThreshold = 0.6
const isPassed = computed(() =>
  quizResult.value ? quizResult.value.score / quizResult.value.total >= passThreshold : false
)
</script>

<template>
  <div class="fill-page">
    <!-- Header -->
    <header class="fill-header">
      <div class="fill-header-inner">
        <div class="header-logo">
          <img src="https://cc-sustain.com/wp-content/uploads/2024/01/成創LOGO_工作區域-1_0.png"
            alt="CCS" style="height:36px;object-fit:contain"
            @error="(e) => (e.target as HTMLImageElement).style.display='none'" />
        </div>
        <div class="header-title">{{ projectTitle }}</div>
        <el-select :model-value="locale" size="small" style="width:110px"
          @change="(v: string) => setLocale(v as any)">
          <el-option v-for="l in SUPPORTED_LOCALES" :key="l.code" :value="l.code" :label="`${l.flag} ${l.code}`" />
        </el-select>
      </div>
    </header>

    <div class="fill-body">
      <!-- Loading -->
      <div v-if="loading" class="fill-center">
        <el-icon class="is-loading" size="48" color="var(--ccs-blue)"><Loading /></el-icon>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="fill-center">
        <div class="ccs-card" style="text-align:center;max-width:480px;width:100%">
          <el-icon size="48" color="var(--ccs-orange)" style="margin-bottom:12px"><Warning /></el-icon>
          <p style="font-size:1.1rem;color:var(--ccs-navy);font-weight:600">{{ error }}</p>
        </div>
      </div>

      <!-- Step: Language -->
      <div v-else-if="step === 'lang'" class="fill-center">
        <div class="ccs-card fill-card">
          <div class="fill-logo-area">
            <img src="https://cc-sustain.com/wp-content/uploads/2024/01/成創LOGO_工作區域-1_0.png"
              alt="CCS" style="max-height:70px;object-fit:contain"
              @error="(e) => (e.target as HTMLImageElement).style.display='none'" />
          </div>
          <h2 style="text-align:center;margin-bottom:8px">{{ projectTitle }}</h2>
          <p style="text-align:center;color:#aaa;margin-bottom:24px">{{ session?.name }}</p>
          <p style="text-align:center;font-weight:600;margin-bottom:16px">{{ $t('fill.step1') }}</p>
          <div class="lang-grid">
            <button v-for="l in SUPPORTED_LOCALES" :key="l.code"
              class="lang-btn" :class="{ active: locale === l.code }"
              @click="setLocale(l.code)">
              <span style="font-size:1.5rem">{{ l.flag }}</span>
              <span>{{ l.label }}</span>
            </button>
          </div>
          <el-button type="primary" size="large" style="width:100%;margin-top:24px" @click="step = 'identity'">
            {{ $t('common.next') }}
          </el-button>
        </div>
      </div>

      <!-- Step: Identity -->
      <div v-else-if="step === 'identity'" class="fill-center">
        <div class="ccs-card fill-card">
          <h2 style="margin-bottom:20px">{{ $t('fill.step2') }}</h2>
          <el-form label-position="top">
            <el-form-item :label="$t('fill.company')" required>
              <el-input v-model="identity.company" size="large" :placeholder="$t('fill.companyPlaceholder')" />
            </el-form-item>
            <el-form-item :label="$t('fill.name')" required>
              <el-input v-model="identity.name" size="large" :placeholder="$t('fill.namePlaceholder')" />
            </el-form-item>
            <el-form-item :label="$t('fill.email')" required>
              <el-input v-model="identity.email" size="large" type="email" :placeholder="$t('fill.emailPlaceholder')" />
            </el-form-item>
          </el-form>
          <div style="display:flex;gap:12px;margin-top:8px">
            <el-button @click="step = 'lang'" style="flex:1">{{ $t('common.back') }}</el-button>
            <el-button type="primary" size="large" style="flex:2" @click="startFill">
              {{ template?.type === 'quiz' ? $t('fill.startQuiz') : $t('fill.startSurvey') }}
            </el-button>
          </div>
        </div>
      </div>

      <!-- Step: Fill -->
      <div v-else-if="step === 'fill'" class="fill-fill-area">
        <!-- Progress Bar -->
        <div class="progress-bar-wrap">
          <el-progress :percentage="progress" :stroke-width="6"
            :color="[{ color: '#E53E3E', percentage: 30 }, { color: 'var(--ccs-orange)', percentage: 70 }, { color: 'var(--ccs-teal)', percentage: 100 }]" />
          <span style="font-size:0.82rem;color:#aaa">{{ $t('fill.progress') }}: {{ answeredQ }}/{{ totalQ }}</span>
        </div>

        <!-- Questions -->
        <div v-if="template" class="questions-wrap">
          <div v-for="(q, idx) in template.questions" :key="q.id" class="q-fill-card ccs-card">
            <div class="q-fill-num">Q{{ idx + 1 }}<span v-if="q.required" style="color:#E53E3E"> *</span></div>
            <p class="q-fill-text">{{ getQText(q) }}</p>

            <!-- Single Choice -->
            <el-radio-group v-if="q.type === 'single'" :model-value="answers[q.id] as string" @update:model-value="(v: string | number | boolean | undefined) => answers[q.id] = String(v ?? '')" class="option-group">
              <el-radio v-for="(opt, oIdx) in getOptions(q)" :key="oIdx" :value="String(oIdx)" class="fill-option">
                {{ opt }}
              </el-radio>
            </el-radio-group>

            <!-- Multiple Choice -->
            <div v-else-if="q.type === 'multiple'" class="option-group">
              <el-checkbox
                v-for="(opt, oIdx) in getOptions(q)" :key="oIdx"
                :model-value="(answers[q.id] as string[]).includes(String(oIdx))"
                @change="(v: string | number | boolean) => {
                  const arr = answers[q.id] as string[]
                  const key = String(oIdx)
                  v ? arr.push(key) : arr.splice(arr.indexOf(key), 1)
                }"
                class="fill-option"
              >{{ opt }}</el-checkbox>
            </div>

            <!-- Scale -->
            <div v-else-if="q.type === 'scale'" class="scale-group">
              <button
                v-for="n in 5" :key="n"
                class="scale-btn"
                :class="{ active: answers[q.id] === String(n) }"
                :style="{
                  '--scale-color': n <= 2 ? '#E53E3E' : n === 3 ? 'var(--ccs-orange)' : 'var(--ccs-teal)'
                }"
                @click="answers[q.id] = String(n)"
              >
                <span class="scale-num">{{ n }}</span>
                <span class="scale-label">{{ $t(`fill.scaleLabels.${n}`) }}</span>
              </button>
            </div>

            <!-- Text -->
            <el-input v-else-if="q.type === 'text'"
              v-model="(answers[q.id] as string)"
              type="textarea" :rows="3"
              placeholder="請輸入您的回覆..."
            />
          </div>
        </div>

        <!-- Submit -->
        <div style="text-align:center;padding:24px 0">
          <el-button type="success" size="large" :loading="submitting"
            style="min-width:200px;height:52px;font-size:1rem;border-radius:10px"
            @click="handleSubmit">
            {{ template?.type === 'quiz' ? $t('fill.submitQuiz') : $t('fill.submitSurvey') }}
          </el-button>
        </div>
      </div>

      <!-- Step: Done -->
      <div v-else-if="step === 'done'" class="fill-center">
        <!-- Survey Done -->
        <div v-if="template?.type === 'survey'" class="ccs-card fill-card" style="text-align:center">
          <div style="font-size:4rem;margin-bottom:16px">🎉</div>
          <h2 style="color:var(--ccs-teal)">{{ $t('fill.surveyThanks') }}</h2>
          <p style="color:#777;margin-top:8px">{{ $t('fill.surveyThanksDesc') }}</p>
          <p style="margin-top:16px;font-size:0.9rem;color:#aaa">{{ identity.company }} — {{ identity.name }}</p>
        </div>

        <!-- Quiz Done -->
        <div v-else-if="template?.type === 'quiz' && quizResult" class="ccs-card fill-card">
          <div style="text-align:center;margin-bottom:24px">
            <div class="quiz-score-circle" :style="{ borderColor: isPassed ? 'var(--ccs-teal)' : 'var(--ccs-orange)' }">
              <div class="score-num" :style="{ color: isPassed ? 'var(--ccs-teal)' : 'var(--ccs-orange)' }">
                {{ quizResult.score }}
              </div>
              <div class="score-total">/ {{ quizResult.total }}</div>
            </div>
            <h2 :style="{ color: isPassed ? 'var(--ccs-teal)' : 'var(--ccs-orange)', marginTop:'16px' }">
              {{ isPassed ? $t('fill.quizPassed') : $t('fill.quizFailed') }}
            </h2>
            <p style="color:#aaa;margin-top:4px">{{ identity.company }} — {{ identity.name }}</p>
          </div>

          <!-- Answer Review -->
          <div v-for="(q, idx) in template.questions" :key="q.id" class="result-q">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span class="q-fill-num" style="font-size:0.8rem;padding:2px 8px">Q{{ idx + 1 }}</span>
              <el-tag v-if="quizResult.answers[idx]?.isCorrect !== undefined"
                :type="quizResult.answers[idx].isCorrect ? 'success' : 'danger'" size="small">
                {{ quizResult.answers[idx].isCorrect ? '✓ 正確' : '✗ 錯誤' }}
              </el-tag>
            </div>
            <p style="font-weight:600;margin-bottom:4px">{{ getQText(q) }}</p>
            <p style="font-size:0.85rem;color:#777">
              你的作答：{{ Array.isArray(quizResult.answers[idx]?.value)
                ? (quizResult.answers[idx].value as string[]).map(i => getOptions(q)[+i]).join('、')
                : (q.type !== 'text' ? getOptions(q)[+(quizResult.answers[idx]?.value || 0)] : quizResult.answers[idx]?.value)
              }}
            </p>
            <p v-if="getExplanation(q)" style="font-size:0.82rem;color:var(--ccs-teal);margin-top:4px">
              💡 {{ getExplanation(q) }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <footer class="fill-footer">
      © 2024 成創永續股份有限公司 | cc-sustain.com
    </footer>
  </div>
</template>

<style scoped>
.fill-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--ccs-bg);
}

/* Header */
.fill-header {
  background: #fff;
  border-bottom: 1px solid var(--ccs-border);
  box-shadow: var(--ccs-shadow-sm);
  position: sticky; top: 0; z-index: 50;
}
.fill-header-inner {
  max-width: 760px;
  margin: 0 auto;
  padding: 12px 24px;
  display: flex; align-items: center; gap: 16px;
}
.header-logo { flex-shrink: 0; }
.header-title { flex: 1; font-weight: 600; color: var(--ccs-navy); font-size: 1rem; }

/* Body */
.fill-body { flex: 1; padding: 32px 16px; }
.fill-center {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 20px;
}
.fill-card {
  width: 100%; max-width: 520px;
  padding: 36px 32px;
}
.fill-logo-area {
  display: flex; justify-content: center;
  margin-bottom: 20px;
  height: 70px;
  align-items: center;
}

/* Language */
.lang-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.lang-btn {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 16px; border-radius: 10px;
  border: 2px solid var(--ccs-border);
  background: #fff; cursor: pointer;
  font-size: 0.9rem; color: var(--ccs-text);
  transition: all 0.2s;
}
.lang-btn:hover { border-color: var(--ccs-blue); }
.lang-btn.active { border-color: var(--ccs-blue); background: #EBF2FA; font-weight: 600; }

/* Fill area */
.fill-fill-area { max-width: 760px; margin: 0 auto; width: 100%; }
.progress-bar-wrap {
  background: #fff;
  border-radius: 10px;
  padding: 12px 20px;
  margin-bottom: 20px;
  border: 1px solid var(--ccs-border);
  display: flex; align-items: center; gap: 16px;
}

/* Q Cards */
.q-fill-card { margin-bottom: 16px; }
.q-fill-num {
  display: inline-block;
  background: var(--ccs-blue); color: #fff;
  border-radius: 6px; padding: 2px 10px;
  font-weight: 700; font-size: 0.85rem;
  margin-bottom: 8px;
}
.q-fill-text {
  font-size: 1rem; font-weight: 600;
  color: var(--ccs-navy); margin-bottom: 14px;
  line-height: 1.5;
}

/* Options */
.option-group { display: flex; flex-direction: column; gap: 10px; }
.fill-option {
  width: 100%; margin-right: 0 !important;
  padding: 10px 14px;
  border: 1px solid var(--ccs-border);
  border-radius: 8px; cursor: pointer;
  transition: all 0.15s;
}
.fill-option:hover { background: #EBF2FA; border-color: var(--ccs-blue); }

/* Scale */
.scale-group { display: flex; gap: 10px; flex-wrap: wrap; }
.scale-btn {
  flex: 1; min-width: 80px;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 12px 8px; border-radius: 10px;
  border: 2px solid var(--ccs-border);
  background: #fff; cursor: pointer;
  transition: all 0.2s;
}
.scale-btn:hover, .scale-btn.active {
  border-color: var(--scale-color);
  background: var(--scale-color);
}
.scale-btn.active .scale-num, .scale-btn.active .scale-label { color: #fff; }
.scale-num { font-size: 1.25rem; font-weight: 700; color: var(--scale-color); }
.scale-label { font-size: 0.7rem; color: #aaa; text-align: center; line-height: 1.2; }

/* Quiz result */
.quiz-score-circle {
  width: 120px; height: 120px;
  border-radius: 50%;
  border: 4px solid;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  margin: 0 auto;
}
.score-num { font-size: 2rem; font-weight: 800; line-height: 1; }
.score-total { font-size: 0.9rem; color: #aaa; }

.result-q {
  padding: 14px 0;
  border-bottom: 1px solid var(--ccs-border);
}
.result-q:last-child { border-bottom: none; }

/* Footer */
.fill-footer {
  text-align: center;
  padding: 20px;
  font-size: 0.78rem;
  color: #aaa;
  border-top: 1px solid var(--ccs-border);
  background: #fff;
}
</style>
