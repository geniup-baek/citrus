import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db, firebaseEnabled } from '../services/firebase.js'
import {
  collection, query, orderBy, onSnapshot,
  addDoc, deleteDoc, doc, updateDoc, Timestamp,
} from 'firebase/firestore'
import { useFarmStore } from './farmStore.js'

function treatmentLabel(record) {
  return [record?.date, record?.brandName].filter(Boolean).join(' ')
}

const TREATMENT_FIELD_LABELS = { date: '날짜', brandName: '농약', moa: '계통', category: '구분', memo: '메모' }

// farmStore.diffFields와 동일한 형태({필드키: {label, from, to}})로 돌려준다 —
// logChange의 짧은 시간 내 재수정 병합(refId+fields)이 여기서도 동작하도록.
function diffTreatmentFields(before, after) {
  const fields = {}
  for (const [key, label] of Object.entries(TREATMENT_FIELD_LABELS)) {
    const prevValue = before?.[key] ?? ''
    const nextValue = after?.[key] ?? ''
    if (prevValue !== nextValue) {
      // Firestore는 undefined 값이 섞인 문서를 통째로 거부하므로 null로 채운다.
      fields[key] = { label, from: before?.[key] ?? null, to: after?.[key] ?? null }
    }
  }
  return fields
}

function formatTreatmentFieldDiff(fields) {
  return Object.values(fields)
    .map((f) => `${f.label}: ${f.from || '(없음)'} → ${f.to || '(없음)'}`)
    .join(', ')
}

// 삭제 전 데이터를 되돌리기용으로 저장해둔다(farmStore.snapshotForRevert와 같은 크기 보호).
const MAX_SNAPSHOT_JSON_LENGTH = 8000
function snapshotForRevert(record) {
  if (!record) return null
  try {
    const json = JSON.stringify(record)
    if (json.length > MAX_SNAPSHOT_JSON_LENGTH) return null
    return JSON.parse(json)
  } catch {
    return null
  }
}

function lsKey(farmId) {
  return `citrus:treatments:${farmId}`
}

function sortDesc(arr) {
  return [...arr].sort((a, b) => {
    if (b.date !== a.date) return b.date.localeCompare(a.date)
    return (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
  })
}

export const useTreatmentStore = defineStore('treatment', () => {
  const treatments = ref([])
  const ready = ref(false)
  const initialized = ref(false)
  let activeFarmId = null

  function saveLS(arr) {
    if (!activeFarmId) return
    try { localStorage.setItem(lsKey(activeFarmId), JSON.stringify(arr)) } catch {}
  }

  function collectionRef() {
    return collection(db, 'farms', activeFarmId, 'treatments')
  }

  function init(farmId) {
    if (initialized.value) return
    initialized.value = true
    activeFarmId = farmId

    if (firebaseEnabled && db) {
      const q = query(collectionRef(), orderBy('date', 'desc'))
      onSnapshot(q, (snap) => {
        treatments.value = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        saveLS(treatments.value)
        ready.value = true
      })
    } else {
      try {
        const raw = localStorage.getItem(lsKey(activeFarmId))
        if (raw) treatments.value = sortDesc(JSON.parse(raw))
      } catch {}
      ready.value = true
    }
  }

  async function addTreatment(record, { silent = false } = {}) {
    if (firebaseEnabled && db) {
      await addDoc(collectionRef(), {
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
    if (!silent) useFarmStore().logChange('방제이력', treatmentLabel(record), 'add')
  }

  async function updateTreatment(id, record) {
    const before = treatments.value.find(t => t.id === id)
    if (firebaseEnabled && db) {
      await updateDoc(doc(db, 'farms', activeFarmId, 'treatments', id), record)
    } else {
      treatments.value = sortDesc(
        treatments.value.map(t => t.id === id ? { ...t, ...record } : t),
      )
      saveLS(treatments.value)
    }
    const fields = diffTreatmentFields(before, record)
    useFarmStore().logChange('방제이력', treatmentLabel(record), 'update', formatTreatmentFieldDiff(fields), { refId: id, fields })
  }

  async function replaceAllTreatments(records) {
    const prevCount = treatments.value.length
    if (firebaseEnabled && db) {
      for (const t of treatments.value) {
        await deleteDoc(doc(db, 'farms', activeFarmId, 'treatments', t.id))
      }
      for (const r of records) {
        const data = Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'id'))
        await addDoc(collectionRef(), data)
      }
    } else {
      treatments.value = sortDesc(
        records.map((r, i) => ({ ...r, id: r.id || `restored-${Date.now()}-${i}` })),
      )
      saveLS(treatments.value)
    }
    if (records.length === 0) {
      if (prevCount > 0) useFarmStore().logChange('방제이력', `전체 초기화 (${prevCount}건)`, 'delete')
    } else {
      useFarmStore().logChange('방제이력', `일괄 교체 (${records.length}건)`, 'update')
    }
  }

  async function deleteTreatment(id) {
    const target = treatments.value.find(t => t.id === id)
    if (firebaseEnabled && db) {
      await deleteDoc(doc(db, 'farms', activeFarmId, 'treatments', id))
    } else {
      treatments.value = treatments.value.filter(t => t.id !== id)
      saveLS(treatments.value)
    }
    if (target) {
      useFarmStore().logChange('방제이력', treatmentLabel(target), 'delete', '', { snapshot: snapshotForRevert(target) })
    }
  }

  // 변경 이력의 "방제이력" 항목을 되돌린다. entity가 farmStore가 아니라 이 스토어 소속이라
  // SettingsView에서 entity로 분기해 이 함수를 부른다(farmStore.revertChangeLogEntry와 대응).
  async function revertTreatmentLogEntry(entry) {
    if (entry.action === 'update') {
      if (!entry.refId || !entry.fields) return { ok: false, reason: '되돌릴 정보가 없습니다.' }
      if (!treatments.value.some((t) => t.id === entry.refId)) {
        return { ok: false, reason: '이미 삭제된 항목이라 되돌릴 수 없습니다.' }
      }
      const patch = {}
      for (const [key, field] of Object.entries(entry.fields)) {
        patch[key] = field.from
      }
      await updateTreatment(entry.refId, patch)
      return { ok: true }
    }
    if (entry.action === 'delete') {
      if (!entry.snapshot) return { ok: false, reason: '되돌릴 정보가 저장되어 있지 않습니다.' }
      const rest = Object.fromEntries(
        Object.entries(entry.snapshot).filter(([k]) => k !== 'id' && k !== 'createdAt'),
      )
      await addTreatment(rest)
      return { ok: true }
    }
    return { ok: false, reason: '이 종류의 기록은 되돌리기를 지원하지 않습니다.' }
  }

  return {
    treatments, ready, init, addTreatment, updateTreatment, deleteTreatment, replaceAllTreatments,
    revertTreatmentLogEntry,
  }
})
