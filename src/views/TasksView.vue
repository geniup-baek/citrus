<script setup>
import { computed, reactive, ref } from 'vue'
import {
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  parseISO,
  startOfDay,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
} from 'date-fns'
import { useRoute } from 'vue-router'
import { useFarmStore } from '../stores/farmStore'
import { useLocaleStore } from '../stores/localeStore'

const store = useFarmStore()
const localeStore = useLocaleStore()
const route = useRoute()

// ── 상태 ───────────────────────────────────────────────────────────────────
const VALID_FILTERS = ['annual', 'month', 'week', 'today', 'overdue', 'all']
const filter = ref(VALID_FILTERS.includes(route.query.filter) ? route.query.filter : 'week')
const categoryFilter = ref('all')
const statusFilter = ref('all')
const rightPanel = ref('task')  // 'task' | 'detail' | 'template'
const taskMode = ref('single')  // 'single' | 'rule'  (작업 추가 탭 내부 서브 토글)
const viewMode = ref('list')
const selectedTaskId = ref('')
const schedulerEditingId = ref('')
const templateResult = ref('')
const deduplicateResult = ref('')

// 캘린더
const calendarMonth = ref(new Date())
const calendarSelectedDate = ref(null)

const DAY_HEADERS = ['월', '화', '수', '목', '금', '토', '일']

const SEASONS = [
  { key: 'winter',   label: localeStore.t('tasks.seasonWinter'),   months: [12, 1, 2] },
  { key: 'spring',   label: localeStore.t('tasks.seasonSpring'),   months: [3, 4, 5] },
  { key: 'earlySum', label: localeStore.t('tasks.seasonEarlySum'), months: [6, 7] },
  { key: 'sumFall',  label: localeStore.t('tasks.seasonSumFall'),  months: [8, 9, 10, 11] },
]

// ── 폼 ─────────────────────────────────────────────────────────────────────
const form = reactive({
  title: '',
  greenhouseId: '',
  dueDate: '',
  category: '',
  priority: '보통',
  notes: '',
  status: '예정',
})

// 상세 블럭에서 작업 편집용
const detailForm = reactive({
  title: '',
  greenhouseId: '',
  dueDate: '',
  category: '',
  priority: '보통',
  notes: '',
})

const logForm = reactive({
  note: '',
  progress: 0,
  status: '진행중',
})

const schedulerForm = reactive({
  id: '',
  title: '',
  greenhouseId: '',
  category: '',
  frequency: '매주',
  interval: 1,
  dayOfWeek: 1,
  dayOfMonth: 1,
  startDate: '',
  endDate: '',
  enabled: true,
})


// ── computed ────────────────────────────────────────────────────────────────
const taskCategories = computed(() => store.state.appSettings?.taskCategories ?? ['기타'])

const weekdayOptions = computed(() => [
  { label: localeStore.t('tasks.monday'), value: 1 },
  { label: localeStore.t('tasks.tuesday'), value: 2 },
  { label: localeStore.t('tasks.wednesday'), value: 3 },
  { label: localeStore.t('tasks.thursday'), value: 4 },
  { label: localeStore.t('tasks.friday'), value: 5 },
  { label: localeStore.t('tasks.saturday'), value: 6 },
  { label: localeStore.t('tasks.sunday'), value: 7 },
])


const scheduleRules = computed(() => store.state.scheduleRules)

const selectedTask = computed(() =>
  store.state.tasks.find((t) => t.id === selectedTaskId.value),
)

const templatesBySeason = computed(() =>
  SEASONS.map((s) => ({
    ...s,
    templates: (store.state.annualTaskTemplates || [])
      .filter((t) => s.months.includes(t.recommendedMonth))
      .sort((a, b) => {
        const order = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
        return order.indexOf(a.recommendedMonth) - order.indexOf(b.recommendedMonth)
      }),
  })),
)

// 날짜 안전 파서
function safeDate(dateStr) {
  try {
    const d = parseISO(dateStr)
    return Number.isNaN(d.getTime()) ? null : d
  } catch {
    return null
  }
}

function isOverdue(task) {
  if (task.status === '완료') return false
  const d = safeDate(task.dueDate)
  return d ? isBefore(d, startOfDay(new Date())) : false
}

