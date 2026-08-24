import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc,
} from 'firebase/firestore'
import { db } from './firebase.js'

const BACKUP_TYPE = 'citrus-admin-backup'
const CHANGE_LOG_LIMIT = 300 // farmStore.js의 값과 맞춘다

// sharedCache 중 사용자가 만든 데이터라 다시 만들 수 없는 것들.
// (pesticide:all·detail-index·병해충 캐시 등은 공공데이터에서 다시 받으면 되므로 백업에 넣지 않는다)
const SHARED_CACHE_DOCS = [
  'pesticide:manual', // 공공데이터에 없어 직접 등록한 농약
  'app:policy',       // 전 기기 공통 정책(농약 직접등록 권한 등)
]

// 시스템 관리 모드 전용 백업: 공통 설정(appSettings) + 공용 데이터 + 등록된 모든 농장의 데이터.
// 농장 모드 백업(farmStore.exportBackup 등)과 달리 사진 본문은 포함하지 않는다(용량이 커질 수 있어
// 필요 시 각 농장에서 개별적으로 백업/복원하도록 안내한다).
export async function exportAllFarmsBackup() {
  const appSettingsSnap = await getDoc(doc(db, 'shared', 'appSettings'))
  const sharedCacheSnaps = await Promise.all(
    SHARED_CACHE_DOCS.map((key) => getDoc(doc(db, 'sharedCache', key))),
  )
  const sharedCache = {}
  SHARED_CACHE_DOCS.forEach((key, i) => {
    if (sharedCacheSnaps[i].exists()) sharedCache[key] = sharedCacheSnaps[i].data()
  })

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
    version: 2, // 2부터 sharedCache 포함
    exportedAt: new Date().toISOString(),
    data: {
      appSettings: appSettingsSnap.exists() ? appSettingsSnap.data() : {},
      sharedCache,
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
    manualPesticides: (payload?.data?.sharedCache?.['pesticide:manual']?.data ?? []).length,
  }
}

// 백업에 있는 농장을 그대로 덮어쓰고(+없는 필드는 유지), 백업에 없던 농장은 건드리지 않는다.
export async function restoreAllFarmsBackup(payload) {
  if (!isValidAllFarmsBackup(payload)) {
    throw new Error('invalid-admin-backup')
  }

  const { appSettings, sharedCache, farms } = payload.data

  if (appSettings && typeof appSettings === 'object') {
    await setDoc(doc(db, 'shared', 'appSettings'), appSettings, { merge: true })
  }

  // 구버전(version 1) 백업에는 sharedCache가 없다 — 그때는 이 단계를 건너뛴다.
  // 백업에 담기로 한 문서만 복원한다(알 수 없는 키가 섞여 들어오는 것을 막는다).
  for (const key of SHARED_CACHE_DOCS) {
    const value = sharedCache?.[key]
    if (value && typeof value === 'object') {
      await setDoc(doc(db, 'sharedCache', key), value, { merge: true })
    }
  }

  for (const [farmId, farmPayload] of Object.entries(farms || {})) {
    if (farmPayload.meta) {
      await setDoc(doc(db, 'farms', farmId), farmPayload.meta, { merge: true })
    }
    if (farmPayload.farmData) {
      // 변경 이력(changeLog)은 백업 시점 스냅샷으로 통째로 덮어쓰면 그 사이에 쌓인 기록이 사라진다.
      // farmData 문서 안에 같이 들어있으므로, 쓰기 전에 현재 값과 id 기준으로 합쳐서 보존한다.
      const farmDataToWrite = { ...farmPayload.farmData }
      const incomingLog = Array.isArray(farmDataToWrite.changeLog) ? farmDataToWrite.changeLog : []
      if (incomingLog.length > 0) {
        const currentSnap = await getDoc(doc(db, 'farms', farmId, 'data', 'farmData'))
        const currentLog = Array.isArray(currentSnap.data()?.changeLog) ? currentSnap.data().changeLog : []
        const seenIds = new Set()
        farmDataToWrite.changeLog = [...incomingLog, ...currentLog]
          .filter((entry) => {
            if (!entry?.id || seenIds.has(entry.id)) return false
            seenIds.add(entry.id)
            return true
          })
          .sort((a, b) => (b.at || '').localeCompare(a.at || ''))
          .slice(0, CHANGE_LOG_LIMIT)
      }
      await setDoc(doc(db, 'farms', farmId, 'data', 'farmData'), farmDataToWrite, { merge: true })
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
