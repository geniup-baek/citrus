import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  formatISO,
  getISODay,
  isAfter,
  isBefore,
  lastDayOfMonth,
  isSameDay,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { deleteDoc, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore'
import {
  annualTaskTemplates,
  defaultAncillaries,
  defaultAppSettings,
  defaultFacilities,
  defaultIssues,
  defaultScheduleSettings,
  defaultScheduleRules,
  defaultSeedlings,
  defaultTasks,
  defaultInventory,
} from '../data/defaults'
import { db, firebaseEnabled } from '../services/firebase'

const STORAGE_KEY = 'citrus-farm-shared-v1'

function createDefaultData() {
  return {
    facilities: [...defaultFacilities],
    ancillaries: [...defaultAncillaries],
    appSettings: { ...defaultAppSettings },
    seedlings: [...defaultSeedlings],
    tasks: [...defaultTasks],
    scheduleRules: [...defaultScheduleRules],
    scheduleSettings: { ...defaultScheduleSettings },
    issues: [...defaultIssues],
    inventory: [...defaultInventory],
    annualTaskTemplates: [...annualTaskTemplates],
    notifications: {},
    updatedAt: new Date().toISOString(),
  }
}

function normalizeData(data) {
  const defaults = createDefaultData()

  return {
    facilities: Array.isArray(data?.facilities) ? data.facilities : defaults.facilities,
    ancillaries: Array.isArray(data?.ancillaries) ? data.ancillaries : defaults.ancillaries,
    appSettings: (() => {
      const stored = data?.appSettings && typeof data.appSettings === 'object' ? data.appSettings : {}
      const merged = { ...defaults.appSettings, ...stored }
      const storedCats = Array.isArray(stored.taskCategories) ? stored.taskCategories : []
      merged.taskCategories = [...new Set([...defaults.appSettings.taskCategories, ...storedCats])]
      const storedRootstocks = Array.isArray(stored.rootstockTypes) ? stored.rootstockTypes : []
      merged.rootstockTypes = [...new Set([...defaults.appSettings.rootstockTypes, ...storedRootstocks])]
      const storedEquipment = Array.isArray(stored.equipmentTypes) ? stored.equipmentTypes : []
      merged.equipmentTypes = [...new Set([...defaults.appSettings.equipmentTypes, ...storedEquipment])]
      const storedPesticideTypes = Array.isArray(stored.pesticideTypes) ? stored.pesticideTypes : []
      merged.pesticideTypes = [...new Set([...defaults.appSettings.pesticideTypes, ...storedPesticideTypes])]
      return merged
    })(),
    seedlings: Array.isArray(data?.seedlings) ? data.seedlings : defaults.seedlings,
    tasks: Array.isArray(data?.tasks) ? data.tasks : defaults.tasks,
    scheduleRules: Array.isArray(data?.scheduleRules)
      ? data.scheduleRules
      : defaults.scheduleRules,
    scheduleSettings:
      data?.scheduleSettings && typeof data.scheduleSettings === 'object'
        ? { ...defaults.scheduleSettings, ...data.scheduleSettings }
        : defaults.scheduleSettings,
    issues: Array.isArray(data?.issues) ? data.issues : defaults.issues,
    inventory: Array.isArray(data?.inventory) ? data.inventory : defaults.inventory,
    annualTaskTemplates: [...annualTaskTemplates],
    notifications:
      data?.notifications && typeof data.notifications === 'object'
        ? data.notifications
        : defaults.notifications,
    updatedAt: data?.updatedAt || defaults.updatedAt,
  }
}

function normalizeIssue(issue) {
  return {
    ...issue,
    resolutionSteps: Array.isArray(issue?.resolutionSteps) ? issue.resolutionSteps : [],
    photos: Array.isArray(issue?.photos) ? issue.photos : [],
  }
}

function normalizeInventoryItem(item) {
  // 로트(규격+유효기간) 기반: 현재 재고는 txns로부터 계산하므로 품목엔 메타 + txns만 보관한다.
  // 구버전(품목당 단일 수량/단위) 데이터는 unit→규격, expiryDate→유효기간으로 이전한다.
  const fallbackVolume = item?.unit || '기본'
  const fallbackExpiry = item?.expiryDate || ''
  const txns = (Array.isArray(item?.txns) ? item.txns : []).map((t) => ({
    id: t.id || crypto.randomUUID(),
    date: t.date || new Date().toISOString(),
    type: t.type === '사용' ? '사용' : '입고',
    volume: t.volume || fallbackVolume,
    expiryDate: t.expiryDate || fallbackExpiry,
    amount: Math.abs(Number(t.amount) || 0),
    note: t.note || '',
  }))
  return {
    id: item?.id,
    name: item?.name || '',
    category: item?.category === '농약' ? '농약' : '비료',
    pesticideType: item?.pesticideType || '',
    actionGroup: item?.actionGroup || '',
    productName: item?.productName || '',
    notes: item?.notes || '',
    txns,
  }
}

function normalizeRule(rule) {
  return {
    ...rule,
    interval: Math.max(1, Number(rule?.interval || 1)),
    dayOfWeek: Math.max(1, Math.min(7, Number(rule?.dayOfWeek || 1))),
    dayOfMonth: Math.max(1, Math.min(31, Number(rule?.dayOfMonth || 1))),
    enabled: rule?.enabled !== false,
  }
}

function normalizeScheduleSettings(settings) {
  return {
    generationDays: Math.max(1, Math.min(180, Number(settings?.generationDays || 21))),
    duplicatePolicy: ['rule-and-date', 'title-and-date', 'allow'].includes(settings?.duplicatePolicy)
      ? settings.duplicatePolicy
      : 'rule-and-date',
  }
}

function monthsDiff(fromDate, toDate) {
  return (toDate.getFullYear() - fromDate.getFullYear()) * 12 + (toDate.getMonth() - fromDate.getMonth())
}

function matchRuleOnDate(rule, date) {
  const start = parseISO(rule.startDate)
  if (isBefore(date, start)) {
    return false
  }

  if (rule.endDate) {
    const end = parseISO(rule.endDate)
    if (isAfter(date, end)) {
      return false
    }
  }

  const interval = Math.max(1, Number(rule.interval || 1))
  const dayDiff = differenceInCalendarDays(date, start)

  if (rule.frequency === '매일') {
    return dayDiff % interval === 0
  }

  if (rule.frequency === '매주') {
    const weekday = Number(rule.dayOfWeek || getISODay(start))
    if (getISODay(date) !== weekday) {
      return false
    }

    return Math.floor(dayDiff / 7) % interval === 0
  }

  const monthDelta = monthsDiff(start, date)
  if (monthDelta < 0 || monthDelta % interval !== 0) {
    return false
  }

  const requestedDay = Number(rule.dayOfMonth || start.getDate())
  const clampedDay = Math.min(requestedDay, lastDayOfMonth(date).getDate())
  return date.getDate() === clampedDay
}

function toKey(dateString) {
  const date = parseISO(dateString)
  return formatISO(date, { representation: 'date' })
}

function scoreSimilarity(base, sample) {
  const tokenize = (text) =>
    new Set(
      String(text || '')
        .toLowerCase()
        .split(/[^a-z0-9\uac00-\ud7a3]+/)
        .filter((token) => token.length > 2),
    )

  const a = tokenize(base)
  const b = tokenize(sample)

  if (!a.size || !b.size) {
    return 0
  }

  let overlap = 0

  a.forEach((token) => {
    if (b.has(token)) {
      overlap += 1
    }
  })

  return overlap / new Set([...a, ...b]).size
}

function createPhotoTokenSet(photos = []) {
  const tokens = []

  photos.forEach((photo) => {
    const source = [
      photo?.name,
      photo?.contentType,
      photo?.width ? `w${photo.width}` : '',
      photo?.height ? `h${photo.height}` : '',
      photo?.size ? `s${Math.round(photo.size / 10000)}` : '',
    ].join(' ')

    source
      .toLowerCase()
      .split(/[^a-z0-9\uac00-\ud7a3]+/)
      .filter((token) => token.length > 1)
      .forEach((token) => tokens.push(token))
  })

  return new Set(tokens)
}

function scoreTokenSetSimilarity(sourceSet, targetSet) {
  if (!sourceSet.size || !targetSet.size) {
    return 0
  }

  let hit = 0
  sourceSet.forEach((token) => {
    if (targetSet.has(token)) {
      hit += 1
    }
  })

  return hit / new Set([...sourceSet, ...targetSet]).size
}

export const useFarmStore = defineStore('farm', () => {
  const initialized = ref(false)
  const state = ref(createDefaultData())
  const unsubscriber = ref(null)

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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.value))
  }

  let firestoreDebounceTimer = null

  function scheduleFirestoreWrite() {
    if (!firebaseEnabled || !db) return
    clearTimeout(firestoreDebounceTimer)
    firestoreDebounceTimer = setTimeout(async () => {
      try {
        const ref = doc(db, 'shared', 'farmData')
        await setDoc(ref, state.value, { merge: true })
      } catch (e) {
        console.warn('[farmStore] Firestore write failed, will retry on next change.', e)
      }
    }, 500)
  }

  async function persistAll() {
    state.value.updatedAt = new Date().toISOString()
    persistLocal()
    scheduleFirestoreWrite()
    gcOrphanPhotos()
  }

  function loadLocal() {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      state.value = createDefaultData()
      persistLocal()
      return
    }

    try {
      state.value = normalizeData(JSON.parse(raw))
    } catch {
      state.value = createDefaultData()
      persistLocal()
    }
  }

  async function init() {
    if (initialized.value) {
      return
    }

    if (firebaseEnabled && db) {
      const ref = doc(db, 'shared', 'farmData')

      unsubscriber.value = onSnapshot(ref, async (snapshot) => {
        if (snapshot.exists()) {
          state.value = normalizeData(snapshot.data())
          state.value.scheduleRules = state.value.scheduleRules.map((rule) => normalizeRule(rule))
          state.value.scheduleSettings = normalizeScheduleSettings(state.value.scheduleSettings)
          state.value.issues = state.value.issues.map((issue) => normalizeIssue(issue))
          state.value.inventory = state.value.inventory.map((item) => normalizeInventoryItem(item))
          persistLocal()
          knownPhotoIds = currentReferencedPhotoIds()
          await migrateInlinePhotos()
        } else {
          state.value = createDefaultData()
          await persistAll()
        }
      })
    } else {
      loadLocal()
      state.value.scheduleRules = state.value.scheduleRules.map((rule) => normalizeRule(rule))
      state.value.scheduleSettings = normalizeScheduleSettings(state.value.scheduleSettings)
      state.value.issues = state.value.issues.map((issue) => normalizeIssue(issue))
      state.value.inventory = state.value.inventory.map((item) => normalizeInventoryItem(item))
      knownPhotoIds = currentReferencedPhotoIds()
      await runTaskScheduler({
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
  }

  // ── 사진 분산 저장 (Firestore 'photos' 컬렉션) ───────────────────────────────
  // 사진(base64)을 farmData 문서가 아닌 사진별 개별 문서에 저장해 문서 1 MiB 한도를 피한다.
  const photoCache = ref({}) // id -> dataUrl (메모리 캐시)
  const photoInflight = new Set()

  async function loadPhoto(id) {
    if (!firebaseEnabled || !db || !id) return
    if (photoCache.value[id] !== undefined) return
    try {
      const snap = await getDoc(doc(db, 'photos', id))
      photoCache.value = { ...photoCache.value, [id]: snap.exists() ? snap.data().dataUrl || '' : '' }
    } catch (e) {
      console.warn('[farmStore] 사진 로드 실패', id, e)
    }
  }

  // 템플릿에서 <img :src="store.photoSrc(photo)"> 형태로 사용.
  // 구버전/로컬 모드: 객체에 dataUrl이 박혀 있으면 그대로 사용.
  // 신버전: 캐시에서 찾고 없으면 지연 로드(렌더 사이드이펙트 회피 위해 microtask).
  function photoSrc(photo) {
    if (!photo) return ''
    if (photo.dataUrl) return photo.dataUrl
    if (!photo.id) return ''
    const cached = photoCache.value[photo.id]
    if (cached === undefined && !photoInflight.has(photo.id)) {
      photoInflight.add(photo.id)
      queueMicrotask(async () => {
        try {
          await loadPhoto(photo.id)
        } finally {
          photoInflight.delete(photo.id)
        }
      })
    }
    return cached || ''
  }

  // 미리보기 배열 → 저장용 메타데이터 배열. 사진 본문(base64)은 photos 컬렉션에 기록한다.
  async function savePhotos(previews = []) {
    const result = []
    for (const preview of previews) {
      const meta = {
        id: preview.id,
        name: preview.name,
        contentType: preview.contentType,
        size: preview.size,
        width: preview.width,
        height: preview.height,
        originalSize: preview.originalSize,
        createdAt: new Date().toISOString(),
      }
      if (firebaseEnabled && db) {
        await setDoc(doc(db, 'photos', preview.id), {
          dataUrl: preview.dataUrl,
          contentType: preview.contentType || 'image/jpeg',
          createdAt: meta.createdAt,
        })
        photoCache.value = { ...photoCache.value, [preview.id]: preview.dataUrl }
        result.push(meta)
      } else {
        // 로컬 전용 모드: 기존처럼 dataUrl을 그대로 보관.
        result.push({ ...meta, dataUrl: preview.dataUrl })
      }
    }
    return result
  }

  // 기존 farmData 문서에 인라인(base64)으로 박혀 있던 사진을 photos 컬렉션으로 1회 이전한다.
  function collectInlinePhotos() {
    const found = []
    const visit = (arr) => {
      if (!Array.isArray(arr)) return
      for (const p of arr) {
        if (p && typeof p.dataUrl === 'string' && p.dataUrl.startsWith('data:')) found.push(p)
      }
    }
    state.value.facilities?.forEach((f) => visit(f.photos))
    state.value.ancillaries?.forEach((a) => visit(a.photos))
    state.value.seedlings?.forEach((s) => s.growthLogs?.forEach((l) => visit(l.photos)))
    state.value.tasks?.forEach((t) => t.logs?.forEach((l) => visit(l.photos)))
    state.value.issues?.forEach((i) => {
      visit(i.photos)
      i.resolutionSteps?.forEach((st) => visit(st.photos))
    })
    return found
  }

  let photosMigrating = false
  async function migrateInlinePhotos() {
    if (!firebaseEnabled || !db || photosMigrating) return
    const inline = collectInlinePhotos()
    if (!inline.length) return
    photosMigrating = true
    try {
      for (const p of inline) {
        if (p.id) {
          await setDoc(doc(db, 'photos', p.id), {
            dataUrl: p.dataUrl,
            contentType: p.contentType || 'image/jpeg',
            createdAt: p.createdAt || new Date().toISOString(),
          })
          photoCache.value = { ...photoCache.value, [p.id]: p.dataUrl }
        }
        delete p.dataUrl
      }
      await persistAll()
    } catch (e) {
      console.warn('[farmStore] 사진 이전 실패', e)
    } finally {
      photosMigrating = false
    }
  }

  // 현재 데이터가 참조하는 모든 사진 id 집합
  function currentReferencedPhotoIds() {
    const ids = new Set()
    const visit = (arr) => {
      if (!Array.isArray(arr)) return
      for (const p of arr) if (p?.id) ids.add(p.id)
    }
    state.value.facilities?.forEach((f) => visit(f.photos))
    state.value.ancillaries?.forEach((a) => visit(a.photos))
    state.value.seedlings?.forEach((s) => s.growthLogs?.forEach((l) => visit(l.photos)))
    state.value.tasks?.forEach((t) => t.logs?.forEach((l) => visit(l.photos)))
    state.value.issues?.forEach((i) => {
      visit(i.photos)
      i.resolutionSteps?.forEach((st) => visit(st.photos))
    })
    return ids
  }

  // 직전 저장 시점에 참조되던 사진 id (이전·로드 시 시드)
  let knownPhotoIds = new Set()

  // persistAll 직후 호출: 더 이상 참조되지 않는 사진 문서를 정리한다.
  // 폼 취소는 state를 바꾸지 않으므로 자연히 삭제 대상에서 제외된다.
  function gcOrphanPhotos() {
    if (!firebaseEnabled || !db) return
    const current = currentReferencedPhotoIds()
    const orphans = [...knownPhotoIds].filter((id) => !current.has(id))
    knownPhotoIds = current
    orphans.forEach((id) => {
      deleteDoc(doc(db, 'photos', id))
        .then(() => {
          const next = { ...photoCache.value }
          delete next[id]
          photoCache.value = next
        })
        .catch((e) => console.warn('[farmStore] 사진 문서 정리 실패', id, e))
    })
  }

  async function upsertFacility(payload) {
    const index = state.value.facilities.findIndex((item) => item.id === payload.id)

    if (index >= 0) {
      state.value.facilities[index] = { ...state.value.facilities[index], ...payload }
    } else {
      state.value.facilities.push({ ...payload, id: payload.id || crypto.randomUUID() })
    }

    await persistAll()
  }

  async function removeFacility(id) {
    state.value.facilities = state.value.facilities.filter((item) => item.id !== id)
    state.value.seedlings = state.value.seedlings.filter((item) => item.greenhouseId !== id)
    state.value.issues = state.value.issues.filter((item) => item.greenhouseId !== id)
    await persistAll()
  }

  async function upsertSeedling(payload) {
    const index = state.value.seedlings.findIndex((item) => item.id === payload.id)

    if (index >= 0) {
      state.value.seedlings[index] = { ...state.value.seedlings[index], ...payload }
    } else {
      state.value.seedlings.push({
        ...payload,
        id: payload.id || crypto.randomUUID(),
        growthLogs: Array.isArray(payload.growthLogs) ? payload.growthLogs : [],
      })
    }

    await persistAll()
  }

  async function addSeedlingsBatch(payloads) {
    for (const payload of payloads) {
      state.value.seedlings.push({
        ...payload,
        id: payload.id || crypto.randomUUID(),
        growthLogs: Array.isArray(payload.growthLogs) ? payload.growthLogs : [],
      })
    }
    await persistAll()
  }

  async function removeSeedling(id) {
    state.value.seedlings = state.value.seedlings.filter((item) => item.id !== id)
    await persistAll()
  }

  async function addSeedlingLog(seedlingId, note, photos = []) {
    const seedling = state.value.seedlings.find((item) => item.id === seedlingId)
    if (!seedling) {
      return
    }

    seedling.growthLogs = seedling.growthLogs || []
    seedling.growthLogs.unshift({
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      note,
      photos: Array.isArray(photos) ? photos : [],
    })

    await persistAll()
  }

  async function updateSeedlingLog(seedlingId, logId, patch) {
    const seedling = state.value.seedlings.find((item) => item.id === seedlingId)
    if (!seedling || !Array.isArray(seedling.growthLogs)) {
      return
    }

    const log = seedling.growthLogs.find((item) => (item.id || item.date) === logId)
    if (!log) {
      return
    }

    if (patch.note !== undefined) {
      log.note = patch.note
    }
    if (patch.photos !== undefined) {
      log.photos = Array.isArray(patch.photos) ? patch.photos : []
    }

    await persistAll()
  }

  async function removeSeedlingLog(seedlingId, logId) {
    const seedling = state.value.seedlings.find((item) => item.id === seedlingId)
    if (!seedling || !Array.isArray(seedling.growthLogs)) {
      return
    }

    seedling.growthLogs = seedling.growthLogs.filter((item) => (item.id || item.date) !== logId)
    await persistAll()
  }

  async function upsertTask(payload) {
    const index = state.value.tasks.findIndex((item) => item.id === payload.id)

    if (index >= 0) {
      state.value.tasks[index] = {
        ...state.value.tasks[index],
        ...payload,
      }
    } else {
      const dupKey = `${payload.title}|${payload.dueDate}`
      const alreadyExists = state.value.tasks.some(
        (t) => `${t.title}|${t.dueDate}` === dupKey,
      )
      if (!alreadyExists) {
        state.value.tasks.push({
          ...payload,
          id: payload.id || crypto.randomUUID(),
          logs: Array.isArray(payload.logs) ? payload.logs : [],
          status: payload.status || '예정',
          progress: Number(payload.progress || 0),
          autoGenerated: payload.autoGenerated === true,
          scheduleRuleId: payload.scheduleRuleId || null,
        })
      }
    }

    await persistAll()
  }

  async function removeTask(id) {
    state.value.tasks = state.value.tasks.filter((item) => item.id !== id)
    await persistAll()
  }

  async function addTaskLog(taskId, note, photos = []) {
    const task = state.value.tasks.find((item) => item.id === taskId)
    if (!task) {
      return
    }

    task.logs = task.logs || []
    task.logs.unshift({
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      note,
      photos: Array.isArray(photos) ? photos : [],
    })

    await persistAll()
  }

  async function updateTaskLog(taskId, logId, patch) {
    const task = state.value.tasks.find((item) => item.id === taskId)
    if (!task || !Array.isArray(task.logs)) {
      return
    }

    const log = task.logs.find((item) => (item.id || item.date) === logId)
    if (!log) {
      return
    }

    if (patch.note !== undefined) {
      log.note = patch.note
    }
    if (patch.photos !== undefined) {
      log.photos = Array.isArray(patch.photos) ? patch.photos : []
    }

    await persistAll()
  }

  async function removeTaskLog(taskId, logId) {
    const task = state.value.tasks.find((item) => item.id === taskId)
    if (!task || !Array.isArray(task.logs)) {
      return
    }

    task.logs = task.logs.filter((item) => (item.id || item.date) !== logId)
    await persistAll()
  }

  async function upsertIssue(payload) {
    const index = state.value.issues.findIndex((item) => item.id === payload.id)

    if (index >= 0) {
      state.value.issues[index] = normalizeIssue({
        ...state.value.issues[index],
        ...payload,
      })
    } else {
      state.value.issues.unshift({
        ...payload,
        id: payload.id || crypto.randomUUID(),
        resolutionSteps: Array.isArray(payload.resolutionSteps) ? payload.resolutionSteps : [],
        photos: Array.isArray(payload.photos) ? payload.photos : [],
      })
    }

    await persistAll()
  }

  async function addIssueResolutionStep(issueId, note, photos = []) {
    const issue = state.value.issues.find((item) => item.id === issueId)
    if (!issue) {
      return
    }

    issue.resolutionSteps = issue.resolutionSteps || []
    issue.resolutionSteps.push({
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      note,
      photos: Array.isArray(photos) ? photos : [],
    })
    await persistAll()
  }

  async function updateIssueResolutionStep(issueId, stepId, patch) {
    const issue = state.value.issues.find((item) => item.id === issueId)
    if (!issue || !Array.isArray(issue.resolutionSteps)) {
      return
    }

    const step = issue.resolutionSteps.find((item) => (item.id || item.date) === stepId)
    if (!step) {
      return
    }

    if (patch.note !== undefined) {
      step.note = patch.note
    }
    if (patch.photos !== undefined) {
      step.photos = Array.isArray(patch.photos) ? patch.photos : []
    }
    await persistAll()
  }

  async function removeIssueResolutionStep(issueId, stepId) {
    const issue = state.value.issues.find((item) => item.id === issueId)
    if (!issue || !Array.isArray(issue.resolutionSteps)) {
      return
    }

    issue.resolutionSteps = issue.resolutionSteps.filter((item) => (item.id || item.date) !== stepId)
    await persistAll()
  }

  async function removeIssue(id) {
    state.value.issues = state.value.issues.filter((item) => item.id !== id)
    await persistAll()
  }

  async function markTaskNotified(taskId, dateString) {
    state.value.notifications[taskId] = toKey(dateString)
    await persistAll()
  }

  function getTaskLastNotified(taskId) {
    return state.value.notifications[taskId]
  }

  function suggestSimilarIssues(query) {
    const queryObject = typeof query === 'string' ? { query, photos: [] } : query || {}
    const queryText = queryObject.query || ''
    const queryPhotoTokens = createPhotoTokenSet(queryObject.photos || [])

    return state.value.issues
      .map((issue) => {
        const textCorpus = [
          issue.title,
          issue.symptoms,
          ...(issue.resolutionSteps || []).map((step) => step.note),
          ...(issue.photos || []).map((photo) => photo.name),
        ].join(' ')

        const textScore = scoreSimilarity(queryText, textCorpus)
        const issuePhotoTokens = createPhotoTokenSet(issue.photos || [])
        const photoScore = scoreTokenSetSimilarity(queryPhotoTokens, issuePhotoTokens)
        const blendedScore = queryPhotoTokens.size
          ? textScore * 0.75 + photoScore * 0.25
          : textScore

        return {
          issue,
          score: blendedScore,
          textScore,
          photoScore,
        }
      })
      .filter((item) => item.score > 0.1)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
  }

  async function createTaskFromTemplate(templateId) {
    const template = state.value.annualTaskTemplates.find((item) => item.id === templateId)
    if (!template) {
      return
    }

    const year = new Date().getFullYear()
    const dueDate = new Date(year, template.recommendedMonth - 1, 15)

    await upsertTask({
      title: template.title,
      dueDate: formatISO(dueDate, { representation: 'date' }),
      frequency: '매년',
      category: template.category ?? '연간 정기 작업',
      status: '예정',
      progress: 0,
      logs: [{ date: new Date().toISOString(), note: template.notes }],
    })
  }

  async function upsertScheduleRule(payload) {
    const normalized = normalizeRule(payload)
    const index = state.value.scheduleRules.findIndex((item) => item.id === normalized.id)

    if (index >= 0) {
      state.value.scheduleRules[index] = {
        ...state.value.scheduleRules[index],
        ...normalized,
      }
    } else {
      state.value.scheduleRules.push({
        ...normalized,
        id: normalized.id || crypto.randomUUID(),
      })
    }

    await persistAll()
  }

  async function deduplicateTasks() {
    const seen = new Set()
    const before = state.value.tasks.length
    state.value.tasks = state.value.tasks.filter((task) => {
      const key = `${task.title}|${task.dueDate}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    await persistAll()
    return before - state.value.tasks.length
  }

  async function removeScheduleRule(id) {
    state.value.scheduleRules = state.value.scheduleRules.filter((rule) => rule.id !== id)
    await persistAll()
  }

  async function updateScheduleSettings(payload) {
    state.value.scheduleSettings = normalizeScheduleSettings({
      ...state.value.scheduleSettings,
      ...payload,
    })
    await persistAll()
  }

  function isDuplicateTask(normalizedRule, dueDate, duplicatePolicy) {
    if (duplicatePolicy === 'allow') {
      return false
    }

    if (duplicatePolicy === 'title-and-date') {
      return state.value.tasks.some(
        (task) =>
          task.title === normalizedRule.title &&
          task.dueDate === dueDate,
      )
    }

    return state.value.tasks.some(
      (task) => task.scheduleRuleId === normalizedRule.id && task.dueDate === dueDate,
    )
  }

  async function runTaskScheduler({ daysAhead, duplicatePolicy, persist = true } = {}) {
    const resolvedDays = Math.max(1, Number(daysAhead || state.value.scheduleSettings.generationDays || 21))
    const resolvedPolicy = duplicatePolicy || state.value.scheduleSettings.duplicatePolicy || 'rule-and-date'
    const todayDate = new Date()
    const endDate = addDays(todayDate, resolvedDays)
    const generatedTasks = []

    for (const rule of state.value.scheduleRules) {
      const normalizedRule = normalizeRule(rule)
      if (!normalizedRule.enabled || !normalizedRule.startDate) {
        continue
      }

      for (let cursor = new Date(todayDate); cursor <= endDate; cursor = addDays(cursor, 1)) {
        if (!matchRuleOnDate(normalizedRule, cursor)) {
          continue
        }

        const dueDate = formatISO(cursor, { representation: 'date' })
        const alreadyExists = isDuplicateTask(normalizedRule, dueDate, resolvedPolicy)

        if (alreadyExists) {
          continue
        }

        generatedTasks.push({
          id: crypto.randomUUID(),
          title: normalizedRule.title,
          dueDate,
          frequency: normalizedRule.frequency,
          category: normalizedRule.category,
          status: '예정',
          progress: 0,
          logs: [{ date: new Date().toISOString(), note: '스케줄 규칙에 의해 자동 생성.' }],
          autoGenerated: true,
          scheduleRuleId: normalizedRule.id,
        })
      }
    }

    if (generatedTasks.length) {
      state.value.tasks.push(...generatedTasks)
      if (persist) {
        await persistAll()
      }
    }

    return generatedTasks.length
  }

  function listUpcomingDays(limit = 7) {
    const start = new Date()
    const end = addDays(start, limit)

    return state.value.tasks.filter((task) => {
      const due = parseISO(task.dueDate)
      return due >= start && due <= end && task.status !== '완료'
    })
  }

  async function updateAppSettings(payload) {
    state.value.appSettings = { ...state.value.appSettings, ...payload }
    await persistAll()
  }

  async function reorderFacilities(newList) {
    state.value.facilities = newList
    await persistAll()
  }

  async function reorderAncillaries(newList) {
    state.value.ancillaries = newList
    await persistAll()
  }

  async function upsertAncillary(payload) {
    const index = state.value.ancillaries.findIndex((item) => item.id === payload.id)

    if (index >= 0) {
      state.value.ancillaries[index] = { ...state.value.ancillaries[index], ...payload }
    } else {
      state.value.ancillaries.push({ ...payload, id: payload.id || crypto.randomUUID() })
    }

    await persistAll()
  }

  async function removeAncillary(id) {
    state.value.ancillaries = state.value.ancillaries.filter((item) => item.id !== id)
    await persistAll()
  }

  // ── 비료·농약 재고 (로트=규격+유효기간 기반) ─────────────────────────────────
  // 품목은 메타데이터 + 입출고 이력(txns)만 보관한다.
  // 현재 재고(로트별 수량)는 txns로부터 계산하므로 단일 출처라 편집/삭제가 단순하다.
  async function upsertInventoryItem(payload) {
    const index = state.value.inventory.findIndex((item) => item.id === payload.id)

    if (index >= 0) {
      // 메타데이터만 갱신 (재고/이력은 입출고로만 변경)
      const { txns, ...meta } = payload
      state.value.inventory[index] = normalizeInventoryItem({
        ...state.value.inventory[index],
        ...meta,
      })
    } else {
      state.value.inventory.push(
        normalizeInventoryItem({
          ...payload,
          id: payload.id || crypto.randomUUID(),
          txns: [],
        }),
      )
    }

    await persistAll()
  }

  async function removeInventoryItem(id) {
    state.value.inventory = state.value.inventory.filter((item) => item.id !== id)
    await persistAll()
  }

  // 입출고 1건 기록. 로트는 (규격 volume + 유효기간 expiryDate)로 식별된다.
  async function addInventoryTxn(itemId, { type, volume, expiryDate, amount, note }) {
    const item = state.value.inventory.find((entry) => entry.id === itemId)
    if (!item) return

    const qty = Math.abs(Number(amount) || 0)
    if (qty === 0) return

    item.txns = item.txns || []
    item.txns.unshift({
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      type: type === '사용' ? '사용' : '입고',
      volume: volume || '기본',
      expiryDate: expiryDate || '',
      amount: qty,
      note: note || '',
    })

    await persistAll()
  }

  async function updateInventoryTxn(itemId, txnId, patch) {
    const item = state.value.inventory.find((entry) => entry.id === itemId)
    if (!item || !Array.isArray(item.txns)) return

    const txn = item.txns.find((entry) => (entry.id || entry.date) === txnId)
    if (!txn) return

    if (patch.type !== undefined) txn.type = patch.type === '사용' ? '사용' : '입고'
    if (patch.volume !== undefined) txn.volume = patch.volume || '기본'
    if (patch.expiryDate !== undefined) txn.expiryDate = patch.expiryDate || ''
    if (patch.amount !== undefined) {
      const amt = Math.abs(Number(patch.amount) || 0)
      if (amt > 0) txn.amount = amt
    }
    if (patch.note !== undefined) txn.note = patch.note

    await persistAll()
  }

  async function removeInventoryTxn(itemId, txnId) {
    const item = state.value.inventory.find((entry) => entry.id === itemId)
    if (!item || !Array.isArray(item.txns)) return

    item.txns = item.txns.filter((entry) => (entry.id || entry.date) !== txnId)
    await persistAll()
  }

  // ── 백업 / 복원 ──────────────────────────────────────────────────────────────
  // 사용자가 변경할 수 있는 모든 데이터를 백업한다.
  // (annualTaskTemplates = 앱 고정 템플릿, notifications = 시스템 추적값이므로 제외)
  const BACKUP_TYPE = 'citrus-farm-backup'
  const BACKUP_ARRAY_KEYS = ['facilities', 'ancillaries', 'seedlings', 'tasks', 'scheduleRules', 'issues', 'inventory']
  const BACKUP_OBJECT_KEYS = ['appSettings', 'scheduleSettings']
  const BACKUP_KEYS = [...BACKUP_ARRAY_KEYS, ...BACKUP_OBJECT_KEYS]

  function exportBackup() {
    const data = {}
    BACKUP_ARRAY_KEYS.forEach((key) => {
      data[key] = Array.isArray(state.value[key]) ? state.value[key] : []
    })
    BACKUP_OBJECT_KEYS.forEach((key) => {
      data[key] = state.value[key] && typeof state.value[key] === 'object' ? state.value[key] : {}
    })

    return {
      type: BACKUP_TYPE,
      version: 2,
      exportedAt: new Date().toISOString(),
      data,
    }
  }

  // 실제 백업 파일용: 참조된 사진 본문(base64)을 함께 담아 자기완결적 백업을 만든다.
  // (사진은 photos 컬렉션에 분산 저장되므로 메타데이터만으로는 다른 환경에서 이미지가 복원되지 않음)
  async function exportBackupWithPhotos() {
    const payload = exportBackup()
    payload.version = 3

    const photos = {}
    for (const id of currentReferencedPhotoIds()) {
      let dataUrl = photoCache.value[id]
      if (dataUrl === undefined && firebaseEnabled && db) {
        try {
          const snap = await getDoc(doc(db, 'photos', id))
          dataUrl = snap.exists() ? snap.data().dataUrl : undefined
        } catch (e) {
          console.warn('[farmStore] 백업용 사진 로드 실패', id, e)
        }
      }
      if (dataUrl) photos[id] = { dataUrl }
    }
    payload.data.photos = photos
    return payload
  }

  function isValidBackup(payload) {
    return (
      payload &&
      payload.type === BACKUP_TYPE &&
      payload.data &&
      typeof payload.data === 'object' &&
      BACKUP_KEYS.some((key) => payload.data[key] !== undefined)
    )
  }

  function backupSummary(payload) {
    const summary = {}
    BACKUP_ARRAY_KEYS.forEach((key) => {
      summary[key] = Array.isArray(payload?.data?.[key]) ? payload.data[key].length : 0
    })
    summary.settings = BACKUP_OBJECT_KEYS.some(
      (key) => payload?.data?.[key] && typeof payload.data[key] === 'object',
    )
    summary.photos =
      payload?.data?.photos && typeof payload.data.photos === 'object'
        ? Object.keys(payload.data.photos).length
        : 0
    return summary
  }

  async function restoreBackup(payload) {
    if (!isValidBackup(payload)) {
      throw new Error('invalid-backup')
    }

    // 백업에 포함된 키만 현재 상태 위에 덮어쓴 뒤 정규화한다.
    // (백업에 없는 키는 현재 값 유지 → 구버전 백업도 안전하게 복원)
    const merged = { ...state.value }
    BACKUP_KEYS.forEach((key) => {
      if (payload.data[key] !== undefined) {
        merged[key] = payload.data[key]
      }
    })

    const normalized = normalizeData(merged)
    normalized.scheduleRules = normalized.scheduleRules.map((rule) => normalizeRule(rule))
    normalized.scheduleSettings = normalizeScheduleSettings(normalized.scheduleSettings)
    normalized.issues = normalized.issues.map((issue) => normalizeIssue(issue))
    normalized.inventory = normalized.inventory.map((item) => normalizeInventoryItem(item))
    state.value = normalized

    // 신버전(v3) 백업: 사진 본문(base64) 복원
    const photosMap = payload.data?.photos
    if (photosMap && typeof photosMap === 'object') {
      if (firebaseEnabled && db) {
        // 클라우드: photos 컬렉션에 기록 + 캐시
        for (const [id, photo] of Object.entries(photosMap)) {
          const dataUrl = photo?.dataUrl
          if (!dataUrl) continue
          photoCache.value = { ...photoCache.value, [id]: dataUrl }
          try {
            await setDoc(doc(db, 'photos', id), {
              dataUrl,
              contentType: photo.contentType || 'image/jpeg',
              createdAt: photo.createdAt || new Date().toISOString(),
            })
          } catch (e) {
            console.warn('[farmStore] 백업 사진 복원 실패', id, e)
          }
        }
      } else {
        // 로컬 전용 모드: 사진을 배열에 다시 인라인해 localStorage에 보존
        const inject = (arr) => {
          if (!Array.isArray(arr)) return
          for (const p of arr) {
            const m = photosMap[p?.id]
            if (m?.dataUrl && !p.dataUrl) p.dataUrl = m.dataUrl
          }
        }
        state.value.facilities?.forEach((f) => inject(f.photos))
        state.value.ancillaries?.forEach((a) => inject(a.photos))
        state.value.seedlings?.forEach((s) => s.growthLogs?.forEach((l) => inject(l.photos)))
        state.value.tasks?.forEach((t) => t.logs?.forEach((l) => inject(l.photos)))
        state.value.issues?.forEach((i) => {
          inject(i.photos)
          i.resolutionSteps?.forEach((st) => inject(st.photos))
        })
      }
    }

    // 구버전 백업(사진이 배열에 인라인으로 박힌 경우)은 먼저 photos 컬렉션으로 이전해
    // 거대한 인라인 상태가 localStorage/Firestore 한도에 걸리는 일을 막는다.
    await migrateInlinePhotos()
    await persistAll()
    return backupSummary(payload)
  }

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
    cleanup,
    photoSrc,
    savePhotos,
    upsertFacility,
    removeFacility,
    reorderFacilities,
    reorderAncillaries,
    updateAppSettings,
    upsertAncillary,
    removeAncillary,
    upsertInventoryItem,
    removeInventoryItem,
    addInventoryTxn,
    updateInventoryTxn,
    removeInventoryTxn,
    upsertSeedling,
    addSeedlingsBatch,
    removeSeedling,
    addSeedlingLog,
    updateSeedlingLog,
    removeSeedlingLog,
    upsertTask,
    removeTask,
    addTaskLog,
    updateTaskLog,
    removeTaskLog,
    upsertIssue,
    addIssueResolutionStep,
    updateIssueResolutionStep,
    removeIssueResolutionStep,
    removeIssue,
    upsertScheduleRule,
    removeScheduleRule,
    updateScheduleSettings,
    runTaskScheduler,
    markTaskNotified,
    getTaskLastNotified,
    suggestSimilarIssues,
    deduplicateTasks,
    createTaskFromTemplate,
    listUpcomingDays,
    exportBackup,
    exportBackupWithPhotos,
    isValidBackup,
    backupSummary,
    restoreBackup,
  }
})
