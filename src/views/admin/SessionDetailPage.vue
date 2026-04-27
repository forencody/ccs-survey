<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Download, Printer } from '@element-plus/icons-vue'
import { doc, getDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore'
import { db } from '@/firebase/config'
import { Bar, Pie } from 'vue-chartjs'
import {
  Chart as ChartJS, Title, Tooltip, Legend,
  BarElement, CategoryScale, LinearScale, ArcElement,
} from 'chart.js'
import QRCode from 'qrcode'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import JSZip from 'jszip'
import type { Session, Template, Response, Question } from '@/types'

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, ArcElement)

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const session = ref<Session | null>(null)
const template = ref<Template | null>(null)
const responses = ref<Response[]>([])
const projectTitle = ref('')
const qrDataUrl = ref('')
const loading = ref(true)
const exporting = ref(false)

const fillUrl = computed(() => {
  if (!session.value) return ''
  const base = window.location.origin + window.location.pathname
  return `${base}#/fill/${session.value.shareToken}`
})

async function load() {
  loading.value = true
  const sid = route.params.id as string
  const pid = route.query.projectId as string

  const [sSnap, rSnap] = await Promise.all([
    getDoc(doc(db, 'projects', pid, 'sessions', sid)),
    getDocs(query(collection(db, 'responses'), where('sessionId', '==', sid), orderBy('submittedAt', 'asc'))),
  ])

  if (!sSnap.exists()) { router.push({ name: 'dashboard' }); return }
  session.value = { id: sSnap.id, ...sSnap.data() } as Session
  responses.value = rSnap.docs.map(d => ({ id: d.id, ...d.data() }) as Response)

  if (session.value.templateId) {
    const tSnap = await getDoc(doc(db, 'templates', session.value.templateId))
    if (tSnap.exists()) template.value = { id: tSnap.id, ...tSnap.data() } as Template
  }

  const pSnap = await getDoc(doc(db, 'projects', pid))
  if (pSnap.exists()) projectTitle.value = pSnap.data().title

  // Generate QR Code
  if (fillUrl.value) {
    qrDataUrl.value = await QRCode.toDataURL(fillUrl.value, { width: 300, margin: 2 })
  }

  loading.value = false
}

onMounted(load)

// ── Statistics ─────────────────────────────────────────────────
const isQuiz = computed(() => template.value?.type === 'quiz')
const totalCount = computed(() => responses.value.length)
const avgScore = computed(() => {
  if (!isQuiz.value || !responses.value.length) return 0
  const sum = responses.value.reduce((a, r) => a + (r.score || 0), 0)
  return Math.round(sum / responses.value.length)
})
const maxPossible = computed(() => responses.value[0]?.totalScore || 0)
const passRate = computed(() => {
  if (!isQuiz.value || !responses.value.length) return 0
  const passed = responses.value.filter(r => (r.score || 0) / (r.totalScore || 1) >= 0.6).length
  return Math.round((passed / responses.value.length) * 100)
})

// Chart data per question
function getQuestionChartData(q: Question) {
  const lang = session.value?.language || 'zh-TW'
  const opts = q.options?.[lang] || q.options?.['zh-TW'] || []
  if (!opts.length) return null
  const counts = Array(opts.length).fill(0)
  responses.value.forEach(r => {
    const ans = r.answers.find(a => a.questionId === q.id)
    if (!ans) return
    const vals = Array.isArray(ans.value) ? ans.value : [ans.value]
    vals.forEach(v => {
      const idx = parseInt(v)
      if (!isNaN(idx) && idx < counts.length) counts[idx]++
    })
  })
  return {
    labels: opts,
    datasets: [{
      data: counts,
      backgroundColor: ['#3165A7', '#1A9A83', '#F3982D', '#1F3C6E', '#58595B', '#7FB3E8', '#5EC4AF'],
    }],
  }
}

