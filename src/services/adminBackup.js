import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc,
} from 'firebase/firestore'
import { db } from './firebase.js'

const BACKUP_TYPE = 'citrus-admin-backup'

// 시스템 관리 모드 전용 백업: 공통 설정(appSettings) + 등록된 모든 농장의 데이터.
// 농장 모드 백업(farmStore.exportBackup 등)과 달리 사진 본문은 포함하지 않는다(용량이 커질 수 있어
// 필요 시 각 농장에서 개별적으로 백업/복원하도록 안내한다).
export async function exportAllFarmsBackup() {
  const appSettingsSnap = await getDoc(doc(db, 'shared', 'appSettings'))
  const farmsSnap = await getDocs(collection(db, 'farms'))

  const farms = {}
  for (const farmDoc of farmsSnap.docs) {
    const farmId = farmDoc.id
    const [farmDataSnap, apSnap, recSnap, treatSnap] = await Promise.all([
      getDoc(doc(db, 'farms', farmId, 'data', 'farmData')),
      getDoc(doc(db, 'farms', farmId, 'data', 'availablePesticide')),
      getDoc(doc(db, 'farms', farmId, 'data', 'recommendSettings')),
      getDocs(collection(db, 'farms', farmId, 'treatments')),
    ])
    farms[farmId] = {
      meta: farmDoc.data(),
      farmData: farmDataSnap.exists() ? farmDataSnap.data() : null,
      availablePesticide: apSnap.exists() ? apSnap.data() : null,
      recommendSettings: recSnap.exists() ? recSnap.data() : null,
      treatments: treatSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    }
  }

  return {
    type: BACKUP_TYPE,
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      appSettings: appSettingsSnap.exists() ? appSettingsSnap.data() : {},
      farms,
    },
  }
}

export function isValidAllFarmsBackup(payload) {
  return !!(payload && payload.type === BACKUP_TYPE && payload.data && typeof payload.data === 'object')
}

export function allFarmsBackupSummary(payload) {
  const farmEntries = Object.entries(payload?.data?.farms ?? {})
  return {
    farmCount: farmEntries.length,
    farms: farmEntries.map(([id, f]) => ({
      id,
      name: f?.meta?.name ?? id,
      treatments: Array.isArray(f?.treatments) ? f.treatments.length : 0,
    })),
    hasAppSettings: !!(payload?.data?.appSettings && Object.keys(payload.data.appSettings).length),
  }
}

// 백업에 있는 농장을 그대로 덮어쓰고(+없는 필드는 유지), 백업에 없던 농장은 건드리지 않는다.
export async function restoreAllFarmsBackup(payload) {
  if (!isValidAllFarmsBackup(payload)) {
    throw new Error('invalid-admin-backup')
  }

  const { appSettings, farms } = payload.data

  if (appSettings && typeof appSettings === 'object') {
    await setDoc(doc(db, 'shared', 'appSettings'), appSettings, { merge: true })
  }

  for (const [farmId, farmPayload] of Object.entries(farms || {})) {
    if (farmPayload.meta) {
      await setDoc(doc(db, 'farms', farmId), farmPayload.meta, { merge: true })
    }
    if (farmPayload.farmData) {
      await setDoc(doc(db, 'farms', farmId, 'data', 'farmData'), farmPayload.farmData, { merge: true })
    }
    if (farmPayload.availablePesticide) {
      await setDoc(doc(db, 'farms', farmId, 'data', 'availablePesticide'), farmPayload.availablePesticide, { merge: true })
    }
    if (farmPayload.recommendSettings) {
      await setDoc(doc(db, 'farms', farmId, 'data', 'recommendSettings'), farmPayload.recommendSettings, { merge: true })
    }
    if (Array.isArray(farmPayload.treatments)) {
      const existing = await getDocs(collection(db, 'farms', farmId, 'treatments'))
      for (const d of existing.docs) {
        await deleteDoc(d.ref)
      }
      for (const t of farmPayload.treatments) {
        const { id, ...rest } = t
        await setDoc(doc(db, 'farms', farmId, 'treatments', id || crypto.randomUUID()), rest)
      }
    }
  }
}
