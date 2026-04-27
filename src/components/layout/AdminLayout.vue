<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import { i18n } from '@/i18n'
import {
  House, FolderOpened, Document, User,
  SwitchButton, Fold, Expand,
} from '@element-plus/icons-vue'

function setLocale(v: string) {
  ;(i18n.global.locale as any).value = v
  localStorage.setItem('locale', v)
}

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const { t } = useI18n()

const sidebarCollapsed = ref(false)

const menuItems = computed(() => {
  const items = [
    { name: 'dashboard', icon: 'House', label: t('nav.dashboard'), route: '/' },
    { name: 'projects', icon: 'FolderOpened', label: t('nav.projects'), route: '/projects/new' },
    { name: 'templates', icon: 'Document', label: t('nav.templates'), route: '/templates' },
  ]
  if (auth.isSuperAdmin) {
    items.push({ name: 'users', icon: 'User', label: t('nav.users'), route: '/admin/users' })
  }
  return items
})

function isActive(menuRoute: string) {
  if (menuRoute === '/') return route.path === '/'
  return route.path.startsWith(menuRoute.replace('/new', ''))
}

async function handleLogout() {
  await ElMessageBox.confirm(t('auth.logoutConfirm'), '', {
    confirmButtonText: t('common.confirm'),
    cancelButtonText: t('common.cancel'),
    type: 'warning',
  })
  await auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="admin-layout" :class="{ collapsed: sidebarCollapsed }">
    <!-- Sidebar -->
    <aside class="sidebar">
      <!-- Logo Area -->
      <div class="sidebar-logo">
        <img
          src="https://cc-sustain.com/wp-content/uploads/2024/01/成創LOGO_工作區域-1_0.png"
          alt="CCS"
          class="sidebar-logo-img"
          @error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
        />
        <span v-if="!sidebarCollapsed" class="sidebar-logo-text">CCS Survey</span>
      </div>

      <!-- Menu -->
      <nav class="sidebar-nav">
        <router-link
          v-for="item in menuItems"
          :key="item.name"
          :to="item.route"
          class="nav-item"
          :class="{ active: isActive(item.route) }"
        >
          <el-icon class="nav-icon"><component :is="item.icon" /></el-icon>
          <span v-if="!sidebarCollapsed" class="nav-label">{{ item.label }}</span>
        </router-link>
      </nav>

      <!-- User Info -->
      <div class="sidebar-footer">
        <div v-if="!sidebarCollapsed" class="user-info">
          <div class="user-avatar">{{ auth.user?.displayName?.[0] || '?' }}</div>
          <div class="user-detail">
            <div class="user-name">{{ auth.user?.displayName }}</div>
            <div class="user-role">{{ $t(`role.${auth.user?.role}`) }}</div>
          </div>
        </div>
        <el-tooltip :content="$t('nav.logout')" placement="right" :disabled="!sidebarCollapsed">
          <button class="logout-btn" @click="handleLogout">
            <el-icon><SwitchButton /></el-icon>
          </button>
        </el-tooltip>
      </div>
    </aside>

    <!-- Main Content -->
    <div class="main-wrapper">
      <!-- Top Bar -->
      <header class="topbar">
        <el-button text @click="sidebarCollapsed = !sidebarCollapsed">
          <el-icon size="20"><Fold v-if="!sidebarCollapsed" /><Expand v-else /></el-icon>
        </el-button>

        <div class="topbar-right">
          <!-- Language Selector -->
          <el-select
            :model-value="$i18n.locale"
            size="small"
            style="width:130px"
            @change="setLocale"
          >
            <el-option label="🇹🇼 繁體" value="zh-TW" />
            <el-option label="🇨🇳 简体" value="zh-CN" />
            <el-option label="🇺🇸 EN" value="en" />
            <el-option label="🇻🇳 VI" value="vi" />
          </el-select>
        </div>
      </header>

      <!-- Page Content -->
      <main class="page-content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<style scoped>
.admin-layout {
  display: flex;
  min-height: 100vh;
  background: var(--ccs-bg);
}

/* ── Sidebar ──────────────────────────────────────────────────── */
.sidebar {
  width: var(--sidebar-width);
  background: var(--ccs-navy);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: width 0.25s ease;
  position: fixed;
  top: 0; left: 0; bottom: 0;
  z-index: 100;
}
.admin-layout.collapsed .sidebar { width: 64px; }

.sidebar-logo {
  height: var(--header-height);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  overflow: hidden;
}
.sidebar-logo-img {
  width: 36px;
  height: 36px;
  object-fit: contain;
  flex-shrink: 0;
  filter: brightness(0) invert(1);
}
.sidebar-logo-text {
  color: #fff;
  font-weight: 700;
  font-size: 1rem;
  white-space: nowrap;
}

.sidebar-nav {
  flex: 1;
  padding: 12px 8px;
  overflow-y: auto;
  overflow-x: hidden;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  color: rgba(255,255,255,0.65);
  text-decoration: none;
  transition: all 0.2s;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
}
.nav-item:hover { background: rgba(255,255,255,0.08); color: #fff; }
.nav-item.active {
  background: rgba(49, 101, 167, 0.5);
  color: #fff;
  border-left: 3px solid var(--ccs-teal);
}
.nav-icon { font-size: 18px; flex-shrink: 0; }
.nav-label { font-size: 0.9rem; font-weight: 500; }

.sidebar-footer {
  padding: 12px 8px;
  border-top: 1px solid rgba(255,255,255,0.1);
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
}
.user-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  overflow: hidden;
  min-width: 0;
}
.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--ccs-blue);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  flex-shrink: 0;
}
.user-detail { overflow: hidden; }
.user-name {
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.user-role {
  color: rgba(255,255,255,0.5);
  font-size: 0.75rem;
}
.logout-btn {
  background: none;
  border: none;
  color: rgba(255,255,255,0.5);
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  display: flex;
  transition: color 0.2s;
  flex-shrink: 0;
}
.logout-btn:hover { color: #fff; background: rgba(255,255,255,0.1); }

/* ── Main ─────────────────────────────────────────────────────── */
.main-wrapper {
  flex: 1;
  margin-left: var(--sidebar-width);
  transition: margin-left 0.25s ease;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
.admin-layout.collapsed .main-wrapper { margin-left: 64px; }

.topbar {
  height: var(--header-height);
  background: #fff;
  border-bottom: 1px solid var(--ccs-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  position: sticky;
  top: 0;
  z-index: 50;
  box-shadow: var(--ccs-shadow-sm);
}
.topbar-right { display: flex; align-items: center; gap: 12px; }

.page-content {
  flex: 1;
  padding: 32px;
  max-width: var(--content-max-width);
  width: 100%;
  margin: 0 auto;
}
</style>
