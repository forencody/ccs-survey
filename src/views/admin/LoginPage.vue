<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { i18n } from '@/i18n'

const auth = useAuthStore()

function setLocale(v: string) {
  ;(i18n.global.locale as any).value = v
  localStorage.setItem('locale', v)
}
const router = useRouter()
const { t } = useI18n()

const loading = ref(false)

async function handleGoogleLogin() {
  loading.value = true
  try {
    await auth.loginWithGoogle()
    router.push({ name: 'dashboard' })
  } catch (err: any) {
    if (err.message === 'ACCOUNT_DISABLED') {
      ElMessage.error(t('auth.accountDisabled'))
    } else {
      ElMessage.error('登入失敗，請稍後再試')
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <!-- Background gradient -->
    <div class="login-bg" />

    <!-- Card -->
    <div class="login-card">
      <!-- Logo -->
      <div class="login-logo">
        <img
          src="https://cc-sustain.com/wp-content/uploads/2024/01/成創LOGO_工作區域-1_0.png"
          alt="成創永續"
          class="logo-img"
          @error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
        />
        <div class="logo-fallback">
          <span class="logo-c1">C</span><span class="logo-c2">C</span><span class="logo-c3">S</span>
        </div>
      </div>

      <!-- Title -->
      <h1 class="login-title">{{ $t('common.appName') }}</h1>
      <p class="login-company">{{ $t('common.company') }}</p>
      <p class="login-slogan">{{ $t('common.slogan') }}</p>

      <el-divider />

      <!-- Login Button -->
      <el-button
        type="primary"
        size="large"
        :loading="loading"
        class="login-btn"
        @click="handleGoogleLogin"
      >
        <template #icon>
          <svg width="18" height="18" viewBox="0 0 48 48" style="margin-right:8px">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
        </template>
        {{ $t('auth.loginBtn') }}
      </el-button>

      <!-- Language Selector -->
      <div class="lang-switch">
        <el-select
          :model-value="$i18n.locale"
          size="small"
          style="width:140px"
          @change="setLocale"
        >
          <el-option label="🇹🇼 繁體中文" value="zh-TW" />
          <el-option label="🇨🇳 简体中文" value="zh-CN" />
          <el-option label="🇺🇸 English" value="en" />
          <el-option label="🇻🇳 Tiếng Việt" value="vi" />
        </el-select>
      </div>
    </div>

    <!-- Footer -->
    <p class="login-footer">© 2024 成創永續股份有限公司 | cc-sustain.com</p>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  padding: 24px;
}

.login-bg {
  position: fixed;
  inset: 0;
  background: var(--ccs-gradient);
  z-index: 0;
}

.login-card {
  position: relative;
  z-index: 1;
  background: #fff;
  border-radius: 20px;
  padding: 48px 40px 36px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 24px 64px rgba(31, 60, 110, 0.3);
  text-align: center;
}

.login-logo {
  margin-bottom: 20px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo-img {
  max-height: 80px;
  max-width: 200px;
  object-fit: contain;
}

.logo-fallback {
  font-size: 2.5rem;
  font-weight: 800;
  letter-spacing: 2px;
}
.logo-c1 { color: var(--ccs-blue); }
.logo-c2 { color: var(--ccs-teal); }
.logo-c3 { color: var(--ccs-orange); }

.login-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--ccs-navy);
  margin-bottom: 4px;
}

.login-company {
  font-size: 0.85rem;
  color: var(--ccs-text);
  margin-bottom: 4px;
}

.login-slogan {
  font-size: 0.8rem;
  color: var(--ccs-teal);
  font-weight: 600;
  margin-bottom: 0;
}

.login-btn {
  width: 100%;
  height: 48px;
  font-size: 1rem;
  border-radius: 10px !important;
  margin-bottom: 8px;
}

.lang-switch {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}

.login-footer {
  position: relative;
  z-index: 1;
  margin-top: 24px;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
}
</style>
