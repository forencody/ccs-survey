<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Plus, Edit, Delete, Link, Calendar, User } from '@element-plus/icons-vue'
import {
  doc, getDoc, collection, addDoc, getDocs, query,
  where, updateDoc, deleteDoc, orderBy, setDoc,
} from 'firebase/firestore'
import { db } from '@/firebase/config'
import { v4 as uuidv4 } from 'uuid'
import type { Project, Session, SessionStatus } from '@/types'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const { t } = useI18n()

const project = ref<Project | null>(null)
const sessions = ref<Session[]>([])
const templates = ref<{ id: string; title: string; type: string }[]>([])
const loading = ref(true)

const showSessionDialog = ref(false)
const sessionForm = reactive({ name: '', date: '', templateId: '', language: 'zh-TW' })
const savingSession = ref(false)

async function load() {
  loading.value = true
  const pid = route.params.id as string

  const pSnap = await getDoc(doc(db, 'projects', pid))
  if (!pSnap.exists()) return router.push({ name: 'dashboard' })
  project.value = { id: pSnap.id, ...pSnap.data() } as Project

  const [sSnap, tSnap] = await Promise.all([
    getDocs(query(collection(db, 'projects', pid, 'sessions'), orderBy('createdAt', 'desc'))),
    getDocs(query(collection(db, 'templates'),
      where('creatorId', 'in', [auth.user!.uid, '__public__'].filter(Boolean))
    )),
  ])

  sessions.value = sSnap.docs.map(d => ({ id: d.id, ...d.data() }) as Session)
  templates.value = tSnap.docs.map(d => ({ id: d.id, title: d.data().title, type: d.data().type }))
  loading.value = false
}

onMounted(load)

async function createSession() {
  if (!sessionForm.name || !sessionForm.date) return ElMessage.error('場次名稱與日期為必填')
  savingSession.value = true
  try {
    const pid = route.params.id as string
    const token = uuidv4()
    const sessionRef = await addDoc(collection(db, 'projects', pid, 'sessions'), {
      projectId: pid,
      name: sessionForm.name,
      date: sessionForm.date,
      templateId: sessionForm.templateId,
      language: sessionForm.language,
      status: 'draft' as SessionStatus,
      shareToken: token,
      createdAt: new Date().toISOString(),
    })
    // Write token index for fill page lookup
    await setDoc(doc(db, 'sessions_index', token), {
      shareToken: token,
      sessionId: sessionRef.id,
      projectId: pid,
    })
    ElMessage.success('場次已建立')
    showSessionDialog.value = false
    Object.assign(sessionForm, { name: '', date: '', templateId: '', language: 'zh-TW' })
    await load()
  } finally {
    savingSession.value = false
  }
}

async function toggleStatus(s: Session) {
  const next: SessionStatus = s.status === 'draft' ? 'active' : s.status === 'active' ? 'closed' : 'active'
  await updateDoc(doc(db, 'projects', route.params.id as string, 'sessions', s.id), { status: next })
  s.status = next
}

async function deleteSession(s: Session) {
  await ElMessageBox.confirm(`確定刪除場次「${s.name}」？`, '', { type: 'warning' })
  await deleteDoc(doc(db, 'projects', route.params.id as string, 'sessions', s.id))
  sessions.value = sessions.value.filter(x => x.id !== s.id)
  ElMessage.success('場次已刪除')
}

const fillBaseUrl = computed(() => {
  const base = window.location.origin + window.location.pathname
  return `${base}#/fill/`
})

function copyToken(token: string) {
  navigator.clipboard.writeText(fillBaseUrl.value + token)
  ElMessage.success('已複製連結')
}

const statusLabel = (s: SessionStatus) => ({
  draft: t('session.draft'), active: t('session.active'), closed: t('session.closed'),
})[s]
const statusType = (s: SessionStatus) => ({ draft: 'info', active: 'success', closed: '' })[s] as any
</script>