// 필터링 + 정렬
const filteredTasks = computed(() => {
  const now = new Date()
  const todayStart = startOfDay(now)
  const weekRange = { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) }
  const monthRange = { start: startOfMonth(now), end: endOfMonth(now) }

  let result = store.state.tasks

  if (filter.value === 'annual') {
    result = result.filter((t) => t.frequency === '매년')
  } else if (filter.value === 'month') {
    result = result.filter((t) => { const d = safeDate(t.dueDate); return d ? isWithinInterval(d, monthRange) : false })
  } else if (filter.value === 'week') {
    result = result.filter((t) => { const d = safeDate(t.dueDate); return d ? isWithinInterval(d, weekRange) : false })
  } else if (filter.value === 'today') {
    result = result.filter((t) => { const d = safeDate(t.dueDate); return d ? isSameDay(d, now) : false })
  } else if (filter.value === 'overdue') {
    result = result.filter((t) => { const d = safeDate(t.dueDate); return d ? isBefore(d, todayStart) && t.status !== '완료' : false })
  }

  if (categoryFilter.value !== 'all') {
    result = result.filter((t) => t.category === categoryFilter.value)
  }
  if (statusFilter.value !== 'all') {
    result = result.filter((t) => t.status === statusFilter.value)
  }

  const PRIORITY_ORDER = { '높음': 0, '보통': 1, '낮음': 2 }
  return [...result].sort((a, b) => {
    const da = safeDate(a.dueDate)
    const db = safeDate(b.dueDate)
    const aOv = da ? isBefore(da, todayStart) && a.status !== '완료' : false
    const bOv = db ? isBefore(db, todayStart) && b.status !== '완료' : false
    if (aOv && !bOv) return -1
    if (!aOv && bOv) return 1
    const pa = PRIORITY_ORDER[a.priority] ?? 1
    const pb = PRIORITY_ORDER[b.priority] ?? 1
    if (pa !== pb) return pa - pb
    if (da && db) return da - db
    return 0
  })
})

// 요약 카운트
const todayTaskCount = computed(() => {
  const now = new Date()
  return store.state.tasks.filter((t) => {
    const d = safeDate(t.dueDate)
    return d && isSameDay(d, now) && t.status !== '완료'
  }).length
})

const weekTaskCount = computed(() => {
  const now = new Date()
  const weekRange = { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) }
  return store.state.tasks.filter((t) => {
    const d = safeDate(t.dueDate)
    return d && isWithinInterval(d, weekRange) && t.status !== '완료'
  }).length
})

const overdueCount = computed(() => {
  const todayStart = startOfDay(new Date())
  return store.state.tasks.filter((t) => {
    const d = safeDate(t.dueDate)
    return d && isBefore(d, todayStart) && t.status !== '완료'
  }).length
})

// 캘린더
const calendarDays = computed(() => {
  const monthStart = startOfMonth(calendarMonth.value)
  const monthEnd = endOfMonth(calendarMonth.value)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const now = new Date()

  return eachDayOfInterval({ start: gridStart, end: gridEnd }).map((date) => ({
    date,
    isCurrentMonth: isSameMonth(date, calendarMonth.value),
    isToday: isSameDay(date, now),
    isSelected: calendarSelectedDate.value ? isSameDay(date, calendarSelectedDate.value) : false,
    tasks: store.state.tasks.filter((t) => {
      const d = safeDate(t.dueDate)
      return d ? isSameDay(d, date) : false
    }),
  }))
})

const selectedDayTasks = computed(() => {
  if (!calendarSelectedDate.value) return []
  return store.state.tasks.filter((t) => {
    const d = safeDate(t.dueDate)
    return d ? isSameDay(d, calendarSelectedDate.value) : false
  })
})

// ── 헬퍼 함수 ──────────────────────────────────────────────────────────────
function greenhouseName(id) {
  return store.state.facilities.find((f) => f.id === id)?.name || localeStore.t('common.unknown')
}

function weekdayLabel(value) {
  return weekdayOptions.value.find((d) => d.value === value)?.label || value
}

function priorityDotClass(priority) {
  if (priority === '높음') return 'priority-dot high'
  if (priority === '낮음') return 'priority-dot low'
  return 'priority-dot normal'
}

function formatLogDate(dateStr) {
  try { return format(new Date(dateStr), 'MM/dd HH:mm') } catch { return dateStr }
}

// 캘린더 이동
function prevMonth() { calendarMonth.value = subMonths(calendarMonth.value, 1) }
function nextMonth() { calendarMonth.value = addMonths(calendarMonth.value, 1) }
function goToToday() { calendarMonth.value = new Date() }

function selectDay(day) {
  if (!day.isCurrentMonth) calendarMonth.value = day.date
  calendarSelectedDate.value = isSameDay(day.date, calendarSelectedDate.value ?? new Date(0)) ? null : day.date
}

// 상태 pill
const STATUS_ORDER = ['예정', '진행중', '완료']

