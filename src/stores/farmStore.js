import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { endOfMonth, endOfWeek, isSameDay, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db, firebaseEnabled } from '../services/firebase'
import { defaultAppSettings } from '../data/defaults'
import { createDefaultFarmData, normalizeAppSettings, normalizeFarmData, normalizeInventoryItem, normalizeIssue, normalizeRule, normalizeScheduleSettings, normalizeUsageGuide, farmStorageKey } from './farmStore/normalize.js'
import { createChangeLogActions } from './farmStore/changeLog.js'
import { createRevertActions } from './farmStore/revert.js'
import { createPhotoActions } from './farmStore/photos.js'
import { createFacilityActions } from './farmStore/facilities.js'
import { createAncillaryActions } from './farmStore/ancillaries.js'
import { createSeedlingActions } from './farmStore/seedlings.js'
import { createTaskActions } from './farmStore/tasks.js'
import { createSchedulerActions } from './farmStore/scheduler.js'
import { createIssueActions } from './farmStore/issues.js'
import { createUsageGuideActions } from './farmStore/usageGuides.js'
import { createInventoryActions } from './farmStore/inventory.js'
import { createBackupActions } from './farmStore/backup.js'

// 이 파일은 스토어의 배관(초기화·저장·구독)과 각 도메인 모듈을 엮는 역할만 한다.
// 실제 CRUD 로직은 ./farmStore/*.js에 도메인별로 나뉘어 있다 — 전체 구조는
// MAINTENANCE.md의 "스토어 지도"와 src/stores/farmStore/ 폴더의 파일 목록을 참고.

const APP_SETTINGS_LS_KEY = 'citrus:app-settings' // 공통(농장 무관) 분류·항목 설정
const ACTOR_NAME_LS_KEY = 'citrus:actor-name' // 이 기기에서 변경 이력에 표시할 이름(기기별 로컬 저장, 서버 동기화 안 함)

