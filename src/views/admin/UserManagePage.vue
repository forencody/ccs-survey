<script setup lang="ts">
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '@/firebase/config'
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import type { AppUser, UserRole } from '@/types'
const auth = useAuthStore()

const users = ref<AppUser[]>([])
const loading = ref(false)

async function fetchUsers() {
  loading.value = true
  const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc')))
  users.value = snap.docs.map(d => ({ ...d.data() } as AppUser))
  loading.value = false
}

onMounted(fetchUsers)

async function changeRole(user: AppUser, role: UserRole) {
  await auth.updateUserRole(user.uid, role)
  user.role = role
  ElMessage.success('角色已更新')
}

async function toggleActive(user: AppUser) {
  await auth.toggleUserActive(user.uid, !user.isActive)
  user.isActive = !user.isActive
  ElMessage.success(user.isActive ? '帳號已啟用' : '帳號已停用')
}

</script>

<template>
  <div>
    <div class="page-header">
      <h1>{{ $t('users.title') }}</h1>
      <el-button type="primary" :icon="Refresh" @click="fetchUsers">{{ $t('common.loading').replace('...', '') }}重新整理</el-button>
    </div>

    <div class="ccs-card" style="padding:0; overflow:hidden">
      <el-table
        :data="users"
        v-loading="loading"
        style="width:100%"
        :header-cell-style="{ background: '#F5F7FA', color: '#58595B', fontWeight: '600' }"
        row-key="uid"
      >
        <el-table-column :label="$t('users.name')" min-width="160">
          <template #default="{ row }">
            <div style="display:flex; align-items:center; gap:10px;">
              <div class="avatar-sm">{{ row.displayName?.[0] || '?' }}</div>
              <div>
                <div style="font-weight:600; color: var(--ccs-navy)">{{ row.displayName }}</div>
                <div style="font-size:0.78rem; color:#aaa">{{ row.email }}</div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column :label="$t('users.role')" width="180">
          <template #default="{ row }">
            <el-select
              :model-value="row.role"
              size="small"
              :disabled="row.uid === auth.user?.uid"
              @change="(v: UserRole) => changeRole(row, v)"
            >
              <el-option :label="$t('role.super_admin')" value="super_admin" />
              <el-option :label="$t('role.creator')" value="creator" />
              <el-option :label="$t('role.executor')" value="executor" />
            </el-select>
          </template>
        </el-table-column>

        <el-table-column :label="$t('users.status')" width="120">
          <template #default="{ row }">
            <el-tag :type="row.isActive ? 'success' : 'info'" size="small">
              {{ row.isActive ? $t('users.active') : $t('users.disabled') }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column :label="$t('common.actions')" width="120" fixed="right">
          <template #default="{ row }">
            <el-button
              text
              :type="row.isActive ? 'danger' : 'success'"
              size="small"
              :disabled="row.uid === auth.user?.uid"
              @click="toggleActive(row)"
            >
              {{ row.isActive ? $t('users.disabled') : $t('users.active') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <p style="margin-top:12px; font-size:0.8rem; color:#aaa">
      * 新用戶首次以 Google 帳號登入後，會自動建立帳號（預設角色：專案執行者），請在此調整角色。
    </p>
  </div>
</template>

<style scoped>
.avatar-sm {
  width: 32px; height: 32px;
  border-radius: 50%;
  background: var(--ccs-blue);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 0.85rem;
  flex-shrink: 0;
}
</style>