async function cycleStatus(task) {
  const next = STATUS_ORDER[(STATUS_ORDER.indexOf(task.status) + 1) % STATUS_ORDER.length]
  await store.upsertTask({ ...task, status: next })
}

function statusClass(status) {
  if (status === '완료') return 'pill pill-done'
  if (status === '진행중') return 'pill pill-ongoing'
  return 'pill pill-todo'
}

// ── 작업 상세 열기 ──────────────────────────────────────────────────────────
function openDetail(taskId) {
  selectedTaskId.value = taskId
  const task = store.state.tasks.find((t) => t.id === taskId)
  if (task) {
    detailForm.title = task.title
    detailForm.greenhouseId = task.greenhouseId || ''
    detailForm.dueDate = task.dueDate || ''
    detailForm.category = task.category || ''
    detailForm.priority = task.priority || '보통'
    detailForm.notes = task.notes || ''
  }
  logForm.note = ''
  logForm.progress = task?.progress || 0
  logForm.status = task?.status || '진행중'
  rightPanel.value = 'detail'
}

function backToAdd() {
  selectedTaskId.value = ''
  rightPanel.value = 'task'
}

// ── 단일 작업 추가 ───────────────────────────────────────────────────────────
async function addTask() {
  if (!form.title || !form.dueDate) return
  await store.upsertTask({
    title: form.title,
    greenhouseId: form.greenhouseId,
    dueDate: form.dueDate,
    category: form.category,
    priority: form.priority,
    notes: form.notes,
    frequency: '1회',
    status: form.status,
    progress: 0,
    logs: [],
  })
  form.title = ''
  form.notes = ''
  form.priority = '보통'
  form.status = '예정'
}

// ── 상세 블럭에서 작업 변경 ─────────────────────────────────────────────────
async function saveTaskDetail() {
  if (!selectedTask.value) return
  await store.upsertTask({
    ...selectedTask.value,
    title: detailForm.title,
    greenhouseId: detailForm.greenhouseId,
    dueDate: detailForm.dueDate,
    category: detailForm.category,
    priority: detailForm.priority,
    notes: detailForm.notes,
  })
}

// ── 진행 기록 ───────────────────────────────────────────────────────────────
async function updateProgress() {
  if (!selectedTask.value || !logForm.note) return
  await store.addTaskLog(selectedTask.value.id, logForm.note, Number(logForm.progress), logForm.status)
  logForm.note = ''
}

// ── 반복 규칙 ────────────────────────────────────────────────────────────────
function clearSchedulerForm() {
  schedulerForm.id = ''
  schedulerForm.title = ''
  schedulerForm.greenhouseId = store.state.facilities[0]?.id || ''
  schedulerForm.category = taskCategories.value[0] ?? ''
  schedulerForm.frequency = '매주'
  schedulerForm.interval = 1
  schedulerForm.dayOfWeek = 1
  schedulerForm.dayOfMonth = 1
  schedulerForm.startDate = format(new Date(), 'yyyy-MM-dd')
  schedulerForm.endDate = ''
  schedulerForm.enabled = true
  schedulerEditingId.value = ''
}

function editSchedulerRule(rule) {
  schedulerForm.id = rule.id
  schedulerForm.title = rule.title
  schedulerForm.greenhouseId = rule.greenhouseId
  schedulerForm.category = rule.category
  schedulerForm.frequency = rule.frequency
  schedulerForm.interval = rule.interval
  schedulerForm.dayOfWeek = rule.dayOfWeek
  schedulerForm.dayOfMonth = rule.dayOfMonth
  schedulerForm.startDate = rule.startDate
  schedulerForm.endDate = rule.endDate || ''
  schedulerForm.enabled = rule.enabled !== false
  schedulerEditingId.value = rule.id
}

async function saveScheduleRule() {
  await store.upsertScheduleRule({
    id: schedulerForm.id,
    title: schedulerForm.title,
    greenhouseId: schedulerForm.greenhouseId,
    category: schedulerForm.category,
    frequency: schedulerForm.frequency,
    interval: Number(schedulerForm.interval),
    dayOfWeek: Number(schedulerForm.dayOfWeek),
    dayOfMonth: Number(schedulerForm.dayOfMonth),
    startDate: schedulerForm.startDate,
    endDate: schedulerForm.endDate,
    enabled: schedulerForm.enabled,
  })
  clearSchedulerForm()
  await store.runTaskScheduler({
    daysAhead: store.state.scheduleSettings?.generationDays ?? 21,
    duplicatePolicy: store.state.scheduleSettings?.duplicatePolicy ?? 'rule-and-date',
    persist: true,
  })
}