<template>
  <div v-loading="loading">
    <div class="page-header">
      <div style="display:flex;align-items:center;gap:12px">
        <el-button text :icon="ArrowLeft" @click="router.push({name:'dashboard'})">{{ $t('common.back') }}</el-button>
        <div>
          <h1>{{ project?.title }}</h1>
          <el-tag :color="project?.type === 'forum' ? 'var(--ccs-blue)' : 'var(--ccs-teal)'" effect="dark" size="small">
            {{ project ? $t(`project.${project.type}`) : '' }}
          </el-tag>
        </div>
      </div>
      <el-button v-if="auth.isCreator" type="primary" plain :icon="Edit"
        @click="router.push({name:'project-edit', params:{id: route.params.id}})">
        {{ $t('common.edit') }}
      </el-button>
    </div>

    <p v-if="project?.description" style="margin-bottom:24px;color:#777">{{ project.description }}</p>

    <!-- Sessions -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <h2>{{ $t('project.sessions') }}</h2>
      <el-button type="primary" :icon="Plus" @click="showSessionDialog = true">
        {{ $t('session.createSession') }}
      </el-button>
    </div>

    <div v-if="sessions.length === 0" class="ccs-card" style="text-align:center;padding:48px">
      <el-empty description="尚無場次，點右上角建立第一個場次" />
    </div>

    <div class="session-list">
      <div v-for="s in sessions" :key="s.id" class="session-card ccs-card">
        <div class="session-header">
          <div>
            <h3>{{ s.name }}</h3>
            <div class="session-meta">
              <span><el-icon><Calendar /></el-icon> {{ s.date }}</span>
              <span><el-icon><User /></el-icon> {{ $t(`session.language`) }}: {{ s.language }}</span>
            </div>
          </div>
          <el-tag :type="statusType(s.status)" size="small">{{ statusLabel(s.status) }}</el-tag>
        </div>

        <!-- Share Link -->
        <div v-if="s.status !== 'draft'" class="share-area">
          <el-input :model-value="fillBaseUrl + s.shareToken" readonly size="small">
            <template #prefix><el-icon><Link /></el-icon></template>
            <template #append>
              <el-button @click="copyToken(s.shareToken)">
                複製
              </el-button>
            </template>
          </el-input>
        </div>

        <div class="session-actions">
          <el-button
            :type="s.status === 'active' ? 'warning' : 'success'"
            size="small" plain
            @click="toggleStatus(s)"
          >
            {{ s.status === 'draft' ? $t('session.activate') : s.status === 'active' ? $t('session.close') : '重新開放' }}
          </el-button>
          <el-button size="small" type="primary" plain
            @click="router.push({name:'session-detail', params:{id:s.id}, query:{projectId: route.params.id}})">
            分析與匯出
          </el-button>
          <el-button size="small" type="danger" plain :icon="Delete" @click="deleteSession(s)" />
        </div>
      </div>
    </div>

    <!-- Create Session Dialog -->
    <el-dialog v-model="showSessionDialog" :title="$t('session.createSession')" width="500px">
      <el-form label-position="top">
        <el-form-item :label="$t('session.name')" required>
          <el-input v-model="sessionForm.name" />
        </el-form-item>
        <el-form-item :label="$t('session.date')" required>
          <el-date-picker v-model="sessionForm.date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item :label="$t('session.template')">
          <el-select v-model="sessionForm.templateId" clearable style="width:100%" :placeholder="$t('session.template')">
            <el-option v-for="tp in templates" :key="tp.id" :value="tp.id"
              :label="`${tp.title} (${tp.type === 'survey' ? $t('template.survey') : $t('template.quiz')})`" />
          </el-select>
          <div style="font-size:0.8rem;color:#aaa;margin-top:4px">
            如尚未建立模板，可先建立場次後再指定
          </div>
        </el-form-item>
        <el-form-item :label="$t('session.language')">
          <el-select v-model="sessionForm.language" style="width:100%">
            <el-option label="🇹🇼 繁體中文" value="zh-TW" />
            <el-option label="🇨🇳 简体中文" value="zh-CN" />
            <el-option label="🇺🇸 English" value="en" />
            <el-option label="🇻🇳 Tiếng Việt" value="vi" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showSessionDialog = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="savingSession" @click="createSession">{{ $t('common.create') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.session-list { display: flex; flex-direction: column; gap: 12px; }
.session-card { padding: 20px; }
.session-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
.session-meta { display: flex; gap: 16px; font-size: 0.82rem; color: #aaa; margin-top: 4px; }
.session-meta span { display: flex; align-items: center; gap: 4px; }
.share-area { margin-bottom: 12px; }
.session-actions { display: flex; gap: 8px; padding-top: 12px; border-top: 1px solid var(--ccs-border); }
</style>
