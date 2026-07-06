import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db, firebaseEnabled } from '../services/firebase.js'
import {
  collection, query, orderBy, onSnapshot,
  addDoc, deleteDoc, doc, updateDoc, Timestamp,
} from 'firebase/firestore'

const LS_KEY = 'citrus:treatments'

function sortDesc(arr) {
  return [...arr].sort((a, b) => {
    if (b.date !== a.date) return b.date.localeCompare(a.date)
    return (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
  })
}

function saveLS(arr) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(arr)) } catch {}
}

export const useTreatmentStore = defineStore('treatment', () => {
  const treatments = ref([])
  const ready = ref(false)
  const initialized = ref(false)

  function init() {
    if (initialized.value) return
    initialized.value = true

    if (firebaseEnabled && db) {
      const q = query(collection(db, 'treatments'), orderBy('date', 'desc'))
      onSnapshot(q, (snap) => {
        treatments.value = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        saveLS(treatments.value)
        ready.value = true
      })
    } else {
      try {
        const raw = localStorage.getItem(LS_KEY)
        if (raw) treatments.value = sortDesc(JSON.parse(raw))
      } catch {}
      ready.value = true
    }
  }

  async function addTreatment(record) {
    if (firebaseEnabled && db) {
      await addDoc(collection(db, 'treatments'), {
        ...record,
        createdAt: Timestamp.now().toDate().toISOString(),
      })
    } else {
      const item = {
        ...record,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        createdAt: new Date().toISOString(),
      }
      treatments.value = sortDesc([item, ...treatments.value])
      saveLS(treatments.value)
    }
  }

  async function updateTreatment(id, record) {
    if (firebaseEnabled && db) {
      await updateDoc(doc(db, 'treatments', id), record)
    } else {
      treatments.value = sortDesc(
        treatments.value.map(t => t.id === id ? { ...t, ...record } : t),
      )
      saveLS(treatments.value)
    }
  }

  async function replaceAllTreatments(records) {
    if (firebaseEnabled && db) {
      for (const t of treatments.value) {
        await deleteDoc(doc(db, 'treatments', t.id))
      }
      for (const r of records) {
        const data = Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'id'))
        await addDoc(collection(db, 'treatments'), data)
      }
    } else {
      treatments.value = sortDesc(
        records.map((r, i) => ({ ...r, id: r.id || `restored-${Date.now()}-${i}` })),
      )
      saveLS(treatments.value)
    }
  }

  async function deleteTreatment(id) {
    if (firebaseEnabled && db) {
      await deleteDoc(doc(db, 'treatments', id))
    } else {
      treatments.value = treatments.value.filter(t => t.id !== id)
      saveLS(treatments.value)
    }
  }

  return { treatments, ready, init, addTreatment, updateTreatment, deleteTreatment, replaceAllTreatments }
})
