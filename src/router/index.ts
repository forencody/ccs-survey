import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    // ── Public fill route ──────────────────────────────────────────
    {
      path: '/fill/:token',
      name: 'fill',
      component: () => import('@/views/fill/FillPage.vue'),
      meta: { public: true },
    },

    // ── Auth ───────────────────────────────────────────────────────
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/admin/LoginPage.vue'),
      meta: { public: true },
    },

    // ── Admin (requires auth) ──────────────────────────────────────
    {
      path: '/',
      component: () => import('@/components/layout/AdminLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'dashboard',
          component: () => import('@/views/admin/DashboardPage.vue'),
        },
        {
          path: 'projects/new',
          name: 'project-new',
          component: () => import('@/views/admin/ProjectFormPage.vue'),
          meta: { roles: ['super_admin', 'creator'] },
        },
        {
          path: 'projects/:id',
          name: 'project-detail',
          component: () => import('@/views/admin/ProjectDetailPage.vue'),
        },
        {
          path: 'projects/:id/edit',
          name: 'project-edit',
          component: () => import('@/views/admin/ProjectFormPage.vue'),
          meta: { roles: ['super_admin', 'creator'] },
        },
        {
          path: 'templates',
          name: 'templates',
          component: () => import('@/views/admin/TemplateListPage.vue'),
        },
        {
          path: 'templates/new',
          name: 'template-new',
          component: () => import('@/views/admin/TemplateFormPage.vue'),
          meta: { roles: ['super_admin', 'creator'] },
        },
        {
          path: 'templates/:id',
          name: 'template-edit',
          component: () => import('@/views/admin/TemplateFormPage.vue'),
          meta: { roles: ['super_admin', 'creator'] },
        },
        {
          path: 'sessions/:id',
          name: 'session-detail',
          component: () => import('@/views/admin/SessionDetailPage.vue'),
        },
        {
          path: 'admin/users',
          name: 'admin-users',
          component: () => import('@/views/admin/UserManagePage.vue'),
          meta: { roles: ['super_admin'] },
        },
      ],
    },

    // ── Fallback ───────────────────────────────────────────────────
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

// ── Route Guard ────────────────────────────────────────────────────
router.beforeEach(async (to) => {
  const auth = useAuthStore()

  // Wait for auth init on first load
  if (auth.loading) await auth.init()

  if (to.meta.public) return true

  if (!auth.isLoggedIn) return { name: 'login' }

  if (to.meta.roles) {
    const allowed = (to.meta.roles as string[]).includes(auth.user!.role)
    if (!allowed) return { name: 'dashboard' }
  }

  // Redirect away from login if already logged in
  if (to.name === 'login') return { name: 'dashboard' }

  return true
})

export default router