function getScaleChartData(q: Question) {
  const counts = [0, 0, 0, 0, 0]
  responses.value.forEach(r => {
    const ans = r.answers.find(a => a.questionId === q.id)
    if (!ans) return
    const v = parseInt(ans.value as string)
    if (v >= 1 && v <= 5) counts[v - 1]++
  })
  return {
    labels: ['1', '2', '3', '4', '5'],
    datasets: [{
      label: '人數',
      data: counts,
      backgroundColor: ['#E53E3E', '#F56565', '#F3982D', '#1A9A83', '#276749'],
    }],
  }
}

// ── Export Individual PDF ──────────────────────────────────────
async function exportOnePdf(r: Response) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const lang = session.value?.language || 'zh-TW'
  const qs = template.value?.questions || []

  // Cover
  pdf.setFillColor(31, 60, 110)
  pdf.rect(0, 0, 210, 40, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(16)
  pdf.text(projectTitle.value, 14, 16)
  pdf.setFontSize(12)
  pdf.text(session.value?.name || '', 14, 26)
  pdf.setTextColor(58, 89, 91)
  pdf.setFontSize(11)
  pdf.text(`${r.company}  ${r.respondentName}`, 14, 50)
  pdf.text(`Email: ${r.respondentEmail}`, 14, 57)
  pdf.text(`填答時間: ${new Date(r.submittedAt).toLocaleString('zh-TW')}`, 14, 64)

  if (isQuiz.value) {
    pdf.setTextColor(26, 154, 131)
    pdf.setFontSize(22)
    pdf.text(`得分: ${r.score} / ${r.totalScore}`, 14, 78)
    pdf.setFontSize(11)
    pdf.setTextColor(100, 100, 100)
    pdf.text(`通過標準: 60%  (${Math.round((r.score || 0) / (r.totalScore || 1) * 100)}%)`, 14, 86)
  }

  let y = isQuiz.value ? 96 : 76
  pdf.setFontSize(10)
  pdf.setTextColor(58, 89, 91)

  qs.forEach((q, idx) => {
    const qText = q.text[lang] || q.text['zh-TW'] || ''
    const ansData = r.answers.find(a => a.questionId === q.id)
    const opts = q.options?.[lang] || q.options?.['zh-TW'] || []
    const ansVal = ansData?.value

    const lines = pdf.splitTextToSize(`Q${idx + 1}. ${qText}`, 182)
    if (y + lines.length * 6 > 270) { pdf.addPage(); y = 20 }
    pdf.setFont('helvetica', 'bold')
    pdf.text(lines, 14, y)
    y += lines.length * 6 + 2

    pdf.setFont('helvetica', 'normal')
    let ansStr = ''
    if (Array.isArray(ansVal)) {
      ansStr = ansVal.map(i => opts[+i] || i).join('、')
    } else if (q.type !== 'text') {
      ansStr = opts[+(ansVal || 0)] || String(ansVal)
    } else {
      ansStr = String(ansVal || '')
    }
    pdf.text(`作答：${ansStr}`, 18, y)
    y += 6

    if (isQuiz.value && ansData?.isCorrect !== undefined) {
      const correct = ansData.isCorrect ? '✓ 正確' : '✗ 錯誤'
      pdf.setTextColor(ansData.isCorrect ? 26 : 229, ansData.isCorrect ? 154 : 62, ansData.isCorrect ? 131 : 62)
      pdf.text(correct, 18, y)
      pdf.setTextColor(58, 89, 91)
      y += 6
    }
    y += 4
  })

  pdf.setFontSize(8)
  pdf.setTextColor(170, 170, 170)
  pdf.text('成創永續股份有限公司 | cc-sustain.com', 14, 287)

  const filename = `${r.company}-${r.respondentName}.pdf`
  pdf.save(filename)
}

