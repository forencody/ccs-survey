import { defineStore } from 'pinia'
import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db } from '@/firebase/config'
import type { AppUser, UserRole } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AppUser | null>(null)
  const firebaseUser = ref<User | null>(null)
  const loading = ref(true)

  const isLoggedIn = computed(() => !!user.value)
  const isSuperAdmin = computed(() => user.value?.role === 'super_admin')
  const isCreator = computed(() =>
    user.value?.role === 'creator' || user.value?.role === 'super_admin'
  )
  const isExecutor = computed(() => !!user.value)

  async function loginWithGoogle() {
    const provider = new GoogleAuthProvider()
    const result = await signInWithPopup(auth, provider)
    await syncUserProfile(result.user)
  }

  async function syncUserProfile(fbUser: User) {
    const ref = doc(db, 'users', fbUser.uid)
    const snap = await getDoc(ref)
    if (snap.exists()) {
      const data = snap.data() as AppUser
      if (!data.isActive) throw new Error('ACCOUNT_DISABLED')
      user.value = data
    } else {
      // First-time sign in — create with 'executor' role by default
      // Super admin is set manually in Firestore or via seed
      const newUser: AppUser = {
        uid: fbUser.uid,
        email: fbUser.email || '',
        displayName: fbUser.displayName || '',
        role: 'executor',
        isActive: true,
        createdAt: new Date().toISOString(),
      }
      await setDoc(ref, newUser)
      user.value = newUser
    }
  }

  async function logout() {
    await signOut(auth)
    user.value = null
    firebaseUser.value = null
  }

  function init(): Promise<void> {
    return new Promise((resolve) => {
      onAuthStateChanged(auth, async (fbUser) => {
        if (fbUser) {
          firebaseUser.value = fbUser
          try {
            await syncUserProfile(fbUser)
          } catch {
            user.value = null
          }
        } else {
          user.value = null
          firebaseUser.value = null
        }
        loading.value = false
        resolve()
      })
    })
  }

  async function updateUserRole(uid: string, role: UserRole) {
    await setDoc(doc(db, 'users', uid), { role }, { merge: true })
  }

  async function toggleUserActive(uid: string, isActive: boolean) {
    await setDoc(doc(db, 'users', uid), { isActive }, { merge: true })
  }

  return {
    user,
    firebaseUser,
    loading,
    isLoggedIn,
    isSuperAdmin,
    isCreator,
    isExecutor,
    loginWithGoogle,
    logout,
    init,
    updateUserRole,
    toggleUserActive,
  }
})
