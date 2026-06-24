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
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
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
          persistLocal()
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
    state.value.tasks = state.value.tasks.filter((item) => item.greenhouseId !== id)
    state.value.scheduleRules = state.value.scheduleRules.filter((item) => item.greenhouseId !== id)
    state.value.issues = state.value.issues.filter((item) => item.greenhouseId !== id)
    await persistAll()
  }

  async function upsertSeedling(payload) {
    const index = state.value.seedlings.findIndex((item) => item.id === payload.id)

    if (index >= 0) {
      state.value.seedlings[index] = { ...state.value.seedlings[index], ...payload }
    } else {
      state.value.seedlings.push({ ...payload, id: payload.id || crypto.randomUUID() })
    }

    await persistAll()
  }

  async function removeSeedling(id) {
    state.value.seedlings = state.value.seedlings.filter((item) => item.id !== id)
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
      const dupKey = `${payload.title}|${payload.dueDate}|${payload.greenhouseId}`
      const alreadyExists = state.value.tasks.some(
        (t) => `${t.title}|${t.dueDate}|${t.greenhouseId}` === dupKey,
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

  async function addTaskLog(taskId, note, progress, status, photos = []) {
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
    task.progress = Math.max(0, Math.min(100, Number(progress)))
    task.status = status

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

  async function addIssueResolutionStep(issueId, note) {
    const issue = state.value.issues.find((item) => item.id === issueId)
    if (!issue) {
      return
    }

    issue.resolutionSteps = issue.resolutionSteps || []
    issue.resolutionSteps.push({ id: crypto.randomUUID(), date: new Date().toISOString(), note })
    await persistAll()
  }

  async function updateIssueResolutionStep(issueId, stepId, note) {
    const issue = state.value.issues.find((item) => item.id === issueId)
    if (!issue || !Array.isArray(issue.resolutionSteps)) {
      return
    }

    const step = issue.resolutionSteps.find((item) => (item.id || item.date) === stepId)
    if (!step) {
      return
    }

    step.note = note
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

  async function createTaskFromTemplate(templateId, greenhouseId) {
    const template = state.value.annualTaskTemplates.find((item) => item.id === templateId)
    if (!template) {
      return
    }

    const year = new Date().getFullYear()
    const dueDate = new Date(year, template.recommendedMonth - 1, 15)

    await upsertTask({
      title: template.title,
      greenhouseId,
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
      const key = `${task.title}|${task.dueDate}|${task.greenhouseId}`
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
          task.greenhouseId === normalizedRule.greenhouseId &&
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
      if (!normalizedRule.enabled || !normalizedRule.greenhouseId || !normalizedRule.startDate) {
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
          greenhouseId: normalizedRule.greenhouseId,
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
    upsertFacility,
    removeFacility,
    reorderFacilities,
    reorderAncillaries,
    updateAppSettings,
    upsertAncillary,
    removeAncillary,
    upsertSeedling,
    removeSeedling,
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
  }
})
