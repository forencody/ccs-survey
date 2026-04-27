import { defineStore } from 'pinia'
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, getDocs, query, where, orderBy,
} from 'firebase/firestore'
import { db } from '@/firebase/config'
import { useAuthStore } from './auth'
import type { Template, Question } from '@/types'

export const useTemplatesStore = defineStore('templates', () => {
  const templates = ref<Template[]>([])
  const loading = ref(false)

  async function fetchTemplates() {
    loading.value = true
    const auth = useAuthStore()
    const snap = await getDocs(
      query(collection(db, 'templates'), orderBy('createdAt', 'desc'))
    )
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }) as Template)
    // Show own templates + public (projectId == null)
    templates.value = all.filter(
      t => t.creatorId === auth.user?.uid || t.projectId === null || auth.isSuperAdmin
    )
    loading.value = false
  }

  async function createTemplate(data: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>) {
    const ref = await addDoc(collection(db, 'templates'), {
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    await fetchTemplates()
    return ref.id
  }

  async function updateTemplate(id: string, data: Partial<Template>) {
    await updateDoc(doc(db, 'templates', id), {
      ...data,
      updatedAt: new Date().toISOString(),
    })
    await fetchTemplates()
  }

  async function deleteTemplate(id: string) {
    await deleteDoc(doc(db, 'templates', id))
    templates.value = templates.value.filter(t => t.id !== id)
  }

  return { templates, loading, fetchTemplates, createTemplate, updateTemplate, deleteTemplate }
})