// ── Batch ZIP Export ───────────────────────────────────────────
async function exportAllZip() {
  if (!responses.value.length) return ElMessage.warning('尚無填答記錄')
  exporting.value = true
  ElMessage.info('正在生成 ZIP，請稍候...')
  try {
    const zip = new JSZip()
    const lang = session.value?.language || 'zh-TW'
    const qs = template.value?.questions || []

    for (const r of responses.value) {
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
      pdf.setFillColor(31, 60, 110)
      pdf.rect(0, 0, 210, 40, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(16)
      pdf.text(projectTitle.value, 14, 16)
      pdf.setFontSize(12)
      pdf.text(session.value?.name || '', 14, 26)
      pdf.setTextColor(58, 89, 91)
      pdf.setFontSize(11)
      pdf.text(`${r.company}  ${r.respondentName}`, 14, 50)
      pdf.text(`Email: ${r.respondentEmail}`, 14, 57)
      if (isQuiz.value) {
        pdf.setTextColor(26, 154, 131)
        pdf.setFontSize(18)
        pdf.text(`得分: ${r.score} / ${r.totalScore}`, 14, 70)
      }

      let y = isQuiz.value ? 82 : 70
      pdf.setFontSize(10)
      pdf.setTextColor(58, 89, 91)
      qs.forEach((q, idx) => {
        const qText = q.text[lang] || q.text['zh-TW'] || ''
        const ansData = r.answers.find(a => a.questionId === q.id)
        const opts = q.options?.[lang] || q.options?.['zh-TW'] || []
        const ansVal = ansData?.value
        const lines = pdf.splitTextToSize(`Q${idx + 1}. ${qText}`, 182)
        if (y + lines.length * 6 > 270) { pdf.addPage(); y = 20 }
        pdf.text(lines, 14, y); y += lines.length * 6 + 2
        let ansStr = Array.isArray(ansVal)
          ? ansVal.map(i => opts[+i] || i).join('、')
          : (q.type !== 'text' ? (opts[+(ansVal || 0)] || String(ansVal)) : String(ansVal || ''))
        pdf.text(`作答：${ansStr}`, 18, y); y += 10
      })
      pdf.setFontSize(8)
      pdf.setTextColor(170, 170, 170)
      pdf.text('成創永續股份有限公司 | cc-sustain.com', 14, 287)

      const blob = pdf.output('blob')
      zip.file(`${r.company}-${r.respondentName}.pdf`, blob)
    }

    const content = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(content)
    const a = document.createElement('a')
    a.href = url
    a.download = `${projectTitle.value}-${session.value?.name}-所有結果.zip`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('ZIP 匯出完成')
  } finally {
    exporting.value = false
  }
}

function copyLink() {
  navigator.clipboard.writeText(fillUrl.value)
  ElMessage.success('已複製連結')
}

const barOptions = { responsive: true, plugins: { legend: { display: false } } }
const pieOptions = { responsive: true, plugins: { legend: { position: 'bottom' as const } } }
</script>

<template>
  <div v-loading="loading">
    <div class="page-header">
      <div style="display:flex;align-items:center;gap:12px">
        <el-button text :icon="ArrowLeft" @click="router.back()">{{ $t('common.back') }}</el-button>
        <div>
          <h1>{{ session?.name }}</h1>
          <span style="font-size:0.85rem;color:#aaa">{{ projectTitle }}</span>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <el-button :loading="exporting" @click="exportAllZip">
          <el-icon><Download /></el-icon> 批次 ZIP 匯出
        </el-button>
      </div>
    </div>

    <el-row :gutter="20">
      <!-- Left: QR + Share -->
      <el-col :xs="24" :md="8">
        <div class="ccs-card" style="text-align:center;margin-bottom:16px">
          <h3 style="margin-bottom:16px">{{ $t('session.qrCode') }}</h3>
          <img v-if="qrDataUrl" :src="qrDataUrl" alt="QR Code" style="width:200px;height:200px" />
          <p style="font-size:0.78rem;color:#aaa;margin-top:8px">掃描 QR Code 進入填答頁</p>
          <el-divider />
          <el-input :model-value="fillUrl" readonly size="small" style="margin-bottom:8px">
            <template #append>
              <el-button @click="copyLink">複製</el-button>
            </template>
          </el-input>
        </div>

        <!-- Stats Cards -->
        <div class="ccs-card stat-mini">
          <div class="stat-row">
            <span>填答人數</span>
            <strong style="color:var(--ccs-blue)">{{ totalCount }}</strong>
          </div>
          <template v-if="isQuiz">
            <div class="stat-row">
              <span>平均分數</span>
              <strong style="color:var(--ccs-orange)">{{ avgScore }} / {{ maxPossible }}</strong>
            </div>
            <div class="stat-row">
              <span>通過率</span>
              <strong style="color:var(--ccs-teal)">{{ passRate }}%</strong>
            </div>
          </template>
        </div>
      </el-col>

      <!-- Right: Analysis -->
      <el-col :xs="24" :md="16">
        <!-- Response List -->
        <div class="ccs-card" style="margin-bottom:16px;padding:0;overflow:hidden">
          <div style="padding:16px 20px;border-bottom:1px solid var(--ccs-border);display:flex;justify-content:space-between;align-items:center">
            <h3>填答記錄 ({{ totalCount }})</h3>
          </div>
          <el-table :data="responses" style="width:100%" max-height="280">
            <el-table-column label="公司" prop="company" min-width="120" />
            <el-table-column label="姓名" prop="respondentName" width="100" />
            <el-table-column label="Email" prop="respondentEmail" min-width="160" />
            <el-table-column v-if="isQuiz" label="得分" width="90">
              <template #default="{ row }">
                <span :style="{ color: (row.score/row.totalScore) >= 0.6 ? 'var(--ccs-teal)' : 'var(--ccs-orange)', fontWeight:'700' }">
                  {{ row.score }}/{{ row.totalScore }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="80" fixed="right">
              <template #default="{ row }">
                <el-button text type="primary" size="small" @click="exportOnePdf(row)">PDF</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <!-- Charts per Question -->
        <div v-if="template && responses.length > 0">
          <div v-for="(q, idx) in template.questions" :key="q.id" class="ccs-card" style="margin-bottom:16px">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
              <span class="q-badge">Q{{ idx + 1 }}</span>
              <span style="font-weight:600">{{ q.text[session?.language || 'zh-TW'] || q.text['zh-TW'] }}</span>
            </div>

            <template v-if="q.type === 'single' || q.type === 'multiple'">
              <Bar :data="getQuestionChartData(q)!" :options="barOptions" style="max-height:200px" />
            </template>
            <template v-else-if="q.type === 'scale'">
              <Bar :data="getScaleChartData(q)" :options="barOptions" style="max-height:160px" />
              <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:#aaa;margin-top:4px;padding:0 4px">
                <span>非常不滿意</span><span>非常滿意</span>
              </div>
            </template>
            <template v-else>
              <div style="background:#f8f9fa;border-radius:8px;padding:12px;max-height:200px;overflow-y:auto">
                <p v-for="r in responses" :key="r.id" style="font-size:0.85rem;padding:4px 0;border-bottom:1px solid #eee">
                  <strong>{{ r.respondentName }}：</strong>
                  {{ r.answers.find(a => a.questionId === q.id)?.value || '（未填）' }}
                </p>
              </div>
            </template>
          </div>
        </div>

        <div v-else-if="!loading" class="ccs-card" style="text-align:center;padding:48px">
          <el-empty description="尚無填答資料" />
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.stat-mini { margin-bottom: 16px; }
.stat-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 0; border-bottom: 1px solid var(--ccs-border);
  font-size: 0.9rem;
}
.stat-row:last-child { border-bottom: none; }
.q-badge {
  background: var(--ccs-blue); color: #fff;
  border-radius: 6px; padding: 2px 10px;
  font-weight: 700; font-size: 0.82rem; flex-shrink: 0;
}
</style>
