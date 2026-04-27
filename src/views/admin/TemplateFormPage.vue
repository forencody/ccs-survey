<script setup lang="ts">
import { useTemplatesStore } from '@/stores/templates'
import { useAuthStore } from '@/stores/auth'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useRouter, useRoute } from 'vue-router'
import { ArrowLeft, Plus, Delete, MagicStick, Rank } from '@element-plus/icons-vue'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/firebase/config'
import { v4 as uuidv4 } from 'uuid'
import type { Template, Question, QuestionType, TemplateType } from '@/types'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const store = useTemplatesStore()
const auth = useAuthStore()

const isEdit = computed(() => !!route.params.id)
const saving = ref(false)

// ── Template Meta ──────────────────────────────────────────────
const meta = reactive({
  title: '',
  type: 'survey' as TemplateType,
  language: 'zh-TW',
})

// ── Questions ──────────────────────────────────────────────────
const questions = ref<Question[]>([])

function newQuestion(): Question {
  return {
    id: uuidv4(),
    type: 'single',
    text: { 'zh-TW': '' },
    options: { 'zh-TW': ['', ''] },
    correctAnswer: '',
    score: 5,
    explanation: { 'zh-TW': '' },
    required: true,
  }
}

function addQuestion() {
  questions.value.push(newQuestion())
}

function removeQuestion(idx: number) {
  questions.value.splice(idx, 1)
}

function addOption(q: Question) {
  if (!q.options) q.options = {}
  Object.keys(q.text).forEach(lang => {
    if (!q.options![lang]) q.options![lang] = []
    q.options![lang].push('')
  })
}

function removeOption(q: Question, optIdx: number) {
  Object.keys(q.options || {}).forEach(lang => {
    q.options![lang].splice(optIdx, 1)
  })
}

function moveQuestion(from: number, to: number) {
  if (to < 0 || to >= questions.value.length) return
  const arr = [...questions.value]
  arr.splice(to, 0, arr.splice(from, 1)[0])
  questions.value = arr
}

// ── Load existing template ─────────────────────────────────────
onMounted(async () => {
  if (!isEdit.value) {
    questions.value = [newQuestion()]
    return
  }
  const snap = await getDoc(doc(db, 'templates', route.params.id as string))
  if (!snap.exists()) return router.push({ name: 'templates' })
  const data = snap.data() as Template
  meta.title = data.title
  meta.type = data.type
  meta.language = data.language
  questions.value = data.questions || []
})

// ── AI Generate ────────────────────────────────────────────────
const aiDialogVisible = ref(false)
const aiForm = reactive({
  title: '',
  description: '',
  type: 'survey' as TemplateType,
  count: 10,
  difficulty: 'medium',
  language: 'zh-TW',
})
const aiLoading = ref(false)

async function runAiGenerate() {
  if (!aiForm.title) return ElMessage.error('請填寫活動名稱')
  aiLoading.value = true
  try {
    const resp = await fetch('https://us-central1-ccs-servey.cloudfunctions.net/generateTemplate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...aiForm }),
    })
    if (!resp.ok) throw new Error(await resp.text())
    const data = await resp.json()
    // Apply AI result
    meta.title = data.title || aiForm.title
    meta.type = aiForm.type
    meta.language = aiForm.language
    questions.value = (data.questions as Question[]).map(q => ({
      ...q,
      id: uuidv4(),
      required: true,
    }))
    aiDialogVisible.value = false
    ElMessage.success(`AI 已生成 ${questions.value.length} 道題目，請確認後儲存`)
  } catch (e: any) {
    ElMessage.error('AI 生成失敗：' + (e.message || '請稍後再試'))
  } finally {
    aiLoading.value = false
  }
}

// ── Save ───────────────────────────────────────────────────────
async function handleSave() {
  if (!meta.title.trim()) return ElMessage.error('請填寫模板名稱')
  if (questions.value.length === 0) return ElMessage.error('至少需要一道題目')

  for (const q of questions.value) {
    if (!q.text[meta.language]?.trim()) {
      return ElMessage.error('每道題目的題目內容為必填')
    }
  }

  saving.value = true
  try {
    const payload: Omit<Template, 'id' | 'createdAt' | 'updatedAt'> = {
      title: meta.title,
      type: meta.type,
      language: meta.language,
      creatorId: auth.user!.uid,
      projectId: null,
      questions: questions.value,
    }
    if (isEdit.value) {
      await store.updateTemplate(route.params.id as string, payload)
      ElMessage.success('模板已更新')
    } else {
      await store.createTemplate(payload)
      ElMessage.success('模板已建立')
    }
    router.push({ name: 'templates' })
  } finally {
    saving.value = false
  }
}

