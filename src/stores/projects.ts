import { defineStore } from 'pinia'
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, getDocs, query, where, orderBy,
} from 'firebase/firestore'
import { db } from '@/firebase/config'
import { useAuthStore } from './auth'
import type { Project } from '@/types'

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<Project[]>([])
  const loading = ref(false)

  async function fetchProjects() {
    loading.value = true
    const auth = useAuthStore()
    const col = collection(db, 'projects')
    let q

    if (auth.isSuperAdmin) {
      q = query(col, orderBy('createdAt', 'desc'))
    } else if (auth.user?.role === 'creator') {
      q = query(col, where('creatorId', '==', auth.user.uid), orderBy('createdAt', 'desc'))
    } else {
      q = query(col, where('executorIds', 'array-contains', auth.user!.uid), orderBy('createdAt', 'desc'))
    }

    const snap = await getDocs(q)
    projects.value = snap.docs.map(d => ({ id: d.id, ...d.data() }) as Project)
    loading.value = false
  }

  async function createProject(data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) {
    const ref = await addDoc(collection(db, 'projects'), {
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    await fetchProjects()
    return ref.id
  }

  async function updateProject(id: string, data: Partial<Project>) {
    await updateDoc(doc(db, 'projects', id), { ...data, updatedAt: new Date().toISOString() })
    await fetchProjects()
  }

  async function deleteProject(id: string) {
    await deleteDoc(doc(db, 'projects', id))
    projects.value = projects.value.filter(p => p.id !== id)
  }

  return { projects, loading, fetchProjects, createProject, updateProject, deleteProject }
})