export const useFarmStore = defineStore('farm', () => {
  const initialized = ref(false)
  const state = ref({ ...createDefaultFarmData(), appSettings: { ...defaultAppSettings } })
  const unsubscriber = ref(null)
  let appSettingsUnsub = null
  let activeFarmId = null

  // 이 기기에서 변경 이력에 표시할 이름(로그인 없이 기기별로 로컬에만 저장, 농장 데이터와 별도)
  const actorName = ref('')
  try {
    actorName.value = localStorage.getItem(ACTOR_NAME_LS_KEY) || ''
  } catch {
    /* noop */
  }

  function setActorName(name) {
    actorName.value = (name || '').trim()
    try {
      localStorage.setItem(ACTOR_NAME_LS_KEY, actorName.value)
    } catch {
      /* noop */
    }
  }

  const today = computed(() => new Date())
  const weekStart = computed(() => startOfWeek(today.value, { weekStartsOn: 1 }))
  const weekEnd = computed(() => endOfWeek(today.value, { weekStartsOn: 1 }))
  const monthStart = computed(() => startOfMonth(today.value))
  const monthEnd = computed(() => endOfMonth(today.value))

  const openIssues = computed(() =>
    state.value.issues.filter((issue) => issue.status !== '해결'),
  )

  const taskSummary = computed(() => {
    const counts = { '예정': 0, '진행중': 0, '완료': 0 }
    state.value.tasks.forEach((task) => {
      counts[task.status] += 1
    })
    return counts
  })

  const tasksToday = computed(() =>
    state.value.tasks.filter((task) => isSameDay(parseISO(task.dueDate), today.value)),
  )

  const tasksThisWeek = computed(() =>
    state.value.tasks.filter((task) => {
      const due = parseISO(task.dueDate)
      return due >= weekStart.value && due <= weekEnd.value
    }),
  )

  const tasksThisMonth = computed(() =>
    state.value.tasks.filter((task) => {
      const due = parseISO(task.dueDate)
      return due >= monthStart.value && due <= monthEnd.value
    }),
  )

  function persistLocal() {
    if (!activeFarmId) return
    const { appSettings, ...farmData } = state.value
    localStorage.setItem(farmStorageKey(activeFarmId), JSON.stringify(farmData))
    localStorage.setItem(APP_SETTINGS_LS_KEY, JSON.stringify(appSettings))
  }

  let firestoreDebounceTimer = null

  function scheduleFirestoreWrite() {
    if (!firebaseEnabled || !db || !activeFarmId) return
    clearTimeout(firestoreDebounceTimer)
    firestoreDebounceTimer = setTimeout(async () => {
      try {
        const { appSettings, ...farmData } = state.value
        const ref = doc(db, 'farms', activeFarmId, 'data', 'farmData')
        await setDoc(ref, farmData, { merge: true })
      } catch (e) {
        console.warn('[farmStore] Firestore write failed, will retry on next change.', e)
      }
    }, 500)
  }

  let appSettingsDebounceTimer = null

  function scheduleAppSettingsWrite() {
    if (!firebaseEnabled || !db) return
    clearTimeout(appSettingsDebounceTimer)
    appSettingsDebounceTimer = setTimeout(async () => {
      try {
        await setDoc(doc(db, 'shared', 'appSettings'), state.value.appSettings, { merge: true })
      } catch (e) {
        console.warn('[farmStore] appSettings Firestore write failed, will retry on next change.', e)
      }
    }, 500)
  }

  async function persistAll() {
    state.value.updatedAt = new Date().toISOString()
    persistLocal()
    scheduleFirestoreWrite()
    photoActions.gcOrphanPhotos()
  }

  // ── 변경 이력(감사 로그) ──────────────────────────────────────────────────────
  const { logChange, facilityNameById } = createChangeLogActions(state, actorName)

  // ── 사진 분산 저장 ───────────────────────────────────────────────────────────
  const photoActions = createPhotoActions(state, persistAll)

  function loadLocal() {
    const raw = localStorage.getItem(farmStorageKey(activeFarmId))
    const rawSettings = localStorage.getItem(APP_SETTINGS_LS_KEY)

    let farmData = null
    try { farmData = raw ? JSON.parse(raw) : null } catch { farmData = null }
    let appSettings = null
    try { appSettings = rawSettings ? JSON.parse(rawSettings) : null } catch { appSettings = null }

    state.value = {
      ...normalizeFarmData(farmData),
      appSettings: normalizeAppSettings(appSettings),
    }
    if (!raw) persistLocal()
  }

  let appSettingsInitialized = false

  // 분류·항목(appSettings)은 모든 농장이 공유하는 문서라 농장 선택과 무관하다.
  // 시스템 관리 모드에는 활성 농장이 없어 init(farmId)가 호출되지 않으므로,
  // 그 화면에서도 실시간 데이터를 읽을 수 있도록 별도로 구독한다(App.vue에서 무조건 호출).
  function initAppSettings() {
    if (appSettingsInitialized) return
    appSettingsInitialized = true
    if (!firebaseEnabled || !db) return
    const appSettingsRef = doc(db, 'shared', 'appSettings')
    appSettingsUnsub = onSnapshot(appSettingsRef, (snapshot) => {
      state.value.appSettings = normalizeAppSettings(snapshot.exists() ? snapshot.data() : null)
    })
  }

  // farmId: 활성 농장 id. farmsStore에서 결정되어 App.vue가 넘겨준다.
  async function init(farmId) {
    if (initialized.value) {
      return
    }
    activeFarmId = farmId

    if (firebaseEnabled && db) {
      const ref = doc(db, 'farms', farmId, 'data', 'farmData')

      unsubscriber.value = onSnapshot(ref, async (snapshot) => {
        if (snapshot.exists()) {
          const normalized = normalizeFarmData(snapshot.data())
          normalized.scheduleRules = normalized.scheduleRules.map((rule) => normalizeRule(rule))
          normalized.scheduleSettings = normalizeScheduleSettings(normalized.scheduleSettings)
          normalized.issues = normalized.issues.map((issue) => normalizeIssue(issue))
          normalized.inventory = normalized.inventory.map((item) => normalizeInventoryItem(item))
          normalized.usageGuides = normalized.usageGuides.map((guide) => normalizeUsageGuide(guide))
          state.value = { ...state.value, ...normalized }
          persistLocal()
          photoActions.resetKnownPhotoIds()
          await photoActions.migrateInlinePhotos()
        } else {
          state.value = { ...state.value, ...createDefaultFarmData() }
          await persistAll()
        }
      })
    } else {
      loadLocal()
      state.value.scheduleRules = state.value.scheduleRules.map((rule) => normalizeRule(rule))
      state.value.scheduleSettings = normalizeScheduleSettings(state.value.scheduleSettings)
      state.value.issues = state.value.issues.map((issue) => normalizeIssue(issue))
      state.value.inventory = state.value.inventory.map((item) => normalizeInventoryItem(item))
      state.value.usageGuides = state.value.usageGuides.map((guide) => normalizeUsageGuide(guide))
      photoActions.resetKnownPhotoIds()
      await schedulerActions.runTaskScheduler({
        daysAhead: state.value.scheduleSettings.generationDays,
        duplicatePolicy: state.value.scheduleSettings.duplicatePolicy,
        persist: true,
      })
    }

    initialized.value = true
  }

  function cleanup() {
    if (typeof unsubscriber.value === 'function') {
      unsubscriber.value()
      unsubscriber.value = null
    }
    if (typeof appSettingsUnsub === 'function') {
      appSettingsUnsub()
      appSettingsUnsub = null
    }
  }

  async function updateAppSettings(payload) {
    state.value.appSettings = { ...state.value.appSettings, ...payload }
    try { localStorage.setItem(APP_SETTINGS_LS_KEY, JSON.stringify(state.value.appSettings)) } catch {}
    scheduleAppSettingsWrite()
  }

  // ── 도메인 모듈 조립 ─────────────────────────────────────────────────────────
  // 모든 도메인 모듈이 공유하는 컨텍스트. logChange/facilityNameById는 changeLog.js,
  // photoCache 등은 photos.js에서 만든 것을 그대로 넘긴다.
  const ctx = {
    state,
    persistAll,
    logChange,
    facilityNameById,
    photoCache: photoActions.photoCache,
    savePhotos: photoActions.savePhotos,
    currentReferencedPhotoIds: photoActions.currentReferencedPhotoIds,
    migrateInlinePhotos: photoActions.migrateInlinePhotos,
    appSettingsLsKey: APP_SETTINGS_LS_KEY,
    scheduleAppSettingsWrite,
  }

  const facilityActions = createFacilityActions(ctx)
  const ancillaryActions = createAncillaryActions(ctx)
  const seedlingActions = createSeedlingActions(ctx)
  const taskActions = createTaskActions(ctx)
  const schedulerActions = createSchedulerActions(ctx)
  const issueActions = createIssueActions(ctx)
  const usageGuideActions = createUsageGuideActions(ctx)
  const inventoryActions = createInventoryActions(ctx)
  const backupActions = createBackupActions(ctx)

  // 되돌리기는 위 도메인 모듈들의 upsert/update 함수를 그대로 호출해야 하므로,
  // 전부 만들어진 뒤 마지막에 registry로 묶어 넘긴다(순환 참조 회피).
  const revertActions = createRevertActions(state, persistAll, {
    upsertFacility: facilityActions.upsertFacility,
    upsertAncillary: ancillaryActions.upsertAncillary,
    upsertSeedling: seedlingActions.upsertSeedling,
    upsertTask: taskActions.upsertTask,
    upsertIssue: issueActions.upsertIssue,
    upsertUsageGuide: usageGuideActions.upsertUsageGuide,
    upsertInventoryItem: inventoryActions.upsertInventoryItem,
    updateTaskLog: taskActions.updateTaskLog,
    updateSeedlingLog: seedlingActions.updateSeedlingLog,
    updateIssueResolutionStep: issueActions.updateIssueResolutionStep,
    updateUsageGuideStep: usageGuideActions.updateUsageGuideStep,
    updateInventoryTxn: inventoryActions.updateInventoryTxn,
  })

  return {
    firebaseEnabled,
    initialized,
    state,
    openIssues,
    taskSummary,
    tasksToday,
    tasksThisWeek,
    tasksThisMonth,
    init,
    initAppSettings,
    cleanup,
    photoSrc: photoActions.photoSrc,
    savePhotos: photoActions.savePhotos,
    updateAppSettings,
    ...facilityActions,
    ...ancillaryActions,
    ...seedlingActions,
    ...taskActions,
    ...schedulerActions,
    ...issueActions,
    ...usageGuideActions,
    ...inventoryActions,
    ...backupActions,
    actorName,
    setActorName,
    logChange,
    ...revertActions,
  }
})
