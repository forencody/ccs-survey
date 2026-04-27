<script setup lang="ts">
import { useProjectsStore } from '@/stores/projects'
import { useAuthStore } from '@/stores/auth'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useRouter, useRoute } from 'vue-router'
import { ArrowLeft, Reading, ChatDotRound } from '@element-plus/icons-vue'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/firebase/config'
import type { AppUser, ProjectType } from '@/types'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const projectsStore = useProjectsStore()
const auth = useAuthStore()

const isEdit = computed(() => !!route.params.id)
const saving = ref(false)

const form = reactive({
  title: '',
  type: 'training' as ProjectType,
  description: '',
  executorIds: [] as string[],
})

const executors = ref<AppUser[]>([])

async function loadUsers() {
  const snap = await getDocs(query(collection(db, 'users'), where('isActive', '==', true)))
  executors.value = snap.docs
    .map(d => d.data() as AppUser)
    .filter(u => u.uid !== auth.user?.uid)
}

async function loadProject() {
  if (!isEdit.value) return
  const snap = await getDoc(doc(db, 'projects', route.params.id as string))
  if (!snap.exists()) return router.push({ name: 'dashboard' })
  const data = snap.data()
  form.title = data.title
  form.type = data.type
  form.description = data.description || ''
  form.executorIds = data.executorIds || []
}

onMounted(() => Promise.all([loadUsers(), loadProject()]))

async function handleSubmit() {
  if (!form.title.trim()) return ElMessage.error(t('project.title') + '為必填')
  saving.value = true
  try {
    if (isEdit.value) {
      await projectsStore.updateProject(route.params.id as string, { ...form })
      ElMessage.success('專案已更新')
    } else {
      await projectsStore.createProject({ ...form, creatorId: auth.user!.uid })
      ElMessage.success('專案已建立')
    }
    router.push({ name: 'dashboard' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <div class="page-header">
      <div style="display:flex; align-items:center; gap:12px">
        <el-button text :icon="ArrowLeft" @click="router.back()">{{ $t('common.back') }}</el-button>
        <h1>{{ isEdit ? $t('project.editTitle') : $t('project.createTitle') }}</h1>
      </div>
    </div>

    <div class="ccs-card" style="max-width:680px">
      <el-form label-position="top" @submit.prevent="handleSubmit">
        <el-form-item :label="$t('project.title')" required>
          <el-input v-model="form.title" size="large" maxlength="80" show-word-limit />
        </el-form-item>

        <el-form-item :label="$t('project.type')" required>
          <el-radio-group v-model="form.type" size="large">
            <el-radio-button value="training">
              <el-icon style="margin-right:6px"><Reading /></el-icon>{{ $t('project.training') }}
            </el-radio-button>
            <el-radio-button value="forum">
              <el-icon style="margin-right:6px"><ChatDotRound /></el-icon>{{ $t('project.forum') }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item :label="$t('project.description')">
          <el-input v-model="form.description" type="textarea" :rows="3" maxlength="300" show-word-limit />
        </el-form-item>

        <el-form-item :label="$t('project.executors')">
          <el-select v-model="form.executorIds" multiple filterable :placeholder="$t('project.addExecutor')" style="width:100%">
            <el-option
              v-for="u in executors" :key="u.uid" :value="u.uid"
              :label="`${u.displayName} (${u.email})`"
            >
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-weight:600">{{ u.displayName }}</span>
                <span style="font-size:0.8rem;color:#aaa">{{ u.email }}</span>
                <el-tag size="small" style="margin-left:auto">{{ $t(`role.${u.role}`) }}</el-tag>
              </div>
            </el-option>
          </el-select>
        </el-form-item>

        <div style="display:flex;gap:12px;justify-content:flex-end;margin-top:8px">
          <el-button @click="router.back()">{{ $t('common.cancel') }}</el-button>
          <el-button type="primary" native-type="submit" :loading="saving" size="large">
            {{ isEdit ? $t('common.save') : $t('common.create') }}
          </el-button>
        </div>
      </el-form>
    </div>
  </div>
</template>
