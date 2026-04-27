<script setup lang="ts">
import { useTemplatesStore } from '@/stores/templates'
import { useAuthStore } from '@/stores/auth'
import { useI18n } from 'vue-i18n'
import { ElMessageBox, ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'

const { t } = useI18n()
const router = useRouter()
const store = useTemplatesStore()
const auth = useAuthStore()

onMounted(() => store.fetchTemplates())

async function handleDelete(id: string, title: string) {
  await ElMessageBox.confirm(`確定刪除模板「${title}」？`, '', { type: 'warning' })
  await store.deleteTemplate(id)
  ElMessage.success('模板已刪除')
}

const typeColor = (type: string) => type === 'survey' ? 'var(--ccs-teal)' : 'var(--ccs-blue)'
</script>

<template>
  <div>
    <div class="page-header">
      <h1>{{ $t('nav.templates') }}</h1>
      <el-button v-if="auth.isCreator" type="primary" :icon="Plus"
        @click="router.push({ name: 'template-new' })">
        {{ $t('template.aiGenerate') }} / 手動建立
      </el-button>
    </div>

    <div v-if="store.loading" class="loading-center">
      <el-icon class="is-loading" size="36"><Loading /></el-icon>
    </div>
    <div v-else-if="store.templates.length === 0" class="empty-state">
      <el-empty description="尚無模板，點右上角建立第一個模板" />
    </div>
    <div v-else class="template-grid">
      <div v-for="tp in store.templates" :key="tp.id" class="template-card ccs-card">
        <div class="type-badge" :style="{ background: typeColor(tp.type) }">
          {{ tp.type === 'survey' ? $t('template.survey') : $t('template.quiz') }}
        </div>
        <h3>{{ tp.title }}</h3>
        <p class="q-count">{{ tp.questions?.length || 0 }} {{ $t('template.questions') }}</p>
        <p class="created-at">建立：{{ new Date(tp.createdAt).toLocaleDateString('zh-TW') }}</p>
        <div class="card-actions" v-if="auth.isCreator || auth.isSuperAdmin">
          <el-button text type="primary" size="small" :icon="Edit"
            @click="router.push({ name: 'template-edit', params: { id: tp.id } })">
            {{ $t('common.edit') }}
          </el-button>
          <el-button text type="danger" size="small" :icon="Delete"
            @click="handleDelete(tp.id, tp.title)">
            {{ $t('common.delete') }}
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}
.template-card {
  position: relative;
  padding-top: 32px;
  cursor: default;
}
.type-badge {
  position: absolute; top: 16px; left: 16px;
  color: #fff; font-size: 0.75rem; font-weight: 600;
  padding: 2px 10px; border-radius: 20px;
}
.q-count { font-size: 0.85rem; color: var(--ccs-teal); font-weight: 600; margin: 4px 0; }
.created-at { font-size: 0.78rem; color: #aaa; margin-bottom: 12px; }
.card-actions {
  border-top: 1px solid var(--ccs-border);
  padding-top: 10px;
  display: flex; gap: 4px;
}
.loading-center { display: flex; justify-content: center; padding: 80px; color: var(--ccs-blue); }
.empty-state { display: flex; flex-direction: column; align-items: center; padding: 60px; }
</style>