async function removeScheduleRule(id) {
  await store.removeScheduleRule(id)
  if (schedulerEditingId.value === id) clearSchedulerForm()
  await store.runTaskScheduler({
    daysAhead: store.state.scheduleSettings?.generationDays ?? 21,
    duplicatePolicy: store.state.scheduleSettings?.duplicatePolicy ?? 'rule-and-date',
    persist: true,
  })
}

async function runDeduplicate() {
  const count = await store.deduplicateTasks()
  deduplicateResult.value = count > 0
    ? localeStore.t('tasks.deduplicateResult', { count })
    : localeStore.t('tasks.deduplicateNone')
}

// ── 계절 작업 템플릿 ────────────────────────────────────────────────────────
async function createFromTemplate(tpl) {
  await store.createTaskFromTemplate(tpl.id, form.greenhouseId)
  filter.value = 'annual'
  templateResult.value = `'${tpl.title}' 작업이 추가됐습니다. 왼쪽 보드의 '연간' 필터에서 확인하세요.`
}

// ── 초기값 ──────────────────────────────────────────────────────────────────
form.greenhouseId = store.state.facilities[0]?.id || ''
form.dueDate = format(new Date(), 'yyyy-MM-dd')
form.category = taskCategories.value[0] ?? ''
clearSchedulerForm()
</script>

