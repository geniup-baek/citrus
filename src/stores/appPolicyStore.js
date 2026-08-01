import { defineStore } from 'pinia'
import { nextTick, reactive, watch } from 'vue'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db, firebaseEnabled } from '../services/firebase.js'

// 모든 기기·모든 농장에 공통으로 적용되는 정책. 시스템 관리 모드에서만 변경한다.
//
// 분류·항목 설정(farmStore의 appSettings)과 달리 farmStore는 활성 농장이 있어야 초기화되므로
// 관리 모드에서는 Firestore와 연결되지 않는다. 그래서 농장과 무관하게 동작하는 별도 스토어로 둔다.
// 문서 위치는 sharedCache 컬렉션 — 기존 규칙(firestore.rules)이 이미 허용하는 경로라
// 규칙 배포 없이도 바로 동기화된다.
const DOC_PATH = ['sharedCache', 'app:policy']
const LS_KEY = 'citrus:app-policy'
const LEGACY_PREF_LS_KEY = 'citrus:recommend-prefs' // 기기 로컬 설정이던 시절의 값 (1회 이전용)

const DEFAULTS = {
  allowManualPesticideForAll: true, // 농약 직접등록(자료 > 농약)을 농장 모드에서도 허용할지
}

const KEYS = Object.keys(DEFAULTS)

function pick(obj) {
  const out = {}
  KEYS.forEach((k) => { if (obj?.[k] !== undefined) out[k] = obj[k] })
  return out
}

export const useAppPolicyStore = defineStore('appPolicy', () => {
  let saved = {}
  try { saved = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') } catch {}
  let legacy = {}
  try { legacy = JSON.parse(localStorage.getItem(LEGACY_PREF_LS_KEY) ?? '{}') } catch {}

  // 원격 값이 도착하기 전(오프라인 포함)에도 마지막으로 받은 값으로 동작한다.
  const policy = reactive({ ...DEFAULTS, ...pick(legacy), ...pick(saved) })

  let initialized = false
  let applyingRemote = false
  let writeTimer = null

  function persistLocal() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(pick(policy))) } catch {}
  }

  function scheduleWrite() {
    if (!firebaseEnabled || !db) return
    clearTimeout(writeTimer)
    writeTimer = setTimeout(async () => {
      try {
        await setDoc(doc(db, ...DOC_PATH), pick(policy), { merge: true })
      } catch (e) {
        console.warn('[appPolicyStore] Firestore write failed, will retry on next change.', e)
      }
    }, 500)
  }

  // 원격 스냅샷을 반영하는 중에는 되돌려 쓰지 않는다(무한 왕복 방지).
  watch(() => pick(policy), () => {
    persistLocal()
    if (applyingRemote) return
    scheduleWrite()
  }, { deep: true })

  // 농장 선택과 무관하게 앱 시작 시 한 번 호출한다(관리 모드에서도 동작해야 한다).
  function init() {
    if (initialized) return
    initialized = true
    if (!firebaseEnabled || !db) return

    onSnapshot(doc(db, ...DOC_PATH), (snapshot) => {
      applyingRemote = true
      if (snapshot.exists()) {
        Object.assign(policy, pick(snapshot.data()))
        persistLocal()
      } else if (Object.keys(pick(legacy)).length) {
        // 기기 로컬 설정만 있던 시절의 값을 공유 문서로 1회 승격한다.
        scheduleWrite()
      }
      nextTick(() => { applyingRemote = false })
    })
  }

  return { policy, init }
})
