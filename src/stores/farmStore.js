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
    annualTaskTemplates: Array.isArray(data?.annualTaskTemplates)
      ? data.annualTaskTemplates
      : defaults.annualTaskTemplates,
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

  if (rule.frequency === 'daily') {
    return dayDiff % interval === 0
  }

  if (rule.frequency === 'weekly') {
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
    state.value.issues.filter((issue) => issue.status !== 'resolved'),
  )

  const taskSummary = computed(() => {
    const counts = { todo: 0, 'in-progress': 0, done: 0 }
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

  async function persistAll() {
    state.value.updatedAt = new Date().toISOString()
    persistLocal()

    if (firebaseEnabled && db) {
      const ref = doc(db, 'shared', 'farmData')
      await setDoc(ref, state.value, { merge: true })
    }
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
          await runTaskScheduler({
            daysAhead: state.value.scheduleSettings.generationDays,
            duplicatePolicy: state.value.scheduleSettings.duplicatePolicy,
            persist: true,
          })
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
      state.value.tasks.push({
        ...payload,
        id: payload.id || crypto.randomUUID(),
        logs: Array.isArray(payload.logs) ? payload.logs : [],
        status: payload.status || 'todo',
        progress: Number(payload.progress || 0),
        autoGenerated: payload.autoGenerated === true,
        scheduleRuleId: payload.scheduleRuleId || null,
      })
    }

    await persistAll()
  }

  async function removeTask(id) {
    state.value.tasks = state.value.tasks.filter((item) => item.id !== id)
    await persistAll()
  }

  async function addTaskLog(taskId, note, progress, status) {
    const task = state.value.tasks.find((item) => item.id === taskId)
    if (!task) {
      return
    }

    task.logs = task.logs || []
    task.logs.unshift({ date: new Date().toISOString(), note })
    task.progress = Math.max(0, Math.min(100, Number(progress)))
    task.status = status

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
    issue.resolutionSteps.push({ date: new Date().toISOString(), note })
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
      frequency: 'yearly',
      category: 'Yearly routine',
      status: 'todo',
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
          status: 'todo',
          progress: 0,
          logs: [{ date: new Date().toISOString(), note: 'Auto-generated by scheduler rule.' }],
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
      return due >= start && due <= end && task.status !== 'done'
    })
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
    upsertSeedling,
    removeSeedling,
    upsertTask,
    removeTask,
    addTaskLog,
    upsertIssue,
    addIssueResolutionStep,
    removeIssue,
    upsertScheduleRule,
    removeScheduleRule,
    updateScheduleSettings,
    runTaskScheduler,
    markTaskNotified,
    getTaskLastNotified,
    suggestSimilarIssues,
    createTaskFromTemplate,
    listUpcomingDays,
  }
})