const qTypeLabel = (type: QuestionType) =>
  ({ single: t('template.single'), multiple: t('template.multiple'), scale: t('template.scale'), text: t('template.text') })[type]
</script>

<template>
  <div>
    <!-- Header -->
    <div class="page-header">
      <div style="display:flex;align-items:center;gap:12px">
        <el-button text :icon="ArrowLeft" @click="router.back()">{{ $t('common.back') }}</el-button>
        <h1>{{ isEdit ? '編輯模板' : '建立模板' }}</h1>
      </div>
      <div style="display:flex;gap:8px">
        <el-button v-if="!isEdit" type="warning" :icon="MagicStick" @click="aiDialogVisible = true">
          {{ $t('template.aiGenerate') }}
        </el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">
          {{ $t('common.save') }}
        </el-button>
      </div>
    </div>

    <!-- Meta Card -->
    <div class="ccs-card" style="margin-bottom:20px">
      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item :label="$t('template.title')" required>
            <el-input v-model="meta.title" size="large" />
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item :label="$t('template.type')">
            <el-select v-model="meta.type" style="width:100%">
              <el-option :label="$t('template.survey')" value="survey" />
              <el-option :label="$t('template.quiz')" value="quiz" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="主要語言">
            <el-select v-model="meta.language" style="width:100%">
              <el-option label="繁體中文" value="zh-TW" />
              <el-option label="简体中文" value="zh-CN" />
              <el-option label="English" value="en" />
              <el-option label="Tiếng Việt" value="vi" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>
    </div>

    <!-- Questions -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <h2>{{ $t('template.questions') }} ({{ questions.length }})</h2>
      <el-button type="primary" plain :icon="Plus" @click="addQuestion">{{ $t('template.addQuestion') }}</el-button>
    </div>

    <div class="questions-list">
      <div v-for="(q, idx) in questions" :key="q.id" class="q-card ccs-card">
        <!-- Q Header -->
        <div class="q-header">
          <span class="q-num">Q{{ idx + 1 }}</span>
          <el-select v-model="q.type" size="small" style="width:130px">
            <el-option :label="$t('template.single')" value="single" />
            <el-option :label="$t('template.multiple')" value="multiple" />
            <el-option :label="$t('template.scale')" value="scale" />
            <el-option :label="$t('template.text')" value="text" />
          </el-select>
          <div class="q-move">
            <el-button text size="small" @click="moveQuestion(idx, idx-1)" :disabled="idx===0">↑</el-button>
            <el-button text size="small" @click="moveQuestion(idx, idx+1)" :disabled="idx===questions.length-1">↓</el-button>
          </div>
          <el-checkbox v-model="q.required" size="small">{{ $t('template.required') }}</el-checkbox>
          <el-button text type="danger" size="small" :icon="Delete" @click="removeQuestion(idx)" />
        </div>

        <!-- Question Text -->
        <el-input
          v-model="q.text[meta.language]"
          type="textarea" :rows="2"
          :placeholder="`題目內容（${meta.language}）`"
          style="margin-bottom:12px"
        />

        <!-- Options (single / multiple) -->
        <template v-if="q.type === 'single' || q.type === 'multiple'">
          <div v-for="(_, oIdx) in (q.options?.[meta.language] || [])" :key="oIdx" class="option-row">
            <el-radio v-if="q.type==='single'" :value="String(oIdx)" v-model="(q.correctAnswer as string)"
              :title="meta.type === 'quiz' ? '點選設為正確答案' : ''" />
            <el-checkbox v-else
              :model-value="Array.isArray(q.correctAnswer) && q.correctAnswer.includes(String(oIdx))"
              @change="(v: string | number | boolean) => {
                if (!Array.isArray(q.correctAnswer)) q.correctAnswer = []
                const arr = q.correctAnswer as string[]
                const key = String(oIdx)
                v ? arr.push(key) : arr.splice(arr.indexOf(key), 1)
              }"
              :title="meta.type === 'quiz' ? '點選設為正確答案' : ''"
            />
            <el-input
              :model-value="q.options![meta.language][oIdx]"
              @input="(v: string) => { if(q.options && q.options[meta.language]) q.options[meta.language][oIdx] = v }"
              size="small"
              :placeholder="`選項 ${oIdx + 1}`"
            />
            <el-button text type="danger" size="small" @click="removeOption(q, oIdx)" :disabled="(q.options?.[meta.language]?.length || 0) <= 2">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
          <el-button text type="primary" size="small" :icon="Plus" @click="addOption(q)">
            {{ $t('template.addOption') }}
          </el-button>
          <div v-if="meta.type === 'quiz'" style="font-size:0.78rem;color:var(--ccs-teal);margin-top:4px">
            點選左側圓鈕/方塊設定正確答案
          </div>
        </template>

        <!-- Scale -->
        <template v-else-if="q.type === 'scale'">
          <div class="scale-preview">
            <span v-for="n in 5" :key="n"
              :style="{ background: n <= 2 ? '#E53E3E' : n === 3 ? 'var(--ccs-orange)' : 'var(--ccs-teal)', color:'#fff', borderRadius:'6px', padding:'4px 12px', fontSize:'0.85rem' }">
              {{ n }}
            </span>
          </div>
          <div style="font-size:0.78rem;color:#aaa;margin-top:4px">1=非常不滿意 ～ 5=非常滿意</div>
        </template>

        <!-- Text -->
        <template v-else-if="q.type === 'text'">
          <div style="font-size:0.82rem;color:#aaa;padding:8px;background:#f8f9fa;border-radius:6px">
            填答者將輸入自由文字
          </div>
        </template>

        <!-- Quiz score & explanation -->
        <template v-if="meta.type === 'quiz'">
          <div class="quiz-extra">
            <el-form-item :label="$t('template.score')" style="margin:0">
              <el-input-number v-model="q.score" :min="1" :max="100" size="small" style="width:100px" />
            </el-form-item>
            <el-form-item v-if="q.type !== 'text'" :label="$t('template.explanation')" style="margin:0;flex:1">
              <el-input v-model="q.explanation![meta.language]" size="small" placeholder="解析說明（可選）" />
            </el-form-item>
          </div>
        </template>
      </div>
    </div>

    <!-- Add Question Bottom -->
    <div style="margin-top:16px;text-align:center">
      <el-button type="primary" plain :icon="Plus" @click="addQuestion" size="large">
        {{ $t('template.addQuestion') }}
      </el-button>
    </div>

    <!-- AI Generate Dialog -->
    <el-dialog v-model="aiDialogVisible" title="🤖 AI 生成問卷模板" width="540px">
      <el-form label-position="top">
        <el-form-item label="活動名稱" required>
          <el-input v-model="aiForm.title" placeholder="例：2024 ESG 永續論壇" />
        </el-form-item>
        <el-form-item :label="$t('template.aiPromptLabel')">
          <el-input v-model="aiForm.description" type="textarea" :rows="3"
            :placeholder="$t('template.aiPromptPlaceholder')" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item :label="$t('template.type')">
              <el-select v-model="aiForm.type" style="width:100%">
                <el-option :label="$t('template.survey')" value="survey" />
                <el-option :label="$t('template.quiz')" value="quiz" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item :label="$t('template.questionCount')">
              <el-input-number v-model="aiForm.count" :min="5" :max="20" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item v-if="aiForm.type === 'quiz'" :label="$t('template.difficulty')">
              <el-select v-model="aiForm.difficulty" style="width:100%">
                <el-option :label="$t('template.easy')" value="easy" />
                <el-option :label="$t('template.medium')" value="medium" />
                <el-option :label="$t('template.hard')" value="hard" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="輸出語言">
          <el-select v-model="aiForm.language" style="width:100%">
            <el-option label="🇹🇼 繁體中文" value="zh-TW" />
            <el-option label="🇨🇳 简体中文" value="zh-CN" />
            <el-option label="🇺🇸 English" value="en" />
            <el-option label="🇻🇳 Tiếng Việt" value="vi" />
          </el-select>
        </el-form-item>
      </el-form>
      <div v-if="aiLoading" style="text-align:center;padding:20px">
        <el-icon class="is-loading" size="32" color="var(--ccs-blue)"><Loading /></el-icon>
        <p style="margin-top:8px;color:var(--ccs-blue)">{{ $t('template.generating') }}</p>
      </div>
      <template #footer>
        <el-button @click="aiDialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="aiLoading" :icon="MagicStick" @click="runAiGenerate">
          開始生成
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.questions-list { display: flex; flex-direction: column; gap: 16px; }
.q-card { padding: 20px; }
.q-header {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 12px; flex-wrap: wrap;
}
.q-num {
  background: var(--ccs-blue); color: #fff;
  border-radius: 6px; padding: 2px 10px;
  font-weight: 700; font-size: 0.85rem;
  flex-shrink: 0;
}
.q-move { display: flex; gap: 2px; }
.option-row {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 8px;
}
.scale-preview { display: flex; gap: 8px; margin-top: 4px; }
.quiz-extra {
  display: flex; gap: 16px; align-items: flex-end;
  margin-top: 12px; padding-top: 12px;
  border-top: 1px dashed var(--ccs-border);
}
</style>
