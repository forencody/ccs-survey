<script setup lang="ts">
import { useProjectsStore } from '@/stores/projects'
import { useAuthStore } from '@/stores/auth'
import { useI18n } from 'vue-i18n'
import { ElMessageBox, ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { Plus, Search, Loading, Calendar, User } from '@element-plus/icons-vue'

const { t } = useI18n()
const auth = useAuthStore()
const projects = useProjectsStore()
const router = useRouter()

const searchText = ref('')
const typeFilter = ref('')

onMounted(() => projects.fetchProjects())

const filtered = computed(() =>
  projects.projects.filter(p => {
    const matchText = !searchText.value ||
      p.title.toLowerCase().includes(searchText.value.toLowerCase())
    const matchType = !typeFilter.value || p.type === typeFilter.value
    return matchText && matchType
  })
)

async function handleDelete(id: string, title: string) {
  await ElMessageBox.confirm(t('project.deleteConfirm'), title, {
    type: 'warning',
    confirmButtonText: t('common.delete'),
    cancelButtonText: t('common.cancel'),
    confirmButtonClass: 'el-button--danger',
  })
  await projects.deleteProject(id)
  ElMessage.success('專案已刪除')
}

const typeTag = (type: string) =>
  type === 'forum' ? 'var(--ccs-blue)' : 'var(--ccs-teal)'
</script>

<template>
  <div>
    <!-- Header -->
    <div class="page-header">
      <h1>{{ $t('nav.dashboard') }}</h1>
      <el-button
        v-if="auth.isCreator"
        type="primary"
        :icon="Plus"
        @click="router.push({ name: 'project-new' })"
      >
        {{ $t('project.createTitle') }}
      </el-button>
    </div>

    <!-- Stats Row -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-num" style="color: var(--ccs-blue)">{{ projects.projects.length }}</div>
        <div class="stat-label">{{ $t('nav.projects') }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-num" style="color: var(--ccs-teal)">
          {{ projects.projects.filter(p => p.type === 'forum').length }}
        </div>
        <div class="stat-label">{{ $t('project.forum') }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-num" style="color: var(--ccs-orange)">
          {{ projects.projects.filter(p => p.type === 'training').length }}
        </div>
        <div class="stat-label">{{ $t('project.training') }}</div>
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="filter-bar ccs-card" style="padding:16px 20px; margin-bottom:16px;">
      <el-input
        v-model="searchText"
        :placeholder="$t('common.search')"
        :prefix-icon="Search"
        clearable
        style="max-width:280px; margin-right:12px"
      />
      <el-select v-model="typeFilter" :placeholder="$t('common.all')" clearable style="width:150px">
        <el-option :label="$t('project.forum')" value="forum" />
        <el-option :label="$t('project.training')" value="training" />
      </el-select>
    </div>

    <!-- Projects Grid -->
    <div v-if="projects.loading" class="loading-center">
      <el-icon class="is-loading" size="36"><Loading /></el-icon>
    </div>

    <div v-else-if="filtered.length === 0" class="empty-state">
      <el-empty :description="$t('project.noProjects')" />
      <el-button
        v-if="auth.isCreator"
        type="primary"
        style="margin-top:16px"
        @click="router.push({ name: 'project-new' })"
      >
        {{ $t('project.createTitle') }}
      </el-button>
    </div>

    <div v-else class="project-grid">
      <div
        v-for="p in filtered"
        :key="p.id"
        class="project-card ccs-card"
        @click="router.push({ name: 'project-detail', params: { id: p.id } })"
      >
        <!-- Type Badge -->
        <span class="type-badge" :style="{ background: typeTag(p.type) }">
          {{ $t(`project.${p.type}`) }}
        </span>

        <h3 class="project-title">{{ p.title }}</h3>
        <p class="project-desc">{{ p.description || '—' }}</p>

        <div class="project-meta">
          <span>
            <el-icon><Calendar /></el-icon>
            {{ new Date(p.createdAt).toLocaleDateString('zh-TW') }}
          </span>
          <span>
            <el-icon><User /></el-icon>
            {{ p.executorIds?.length || 0 }} 位執行者
          </span>
        </div>

        <!-- Actions -->
        <div class="project-actions" @click.stop>
          <el-button
            v-if="auth.isCreator || auth.isSuperAdmin"
            text type="primary" size="small"
            @click="router.push({ name: 'project-edit', params: { id: p.id } })"
          >
            {{ $t('common.edit') }}
          </el-button>
          <el-button
            v-if="auth.isCreator || auth.isSuperAdmin"
            text type="danger" size="small"
            @click="handleDelete(p.id, p.title)"
          >
            {{ $t('common.delete') }}
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stats-row {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
}
.stat-card {
  flex: 1;
  background: #fff;
  border-radius: 12px;
  border: 1px solid var(--ccs-border);
  padding: 20px 24px;
  text-align: center;
  box-shadow: var(--ccs-shadow-sm);
}
.stat-num { font-size: 2rem; font-weight: 700; line-height: 1; }
.stat-label { font-size: 0.85rem; color: #888; margin-top: 4px; }

.filter-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}
.project-card {
  cursor: pointer;
  transition: box-shadow 0.2s, transform 0.2s;
  position: relative;
  padding-top: 32px;
}
.project-card:hover {
  box-shadow: var(--ccs-shadow-md);
  transform: translateY(-2px);
}
.type-badge {
  position: absolute;
  top: 16px;
  left: 16px;
  color: #fff;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 20px;
}
.project-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--ccs-navy);
  margin: 4px 0 8px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.project-desc {
  font-size: 0.85rem;
  color: #888;
  margin-bottom: 12px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.project-meta {
  display: flex;
  gap: 16px;
  font-size: 0.8rem;
  color: #aaa;
  margin-bottom: 12px;
}
.project-meta span { display: flex; align-items: center; gap: 4px; }
.project-actions {
  border-top: 1px solid var(--ccs-border);
  padding-top: 10px;
  display: flex;
  gap: 4px;
}
.loading-center {
  display: flex;
  justify-content: center;
  padding: 80px;
  color: var(--ccs-blue);
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px;
}
</style>