<template>
  <section class="page-grid two-columns">

    <!-- ── 왼쪽: 작업 보드 ─────────────────────────────── -->
    <article class="card">
      <div class="row-actions align-start" style="margin-bottom: 0.5rem;">
        <h2>{{ localeStore.t('tasks.taskBoard') }}</h2>
        <div class="row-actions">
          <button :class="{ ghost: viewMode !== 'list' }" @click="viewMode = 'list'">목록</button>
          <button :class="{ ghost: viewMode !== 'calendar' }" @click="viewMode = 'calendar'">캘린더</button>
        </div>
      </div>

      <!-- 요약 strip -->
      <div class="summary-strip">
        <button
          class="summary-chip"
          :class="{ 'chip-active': filter === 'today' }"
          @click="filter = 'today'; statusFilter = 'all'"
        >{{ localeStore.t('tasks.summaryToday') }} {{ todayTaskCount }}</button>
        <button
          class="summary-chip"
          :class="{ 'chip-active': filter === 'week' }"
          @click="filter = 'week'; statusFilter = 'all'"
        >{{ localeStore.t('tasks.summaryWeek') }} {{ weekTaskCount }}</button>
        <button
          v-if="overdueCount > 0"
          class="summary-chip chip-danger"
          :class="{ 'chip-active': filter === 'overdue' }"
          @click="filter = 'overdue'; statusFilter = 'all'"
        >{{ localeStore.t('tasks.summaryOverdue') }} {{ overdueCount }}</button>
        <button class="ghost" style="margin-left: auto; font-size: 0.8rem;" @click="runDeduplicate">
          {{ localeStore.t('tasks.deduplicateBtn') }}
        </button>
      </div>
      <p v-if="deduplicateResult" class="muted" style="margin-bottom: 0.5rem; font-size: 0.83rem;">{{ deduplicateResult }}</p>

      <!-- ▸ 목록 뷰 -->
      <template v-if="viewMode === 'list'">
        <div class="inline-filters" style="margin-bottom: 0.45rem;">
          <button :class="{ ghost: filter !== 'annual' }" @click="filter = 'annual'">{{ localeStore.t('tasks.filterAnnual') }}</button>
          <button :class="{ ghost: filter !== 'month' }" @click="filter = 'month'">{{ localeStore.t('tasks.filterMonth') }}</button>
          <button :class="{ ghost: filter !== 'week' }" @click="filter = 'week'">{{ localeStore.t('tasks.filterWeek') }}</button>
          <button :class="{ ghost: filter !== 'today' }" @click="filter = 'today'">{{ localeStore.t('tasks.filterToday') }}</button>
          <button :class="{ ghost: filter !== 'overdue' }" @click="filter = 'overdue'">{{ localeStore.t('tasks.filterOverdue') }}</button>
          <button :class="{ ghost: filter !== 'all' }" @click="filter = 'all'">{{ localeStore.t('tasks.filterAll') }}</button>
        </div>

        <div class="category-chip-row">
          <button class="category-chip" :class="{ active: categoryFilter === 'all' }" @click="categoryFilter = 'all'">전체</button>
          <button
            v-for="cat in taskCategories"
            :key="cat"
            class="category-chip"
            :class="{ active: categoryFilter === cat }"
            @click="categoryFilter = cat"
          >{{ cat }}</button>
        </div>

        <div class="inline-filters" style="margin-bottom: 0.75rem;">
          <button :class="{ ghost: statusFilter !== 'all' }" @click="statusFilter = 'all'">전체</button>
          <button :class="{ ghost: statusFilter !== '예정' }" @click="statusFilter = '예정'">{{ localeStore.t('tasks.statusTodo') }}</button>
          <button :class="{ ghost: statusFilter !== '진행중' }" @click="statusFilter = '진행중'">{{ localeStore.t('tasks.statusInProgress') }}</button>
          <button :class="{ ghost: statusFilter !== '완료' }" @click="statusFilter = '완료'">{{ localeStore.t('tasks.statusDone') }}</button>
        </div>

        <ul class="list clean">
          <li
            v-for="task in filteredTasks"
            :key="task.id"
            class="list-item card-like"
            :class="{ 'task-overdue': isOverdue(task) }"
          >
            <div class="task-card-top">
              <span :class="priorityDotClass(task.priority || '보통')" :title="task.priority || '보통'"></span>
              <p class="item-title">{{ task.title }}</p>
            </div>
            <p class="item-meta">
              {{ greenhouseName(task.greenhouseId) }}
              <template v-if="task.category"> · {{ task.category }}</template>
               · {{ localeStore.t('common.due') }} {{ task.dueDate }}
              <span v-if="isOverdue(task)" class="pill danger" style="font-size: 0.7rem; padding: 0.1rem 0.4rem; margin-left: 0.3rem; vertical-align: middle;">{{ localeStore.t('tasks.overdueLabel') }}</span>
            </p>
            <p v-if="task.notes" class="muted" style="font-size: 0.82rem; white-space: pre-wrap;">{{ task.notes }}</p>
            <p v-if="task.autoGenerated" class="muted" style="font-size: 0.78rem;">{{ localeStore.t('tasks.autoGenerated') }}</p>
            <div class="row-actions">
              <button :class="statusClass(task.status)" :title="localeStore.t('tasks.statusChange')" @click="cycleStatus(task)">{{ task.status }}</button>
              <button class="ghost" @click="openDetail(task.id)">상세</button>
              <button class="danger" @click="store.removeTask(task.id)">{{ localeStore.t('common.delete') }}</button>
            </div>
          </li>
          <li v-if="!filteredTasks.length" class="muted">{{ localeStore.t('tasks.noTasksByFilter') }}</li>
        </ul>
      </template>

      <!-- ▸ 캘린더 뷰 -->
      <template v-if="viewMode === 'calendar'">
        <div class="cal-nav">
          <button class="ghost" @click="prevMonth">&#8249;</button>
          <span class="cal-month-label">{{ format(calendarMonth, 'yyyy년 M월') }}</span>
          <button class="ghost" @click="nextMonth">&#8250;</button>
          <button class="ghost" style="margin-left: auto;" @click="goToToday">오늘</button>
        </div>

        <div class="cal-grid">
          <div v-for="d in DAY_HEADERS" :key="d" class="cal-header">{{ d }}</div>
          <div
            v-for="day in calendarDays"
            :key="day.date.toISOString()"
            class="cal-cell"
            :class="{
              'cal-other': !day.isCurrentMonth,
              'cal-today': day.isToday,
              'cal-selected': day.isSelected,
            }"
            @click="selectDay(day)"
          >
            <span class="cal-num">{{ format(day.date, 'd') }}</span>
            <div class="cal-chips">
              <span
                v-for="task in day.tasks.slice(0, 2)"
                :key="task.id"
                class="cal-chip"
                :class="task.status === '완료' ? 'done' : task.status === '진행중' ? 'ongoing' : ''"
              >{{ task.title }}</span>
              <span v-if="day.tasks.length > 2" class="cal-chip more">+{{ day.tasks.length - 2 }}</span>
            </div>
          </div>
        </div>

        <template v-if="calendarSelectedDate && selectedDayTasks.length">
          <p class="section-title" style="margin-top: 1rem;">
            {{ format(calendarSelectedDate, 'M월 d일') }} 작업 ({{ selectedDayTasks.length }}건)
          </p>
          <ul class="list clean">
            <li v-for="task in selectedDayTasks" :key="task.id" class="list-item card-like" :class="{ 'task-overdue': isOverdue(task) }">
              <div class="task-card-top">
                <span :class="priorityDotClass(task.priority || '보통')"></span>
                <p class="item-title">{{ task.title }}</p>
              </div>
              <p class="item-meta">{{ greenhouseName(task.greenhouseId) }} · {{ task.category }}</p>
              <div class="row-actions">
                <button :class="statusClass(task.status)" :title="localeStore.t('tasks.statusChange')" @click="cycleStatus(task)">{{ task.status }}</button>
                <button class="ghost" @click="openDetail(task.id)">상세</button>
                <button class="danger" @click="store.removeTask(task.id)">{{ localeStore.t('common.delete') }}</button>
              </div>
            </li>
          </ul>
        </template>
        <p v-else-if="calendarSelectedDate" class="muted" style="margin-top: 0.75rem;">선택한 날에 작업이 없습니다.</p>
      </template>
    </article>

    <!-- ── 오른쪽: 컨텍스트 패널 ───────────────────────── -->
    <article class="card">
      <!-- 탭: 작업 추가 | 계절 작업 -->
      <div class="inline-filters task-panel-tabs">
        <button
          :class="{ ghost: rightPanel !== 'task' && rightPanel !== 'detail' }"
          @click="backToAdd"
        >
          {{ rightPanel === 'detail' ? localeStore.t('tasks.taskDetail') : localeStore.t('tasks.addTask') }}
        </button>
        <button :class="{ ghost: rightPanel !== 'template' }" @click="rightPanel = 'template'">
          {{ localeStore.t('tasks.seasonal') }}
        </button>
      </div>

      <!-- ① 작업 추가 탭 -->
      <template v-if="rightPanel === 'task'">
        <!-- 서브 토글: 단일 작업 | 반복 규칙 -->
        <div class="inline-filters" style="margin-bottom: 1rem;">
          <button :class="{ ghost: taskMode !== 'single' }" @click="taskMode = 'single'">단일 작업</button>
          <button :class="{ ghost: taskMode !== 'rule' }" @click="taskMode = 'rule'">반복 규칙</button>
        </div>

        <!-- ① - A  단일 작업 폼 -->
        <template v-if="taskMode === 'single'">
          <form class="stack-form" @submit.prevent="addTask">
            <label>{{ localeStore.t('tasks.taskName') }}
              <input v-model="form.title" required type="text" :placeholder="localeStore.t('tasks.taskNamePlaceholder')" />
            </label>
            <label>{{ localeStore.t('tasks.greenhouse') }}
              <select v-model="form.greenhouseId" required>
                <option v-for="f in store.state.facilities" :key="f.id" :value="f.id">{{ f.name }}</option>
              </select>
            </label>
            <label>{{ localeStore.t('tasks.dueDate') }}
              <input v-model="form.dueDate" required type="date" />
            </label>
            <label>{{ localeStore.t('tasks.category') }}
              <select v-model="form.category">
                <option v-for="c in taskCategories" :key="c" :value="c">{{ c }}</option>
              </select>
            </label>
            <label>{{ localeStore.t('tasks.priority') }}
              <select v-model="form.priority">
                <option value="높음">{{ localeStore.t('tasks.priorityHigh') }}</option>
                <option value="보통">{{ localeStore.t('tasks.priorityNormal') }}</option>
                <option value="낮음">{{ localeStore.t('tasks.priorityLow') }}</option>
              </select>
            </label>
            <label>{{ localeStore.t('tasks.taskNotes') }}
              <textarea v-model="form.notes" rows="2" :placeholder="localeStore.t('tasks.taskNotesPlaceholder')" />
            </label>
            <div class="row-actions">
              <button type="submit">{{ localeStore.t('common.add') }}</button>
            </div>
          </form>
        </template>

        <!-- ① - B  반복 규칙 -->
        <template v-if="taskMode === 'rule'">
          <p class="muted" style="margin-bottom: 0.75rem; font-size: 0.84rem;">{{ localeStore.t('tasks.ruleDesc') }}</p>

          <!-- 등록된 규칙 목록 -->
          <ul class="list clean compact" style="margin-bottom: 1rem;">
            <li v-for="rule in scheduleRules" :key="rule.id" class="list-item card-like">
              <div>
                <p class="item-title" style="font-size: 0.9rem;">
                  <span v-if="!rule.enabled" class="pill" style="margin-right: 0.3rem; font-size: 0.7rem;">{{ localeStore.t('tasks.ruleDisabled') }}</span>
                  {{ rule.title }}
                </p>
                <p class="item-meta" style="font-size: 0.82rem;">
                  {{ greenhouseName(rule.greenhouseId) }} · {{ rule.category }} · {{ rule.frequency }}
                  <template v-if="rule.frequency === '매주'">({{ weekdayLabel(rule.dayOfWeek) }}요일)</template>
                  <template v-if="rule.frequency === '매월'">(매월 {{ rule.dayOfMonth }}일)</template>
                </p>
                <p class="muted" style="font-size: 0.78rem;">{{ rule.startDate }} ~ {{ rule.endDate || localeStore.t('common.ongoing') }}</p>
              </div>
              <div class="row-actions">
                <button class="ghost" @click="editSchedulerRule(rule)">{{ localeStore.t('common.edit') }}</button>
                <button class="danger" @click="removeScheduleRule(rule.id)">{{ localeStore.t('common.delete') }}</button>
              </div>
            </li>
            <li v-if="!scheduleRules.length" class="muted" style="font-size: 0.85rem;">{{ localeStore.t('tasks.noRules') }}</li>
          </ul>

          <!-- 규칙 추가/편집 폼 -->
          <h3 class="section-title">{{ schedulerEditingId ? localeStore.t('tasks.updateRule') : localeStore.t('tasks.saveRule') }}</h3>
          <form class="stack-form" @submit.prevent="saveScheduleRule">
            <label>{{ localeStore.t('tasks.ruleTitle') }}
              <input v-model="schedulerForm.title" required type="text" :placeholder="localeStore.t('tasks.ruleTitlePlaceholder')" />
            </label>
            <label>{{ localeStore.t('tasks.greenhouse') }}
              <select v-model="schedulerForm.greenhouseId" required>
                <option v-for="f in store.state.facilities" :key="f.id" :value="f.id">{{ f.name }}</option>
              </select>
            </label>
            <label>{{ localeStore.t('tasks.category') }}
              <select v-model="schedulerForm.category">
                <option v-for="c in taskCategories" :key="c" :value="c">{{ c }}</option>
              </select>
            </label>
            <div class="row-scheduler-grid">
              <label>{{ localeStore.t('tasks.frequency') }}
                <select v-model="schedulerForm.frequency">
                  <option value="매일">{{ localeStore.t('tasks.frequencyDaily') }}</option>
                  <option value="매주">{{ localeStore.t('tasks.frequencyWeekly') }}</option>
                  <option value="매월">{{ localeStore.t('tasks.frequencyMonthly') }}</option>
                </select>
              </label>
              <label v-if="schedulerForm.frequency === '매주'">{{ localeStore.t('tasks.weekday') }}
                <select v-model="schedulerForm.dayOfWeek">
                  <option v-for="d in weekdayOptions" :key="d.value" :value="d.value">{{ d.label }}요일</option>
                </select>
              </label>
              <label v-if="schedulerForm.frequency === '매월'">{{ localeStore.t('tasks.dayOfMonth') }}
                <input v-model="schedulerForm.dayOfMonth" min="1" max="31" type="number" />
              </label>
            </div>
            <div class="row-scheduler-grid">
              <label>{{ localeStore.t('tasks.startDate') }}
                <input v-model="schedulerForm.startDate" required type="date" />
              </label>
              <label>{{ localeStore.t('tasks.endDateOptional') }}
                <input v-model="schedulerForm.endDate" type="date" />
              </label>
            </div>
            <label class="inline-checkbox">
              <input v-model="schedulerForm.enabled" type="checkbox" />
              {{ localeStore.t('tasks.enableRule') }}
            </label>
            <div class="row-actions">
              <button type="submit">{{ schedulerEditingId ? localeStore.t('common.change') : localeStore.t('common.add') }}</button>
              <button class="ghost" type="button" @click="clearSchedulerForm">{{ localeStore.t('common.reset') }}</button>
            </div>
          </form>

        </template>
      </template>

      <!-- ② 작업 상세 + 편집 + 진행 기록 -->
      <template v-if="rightPanel === 'detail'">
        <div class="row-actions align-start" style="margin-bottom: 0.75rem;">
          <div class="task-card-top">
            <span :class="priorityDotClass(selectedTask?.priority || '보통')"></span>
            <p class="item-title">{{ selectedTask?.title }}</p>
          </div>
          <button class="ghost" @click="backToAdd">{{ localeStore.t('tasks.backToTask') }}</button>
        </div>

        <!-- 작업 편집 폼 -->
        <form class="stack-form" style="margin-bottom: 1.25rem;" @submit.prevent="saveTaskDetail">
          <label>{{ localeStore.t('tasks.taskName') }}
            <input v-model="detailForm.title" required type="text" />
          </label>
          <label>{{ localeStore.t('tasks.greenhouse') }}
            <select v-model="detailForm.greenhouseId">
              <option v-for="f in store.state.facilities" :key="f.id" :value="f.id">{{ f.name }}</option>
            </select>
          </label>
          <label>{{ localeStore.t('tasks.dueDate') }}
            <input v-model="detailForm.dueDate" type="date" />
          </label>
          <label>{{ localeStore.t('tasks.category') }}
            <select v-model="detailForm.category">
              <option v-for="c in taskCategories" :key="c" :value="c">{{ c }}</option>
            </select>
          </label>
          <label>{{ localeStore.t('tasks.priority') }}
            <select v-model="detailForm.priority">
              <option value="높음">{{ localeStore.t('tasks.priorityHigh') }}</option>
              <option value="보통">{{ localeStore.t('tasks.priorityNormal') }}</option>
              <option value="낮음">{{ localeStore.t('tasks.priorityLow') }}</option>
            </select>
          </label>
          <label>{{ localeStore.t('tasks.taskNotes') }}
            <textarea v-model="detailForm.notes" rows="2" />
          </label>
          <div class="row-actions">
            <button type="submit">{{ localeStore.t('common.change') }}</button>
          </div>
        </form>

        <hr style="border: none; border-top: 1px solid var(--line); margin-bottom: 1rem;" />

        <!-- 진행 기록 -->
        <p class="muted" style="font-size: 0.82rem; font-weight: 600; margin-bottom: 0.5rem;">{{ localeStore.t('tasks.recordProgress') }}</p>
        <form class="stack-form" style="margin-bottom: 1rem;" @submit.prevent="updateProgress">
          <label>{{ localeStore.t('tasks.status') }}
            <select v-model="logForm.status">
              <option value="예정">{{ localeStore.t('tasks.statusTodo') }}</option>
              <option value="진행중">{{ localeStore.t('tasks.statusInProgress') }}</option>
              <option value="완료">{{ localeStore.t('tasks.statusDone') }}</option>
            </select>
          </label>
          <label>{{ localeStore.t('tasks.progressPercent') }} ({{ logForm.progress }}%)
            <input v-model="logForm.progress" max="100" min="0" type="range" style="width: 100%; padding: 0;" />
          </label>
          <label>{{ localeStore.t('tasks.logNote') }}
            <textarea v-model="logForm.note" required rows="3" />
          </label>
          <button type="submit">{{ localeStore.t('tasks.addLog') }}</button>
        </form>

        <p class="muted" style="font-size: 0.82rem; font-weight: 600; margin-bottom: 0.4rem;">{{ localeStore.t('tasks.logHistory') }}</p>
        <ul class="list clean">
          <li v-for="log in (selectedTask?.logs || [])" :key="log.date + log.note" class="list-item">
            <p class="item-meta">{{ formatLogDate(log.date) }}</p>
            <p style="font-size: 0.9rem;">{{ log.note }}</p>
          </li>
          <li v-if="!selectedTask?.logs?.length" class="muted" style="font-size: 0.85rem;">{{ localeStore.t('tasks.noLogs') }}</li>
        </ul>
      </template>

      <!-- ③ 계절 작업 템플릿 -->
      <template v-if="rightPanel === 'template'">
        <p class="muted" style="margin-bottom: 0.75rem; font-size: 0.84rem;">{{ localeStore.t('tasks.templateDesc') }}</p>

        <label style="margin-bottom: 0.85rem; display: grid; gap: 0.25rem; font-size: 0.92rem;">{{ localeStore.t('tasks.greenhouse') }}
          <select v-model="form.greenhouseId">
            <option v-for="f in store.state.facilities" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
        </label>

        <div v-for="season in templatesBySeason" :key="season.key" class="season-group">
          <p v-if="season.templates.length" class="season-label">{{ season.label }}</p>
          <ul v-if="season.templates.length" class="list clean">
            <li v-for="tpl in season.templates" :key="tpl.id" class="list-item card-like">
              <div>
                <div class="row-actions" style="gap: 0.35rem; margin-bottom: 0.2rem;">
                  <p class="item-title" style="font-size: 0.92rem; margin: 0;">{{ tpl.title }}</p>
                  <span class="pill" style="font-size: 0.72rem; padding: 0.1rem 0.5rem;">{{ tpl.category }}</span>
                </div>
                <p class="item-meta" style="font-size: 0.8rem;">{{ tpl.recommendedMonth }}월 · {{ tpl.notes }}</p>
              </div>
              <button class="ghost" style="white-space: nowrap; flex-shrink: 0;" @click="createFromTemplate(tpl)">
                {{ localeStore.t('tasks.create') }}
              </button>
            </li>
          </ul>
        </div>

        <p v-if="templateResult" class="muted" style="margin-top: 0.5rem; font-size: 0.84rem;">{{ templateResult }}</p>
      </template>
    </article>
  </section>
</template>
