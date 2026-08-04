<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
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
import { useRecommendSettingsStore } from '../stores/recommendSettingsStore'
import { useAppPolicyStore } from '../stores/appPolicyStore'
import { compressImageFile } from '../utils/imageProcessing'
import { confirm } from '../composables/useConfirm'
import { useIsMobile } from '../composables/useIsMobile'
import { useLightboxBack } from '../composables/useLightboxBack'

const store = useFarmStore()
const localeStore = useLocaleStore()
const recSettingsStore = useRecommendSettingsStore()
const policyStore = useAppPolicyStore()
const route = useRoute()

// 초기화 버튼 — 시스템 관리 모드에서 기능을 "사용"으로 켜고, 이 농장에서 "표시"로 켠 경우에만 노출한다.
const showResetButton = computed(() =>
  policyStore.policy.enableResetFeature && recSettingsStore.settings.showResetButtons,
)

const vAutoResize = {
  mounted(el) {
    el.style.overflow = 'hidden'
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
    el.addEventListener('input', () => {
      el.style.height = 'auto'
      el.style.height = el.scrollHeight + 'px'
    })
  },
  updated(el) {
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  },
}

// ── 상태 ───────────────────────────────────────────────────────────────────
const VALID_FILTERS = ['annual', 'month', 'week', 'today', 'overdue', 'all']
const filter = ref(VALID_FILTERS.includes(route.query.filter) ? route.query.filter : 'week')
const categoryFilter = ref('all')
const statusFilter = ref('all')
const rightPanel = ref('task')  // 'task' | 'detail' | 'template'
const taskMode = ref('single')  // 'single' | 'rule'  (작업 추가 탭 내부 서브 토글)
const viewMode = ref('list')
const showForm = ref(false)  // 편집 모드 (재고 페이지와 동일: 우측 패널 + 항목 편집/삭제 노출)
const selectedTaskId = ref('')
const schedulerEditingId = ref('')

const { isMobile } = useIsMobile()
const formOpen = ref(false) // 우측 패널(추가/상세/템플릿) 표시 여부 — 토글로 닫으면 추가 폼도 숨긴다
// 모바일: 상세 모드이고 그 작업이 현재 뷰에 보일 때만 작업 아래로, 아니면 보드 상단으로(텔레포트 대상 null 방지)
const formTarget = computed(() => {
  if (rightPanel.value === 'detail' && selectedTaskId.value) {
    const list = viewMode.value === 'calendar' ? selectedDayTasks.value : filteredTasks.value
    if (list.some((t) => t.id === selectedTaskId.value)) {
      return `#task-form-slot-${selectedTaskId.value}`
    }
  }
  return viewMode.value === 'calendar' ? '#task-form-top-calendar' : '#task-form-top-list'
})
const templateResult = ref('')
const deduplicateResult = ref('')

// 작업 로그 사진 첨부
const logPhotoPreviews = ref([])
const logCompressionReport = ref('')
const lightboxPhoto = ref(null)
useLightboxBack(lightboxPhoto)

// 진행 기록 인라인 패널 (목록 항목의 '로그' 버튼)
const expandedTaskId = ref('')
const showAddLog = ref(false)

// 작업 로그 편집
const editingLogId = ref('')
const editLogNote = ref('')
const editLogPhotos = ref([])
const editLogNewPreviews = ref([])
const editLogCompressionReport = ref('')

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
  dueDate: '',
  category: '',
  priority: '보통',
  notes: '',
  status: '예정',
})

// 상세 블럭에서 작업 편집용
const detailForm = reactive({
  title: '',
  dueDate: '',
  category: '',
  priority: '보통',
  notes: '',
})

const logForm = reactive({
  note: '',
})

const schedulerForm = reactive({
  id: '',
  title: '',
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

const expandedTask = computed(() =>
  store.state.tasks.find((t) => t.id === expandedTaskId.value),
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

  // 기간 필터보다 이전이 마감인 작업도, 미완료라면 계속 표시 대상에 포함한다
  // (예: '이번주' 필터에서도 3주 전 마감인 미완료 작업이 보여야 함)
  if (filter.value === 'annual') {
    result = result.filter((t) => t.frequency === '매년')
  } else if (filter.value === 'month') {
    result = result.filter((t) => {
      const d = safeDate(t.dueDate)
      if (!d) return false
      return isWithinInterval(d, monthRange) || (isBefore(d, monthRange.start) && t.status !== '완료')
    })
  } else if (filter.value === 'week') {
    result = result.filter((t) => {
      const d = safeDate(t.dueDate)
      if (!d) return false
      return isWithinInterval(d, weekRange) || (isBefore(d, weekRange.start) && t.status !== '완료')
    })
  } else if (filter.value === 'today') {
    result = result.filter((t) => {
      const d = safeDate(t.dueDate)
      if (!d) return false
      return isSameDay(d, now) || (isBefore(d, todayStart) && t.status !== '완료')
    })
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

// 요약 카운트 (기간 필터와 동일하게, 기간 이전 마감이라도 미완료면 포함)
const todayTaskCount = computed(() => {
  const now = new Date()
  const todayStart = startOfDay(now)
  return store.state.tasks.filter((t) => {
    if (t.status === '완료') return false
    const d = safeDate(t.dueDate)
    return d ? (isSameDay(d, now) || isBefore(d, todayStart)) : false
  }).length
})

const weekTaskCount = computed(() => {
  const now = new Date()
  const weekRange = { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) }
  return store.state.tasks.filter((t) => {
    if (t.status === '완료') return false
    const d = safeDate(t.dueDate)
    return d ? (isWithinInterval(d, weekRange) || isBefore(d, weekRange.start)) : false
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

// 필터/보기모드 변경으로 상세를 보고 있던 작업이 목록에서 사라지면 보이지 않는 항목을
// 계속 편집하는 상태로 남기지 않고 작업 추가 폼으로 되돌린다.
watch([filteredTasks, selectedDayTasks, viewMode], () => {
  if (rightPanel.value !== 'detail' || !selectedTaskId.value) return
  const list = viewMode.value === 'calendar' ? selectedDayTasks.value : filteredTasks.value
  if (!list.some((t) => t.id === selectedTaskId.value)) {
    backToAdd()
  }
})

// ── 헬퍼 함수 ──────────────────────────────────────────────────────────────
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

async function confirmDeleteTask(task) {
  const logs = (task.logs || []).length
  const ok = await confirm({ message: localeStore.t('confirm.task', { title: task.title, logs }) })
  if (ok) await store.removeTask(task.id)
}

// ── 작업 상세 열기 ──────────────────────────────────────────────────────────
function openDetail(taskId) {
  // 이미 이 작업 상세가 열려 있으면 그대로 둔다(재클릭해도 닫지 않음)
  if (rightPanel.value === 'detail' && selectedTaskId.value === taskId) return
  // 진행기록 패널과 상호 배타: 상세를 열면 진행기록 패널을 닫는다
  expandedTaskId.value = ''
  formOpen.value = true
  selectedTaskId.value = taskId
  const task = store.state.tasks.find((t) => t.id === taskId)
  if (task) {
    detailForm.title = task.title
    detailForm.dueDate = task.dueDate || ''
    detailForm.category = task.category || ''
    detailForm.priority = task.priority || '보통'
    detailForm.notes = task.notes || ''
  }
  rightPanel.value = 'detail'
  // 모바일에서 상세를 열면 해당 작업(과 아래 패널)이 보이도록 스크롤
  if (isMobile.value) {
    nextTick(() => {
      const el = document.getElementById(`task-form-slot-${taskId}`)
      ;(el?.closest('li') ?? el)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
}

// ── 진행 기록 인라인 패널 ────────────────────────────────────────────────────
function toggleLogPanel(task) {
  if (expandedTaskId.value === task.id) {
    expandedTaskId.value = ''
    return
  }
  // 상세 패널과 상호 배타: 진행기록을 열면 상세(폼)를 닫는다
  if (rightPanel.value === 'detail') {
    rightPanel.value = 'task'
    selectedTaskId.value = ''
  }
  formOpen.value = false
  expandedTaskId.value = task.id
  showAddLog.value = false
  logForm.note = ''
  logPhotoPreviews.value = []
  logCompressionReport.value = ''
  cancelEditLog()
}

function openAddLog() {
  showAddLog.value = true
}

function cancelAddLog() {
  showAddLog.value = false
  logForm.note = ''
  logPhotoPreviews.value = []
  logCompressionReport.value = ''
}

function backToAdd() {
  selectedTaskId.value = ''
  rightPanel.value = 'task'
  formOpen.value = true
}

// '+ 새 작업' — 새 작업 추가 폼으로 전환 후, 모바일에서 폼이 보이도록 스크롤
function newEntry() {
  backToAdd()
  if (isMobile.value) {
    nextTick(() => {
      const id = viewMode.value === 'calendar' ? 'task-form-top-calendar' : 'task-form-top-list'
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
}

function exitEdit() {
  showForm.value = false
  selectedTaskId.value = ''
  rightPanel.value = 'task'
  formOpen.value = false
}

// 작업 전체 삭제 — 관리모드 동작 설정에서 "초기화 버튼: 표시"일 때만 노출된다.
// 반복 규칙을 남기면 스케줄러가 작업을 다시 만들어내므로 규칙도 함께 지운다.
async function resetAllTasks() {
  const n = store.state.tasks.length
  const rules = store.state.scheduleRules.length
  if (!n && !rules) return
  const ok = await confirm({
    title: localeStore.t('confirm.resetTitle'),
    message: localeStore.t('confirm.resetTasks', { n, rules }),
    confirmLabel: localeStore.t('common.reset'),
  })
  if (!ok) return
  await store.resetTasks()
  clearSchedulerForm()
  exitEdit()
}

// ── 단일 작업 추가 ───────────────────────────────────────────────────────────
async function addTask() {
  if (!form.title || !form.dueDate) return
  await store.upsertTask({
    title: form.title,
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
    dueDate: detailForm.dueDate,
    category: detailForm.category,
    priority: detailForm.priority,
    notes: detailForm.notes,
  })
}

// ── 진행 기록 ───────────────────────────────────────────────────────────────
function logKey(log) {
  return log.id || log.date
}

// 파일 → 압축된 미리보기 + 리포트
async function filesToPreviews(files) {
  let originalTotal = 0
  let compressedTotal = 0

  const previews = await Promise.all(
    files.map(async (file) => {
      const compressed = await compressImageFile(file, {
        maxWidth: 1280,
        maxHeight: 1280,
        quality: 0.78,
        outputType: 'image/jpeg',
      })
      originalTotal += compressed.originalSize
      compressedTotal += compressed.compressedSize
      return {
        id: crypto.randomUUID(),
        name: file.name,
        dataUrl: compressed.dataUrl,
        contentType: compressed.contentType,
        size: compressed.compressedSize,
        width: compressed.width,
        height: compressed.height,
        originalSize: compressed.originalSize,
      }
    }),
  )

  const report = previews.length
    ? localeStore.t('tasks.compressedReport', {
        count: previews.length,
        from: Math.round(originalTotal / 1024),
        to: Math.round(compressedTotal / 1024),
        ratio: originalTotal > 0 ? Math.round((compressedTotal / originalTotal) * 100) : 100,
      })
    : ''

  return { previews, report }
}

async function handleLogPhotoChange(event) {
  const files = Array.from(event.target.files || []).slice(0, 5)
  const { previews, report } = await filesToPreviews(files)
  logPhotoPreviews.value = previews
  logCompressionReport.value = report
}

function removeLogPreviewPhoto(id) {
  logPhotoPreviews.value = logPhotoPreviews.value.filter((p) => p.id !== id)
}

function openLightbox(photo) {
  lightboxPhoto.value = photo
}

function closeLightbox() {
  lightboxPhoto.value = null
}

async function updateProgress() {
  if (!expandedTask.value || !logForm.note) return
  let photos
  try {
    photos = await store.savePhotos(logPhotoPreviews.value)
  } catch (e) {
    console.error('[TasksView] 사진 업로드 실패', e)
    alert(localeStore.t('common.photoUploadFailed'))
    return
  }
  await store.addTaskLog(expandedTask.value.id, logForm.note, photos)
  showAddLog.value = false
  logForm.note = ''
  logPhotoPreviews.value = []
  logCompressionReport.value = ''
}

// ── 로그 편집 / 삭제 ─────────────────────────────────────────────────────────
function startEditLog(log) {
  editingLogId.value = logKey(log)
  editLogNote.value = log.note
  editLogPhotos.value = [...(log.photos || [])]
  editLogNewPreviews.value = []
  editLogCompressionReport.value = ''
}

function cancelEditLog() {
  editingLogId.value = ''
  editLogNote.value = ''
  editLogPhotos.value = []
  editLogNewPreviews.value = []
  editLogCompressionReport.value = ''
}

function removeEditExistingPhoto(id) {
  editLogPhotos.value = editLogPhotos.value.filter((p) => p.id !== id)
}

async function handleEditLogPhotoChange(event) {
  const files = Array.from(event.target.files || []).slice(0, 5)
  const { previews, report } = await filesToPreviews(files)
  editLogNewPreviews.value = previews
  editLogCompressionReport.value = report
}

function removeEditNewPhoto(id) {
  editLogNewPreviews.value = editLogNewPreviews.value.filter((p) => p.id !== id)
}

async function saveEditLog() {
  if (!expandedTask.value || !editingLogId.value || !editLogNote.value.trim()) return
  let uploaded
  try {
    uploaded = await store.savePhotos(editLogNewPreviews.value)
  } catch (e) {
    console.error('[TasksView] 사진 업로드 실패', e)
    alert(localeStore.t('common.photoUploadFailed'))
    return
  }
  const photos = [...editLogPhotos.value, ...uploaded]
  await store.updateTaskLog(expandedTask.value.id, editingLogId.value, {
    note: editLogNote.value,
    photos,
  })
  cancelEditLog()
}

async function deleteLog(log) {
  if (!expandedTask.value) return
  await store.removeTaskLog(expandedTask.value.id, logKey(log))
  if (editingLogId.value === logKey(log)) cancelEditLog()
}

// ── 반복 규칙 ────────────────────────────────────────────────────────────────
function clearSchedulerForm() {
  schedulerForm.id = ''
  schedulerForm.title = ''
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
  await store.createTaskFromTemplate(tpl.id)
  filter.value = 'annual'
  templateResult.value = `'${tpl.title}' 작업이 추가됐습니다. 왼쪽 보드의 '연간' 필터에서 확인하세요.`
}

// ── 초기값 ──────────────────────────────────────────────────────────────────
form.dueDate = format(new Date(), 'yyyy-MM-dd')
form.category = taskCategories.value[0] ?? ''
clearSchedulerForm()
</script>

<template>
  <div v-if="lightboxPhoto" class="lightbox-overlay" @click="closeLightbox">
    <img :src="store.photoSrc(lightboxPhoto)" :alt="localeStore.t('tasks.logAttachment')" />
  </div>

  <section :class="['page-grid', showForm && formOpen ? 'two-columns' : '']">

    <!-- ── 왼쪽: 작업 보드 ─────────────────────────────── -->
    <article class="card">
      <div class="row-actions align-start" style="margin-bottom: 0.5rem;">
        <h2>{{ localeStore.t('tasks.taskBoard') }}</h2>
        <div class="row-actions">
          <!-- 초기화는 다른 화면과 같이 버튼 묶음의 맨 왼쪽에 둔다. -->
          <button
            v-if="showForm && showResetButton && (store.state.tasks.length > 0 || store.state.scheduleRules.length > 0)"
            class="danger"
            type="button"
            @click="resetAllTasks"
          >{{ localeStore.t('common.reset') }}</button>
          <button :class="{ ghost: viewMode !== 'list' }" @click="viewMode = 'list'">목록</button>
          <button :class="{ ghost: viewMode !== 'calendar' }" @click="viewMode = 'calendar'">캘린더</button>
          <button v-if="!showForm" @click="showForm = true; formOpen = true">{{ localeStore.t('common.edit') }}</button>
          <button v-else class="ghost" @click="exitEdit">{{ localeStore.t('common.exitEdit') }}</button>
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
        <button v-if="showForm" class="ghost" style="margin-left: auto;" @click="runDeduplicate">
          {{ localeStore.t('tasks.deduplicateBtn') }}
        </button>
      </div>
      <p v-if="deduplicateResult" class="muted text-sm" style="margin-bottom: 0.5rem;">{{ deduplicateResult }}</p>

      <!-- ▸ 목록 뷰 -->
      <template v-if="viewMode === 'list'">
        <div class="sort-filter-bar">
          <span class="filter-label">{{ localeStore.t('tasks.filterPeriod') }}</span>
          <select v-model="filter" class="compact-select">
            <option value="annual">{{ localeStore.t('tasks.filterAnnual') }}</option>
            <option value="month">{{ localeStore.t('tasks.filterMonth') }}</option>
            <option value="week">{{ localeStore.t('tasks.filterWeek') }}</option>
            <option value="today">{{ localeStore.t('tasks.filterToday') }}</option>
            <option value="overdue">{{ localeStore.t('tasks.filterOverdue') }}</option>
            <option value="all">{{ localeStore.t('tasks.filterAll') }}</option>
          </select>
          <span class="filter-sep">|</span>
          <span class="filter-label">{{ localeStore.t('tasks.filterCategory') }}</span>
          <select v-model="categoryFilter" class="compact-select">
            <option value="all">{{ localeStore.t('tasks.filterAll') }}</option>
            <option v-for="cat in taskCategories" :key="cat" :value="cat">{{ cat }}</option>
          </select>
          <span class="filter-label">{{ localeStore.t('tasks.filterStatus') }}</span>
          <select v-model="statusFilter" class="compact-select">
            <option value="all">{{ localeStore.t('tasks.filterAll') }}</option>
            <option value="예정">{{ localeStore.t('tasks.statusTodo') }}</option>
            <option value="진행중">{{ localeStore.t('tasks.statusInProgress') }}</option>
            <option value="완료">{{ localeStore.t('tasks.statusDone') }}</option>
          </select>
        </div>

        <div id="task-form-top-list" class="mobile-form-slot"></div>

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
              <template v-if="task.category">{{ task.category }} · </template>{{ localeStore.t('common.due') }} {{ task.dueDate }}
              <span v-if="isOverdue(task)" class="pill danger text-xs" style="padding: 0.1rem 0.4rem; margin-left: 0.3rem; vertical-align: middle;">{{ localeStore.t('tasks.overdueLabel') }}</span>
            </p>
            <p v-if="task.notes" class="muted text-sm" style="white-space: pre-wrap;">{{ task.notes }}</p>
            <p v-if="task.autoGenerated" class="muted text-sm">{{ localeStore.t('tasks.autoGenerated') }}</p>
            <div class="row-actions">
              <button :class="statusClass(task.status)" :title="localeStore.t('tasks.statusChange')" @click="cycleStatus(task)">{{ task.status }}</button>
              <button :class="{ ghost: expandedTaskId !== task.id }" @click="toggleLogPanel(task)">{{ localeStore.t('tasks.recordProgress') }}</button>
              <template v-if="showForm">
                <button :class="{ ghost: !(rightPanel === 'detail' && selectedTaskId === task.id) }" @click="openDetail(task.id)">상세</button>
                <button class="danger" @click="confirmDeleteTask(task)">{{ localeStore.t('common.delete') }}</button>
              </template>
            </div>

            <!-- 진행 기록 인라인 패널 -->
            <div v-if="expandedTaskId === task.id" class="log-panel">
              <div class="row-actions align-start log-history-label">
                <p class="muted" style="margin: 0;">{{ localeStore.t('tasks.logHistory') }}</p>
                <button v-if="!showAddLog" class="ghost compact-btn" type="button" @click="openAddLog">{{ localeStore.t('tasks.addLogTrigger') }}</button>
              </div>

              <form v-if="showAddLog" class="stack-form" style="margin-bottom: 1rem;" @submit.prevent="updateProgress">
                <label>{{ localeStore.t('tasks.logNote') }}
                  <textarea v-model="logForm.note" required rows="3" />
                </label>
                <label>{{ localeStore.t('tasks.attachPhotos') }}
                  <input accept="image/*" multiple type="file" @change="handleLogPhotoChange" />
                </label>
                <p class="muted text-sm">{{ localeStore.t('tasks.photoLimit') }}</p>
                <p v-if="logCompressionReport" class="muted text-sm">{{ logCompressionReport }}</p>
                <div v-if="logPhotoPreviews.length" class="photo-grid">
                  <figure v-for="photo in logPhotoPreviews" :key="photo.id" class="photo-card">
                    <button type="button" class="photo-card-btn" @click="openLightbox(photo)">
                      <img :src="store.photoSrc(photo)" :alt="localeStore.t('tasks.logAttachment')" />
                    </button>
                    <button type="button" class="danger photo-card-delete" @click="removeLogPreviewPhoto(photo.id)">{{ localeStore.t('common.delete') }}</button>
                  </figure>
                </div>
                <div class="row-actions">
                  <button type="submit">{{ localeStore.t('tasks.addLog') }}</button>
                  <button class="ghost" type="button" @click="cancelAddLog">{{ localeStore.t('common.cancel') }}</button>
                </div>
              </form>

              <ul class="list clean">
                <li v-for="log in (task.logs || [])" :key="logKey(log)" class="list-item">
                  <!-- 표시 모드 -->
                  <template v-if="editingLogId !== logKey(log)">
                    <div class="log-entry">
                      <span class="log-entry-info">
                        <span class="item-meta">{{ formatLogDate(log.date) }}</span>
                      </span>
                      <span class="log-entry-actions">
                        <button class="ghost icon-btn" type="button" :title="localeStore.t('common.edit')" :aria-label="localeStore.t('common.edit')" @click="startEditLog(log)">✎</button>
                        <button class="danger icon-btn" type="button" :title="localeStore.t('common.delete')" :aria-label="localeStore.t('common.delete')" @click="deleteLog(log)">✕</button>
                      </span>
                    </div>
                    <p style="font-size: 0.9rem; white-space: pre-wrap;">{{ log.note }}</p>
                    <div v-if="log.photos?.length" class="photo-grid compact-grid">
                      <figure v-for="photo in log.photos" :key="photo.id" class="photo-card">
                        <button type="button" class="photo-card-btn" @click="openLightbox(photo)">
                          <img :src="store.photoSrc(photo)" :alt="localeStore.t('tasks.logAttachment')" />
                        </button>
                        <figcaption>{{ photo.name }}</figcaption>
                      </figure>
                    </div>
                  </template>

                  <!-- 편집 모드 -->
                  <template v-else>
                    <p class="item-meta">{{ formatLogDate(log.date) }}</p>
                    <form class="stack-form" @submit.prevent="saveEditLog">
                      <label>{{ localeStore.t('tasks.logNote') }}
                        <textarea v-model="editLogNote" required rows="3" />
                      </label>
                      <template v-if="editLogPhotos.length">
                        <p class="muted text-sm">{{ localeStore.t('tasks.existingPhotos') }}</p>
                        <div class="photo-grid">
                          <figure v-for="photo in editLogPhotos" :key="photo.id" class="photo-card">
                            <button type="button" class="photo-card-btn" @click="openLightbox(photo)">
                              <img :src="store.photoSrc(photo)" :alt="localeStore.t('tasks.logAttachment')" />
                            </button>
                            <button type="button" class="danger photo-card-delete" @click="removeEditExistingPhoto(photo.id)">{{ localeStore.t('common.delete') }}</button>
                          </figure>
                        </div>
                      </template>
                      <label>{{ localeStore.t('tasks.attachPhotos') }}
                        <input accept="image/*" multiple type="file" @change="handleEditLogPhotoChange" />
                      </label>
                      <p v-if="editLogCompressionReport" class="muted text-sm">{{ editLogCompressionReport }}</p>
                      <div v-if="editLogNewPreviews.length" class="photo-grid">
                        <figure v-for="photo in editLogNewPreviews" :key="photo.id" class="photo-card">
                          <button type="button" class="photo-card-btn" @click="openLightbox(photo)">
                            <img :src="store.photoSrc(photo)" :alt="localeStore.t('tasks.logAttachment')" />
                          </button>
                          <button type="button" class="danger photo-card-delete" @click="removeEditNewPhoto(photo.id)">{{ localeStore.t('common.delete') }}</button>
                        </figure>
                      </div>
                      <div class="row-actions">
                        <button type="submit">{{ localeStore.t('common.change') }}</button>
                        <button class="ghost" type="button" @click="cancelEditLog">{{ localeStore.t('common.cancel') }}</button>
                      </div>
                    </form>
                  </template>
                </li>
                <li v-if="!task.logs?.length" class="muted text-sm">{{ localeStore.t('tasks.noLogs') }}</li>
              </ul>
            </div>
            <div :id="`task-form-slot-${task.id}`" class="mobile-form-slot"></div>
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

        <div id="task-form-top-calendar" class="mobile-form-slot"></div>

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
              <p class="item-meta">{{ task.category }}</p>
              <div class="row-actions">
                <button :class="statusClass(task.status)" :title="localeStore.t('tasks.statusChange')" @click="cycleStatus(task)">{{ task.status }}</button>
                <template v-if="showForm">
                  <button :class="{ ghost: !(rightPanel === 'detail' && selectedTaskId === task.id) }" @click="openDetail(task.id)">상세</button>
                  <button class="danger" @click="confirmDeleteTask(task)">{{ localeStore.t('common.delete') }}</button>
                </template>
              </div>
              <div :id="`task-form-slot-${task.id}`" class="mobile-form-slot"></div>
            </li>
          </ul>
        </template>
        <p v-else-if="calendarSelectedDate" class="muted" style="margin-top: 0.75rem;">선택한 날에 작업이 없습니다.</p>
      </template>
    </article>

    <!-- ── 오른쪽: 컨텍스트 패널 ───────────────────────── -->
    <Teleport v-if="showForm && formOpen" :to="formTarget" :disabled="!isMobile">
    <article v-if="showForm && formOpen" class="card">
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
          <p class="muted text-sm" style="margin-bottom: 0.75rem;">{{ localeStore.t('tasks.ruleDesc') }}</p>

          <!-- 등록된 규칙 목록 -->
          <ul class="list clean compact" style="margin-bottom: 1rem;">
            <li v-for="rule in scheduleRules" :key="rule.id" class="list-item card-like">
              <div>
                <p class="item-title" style="font-size: 0.9rem;">
                  <span v-if="!rule.enabled" class="pill text-xs" style="margin-right: 0.3rem;">{{ localeStore.t('tasks.ruleDisabled') }}</span>
                  {{ rule.title }}
                </p>
                <p class="item-meta">
                  {{ rule.category }} · {{ rule.frequency }}
                  <template v-if="rule.frequency === '매주'">({{ weekdayLabel(rule.dayOfWeek) }}요일)</template>
                  <template v-if="rule.frequency === '매월'">(매월 {{ rule.dayOfMonth }}일)</template>
                </p>
                <p class="muted text-sm">{{ rule.startDate }} ~ {{ rule.endDate || localeStore.t('common.ongoing') }}</p>
              </div>
              <div class="row-actions">
                <button class="ghost" @click="editSchedulerRule(rule)">{{ localeStore.t('common.edit') }}</button>
                <button class="danger" @click="removeScheduleRule(rule.id)">{{ localeStore.t('common.delete') }}</button>
              </div>
            </li>
            <li v-if="!scheduleRules.length" class="muted text-sm">{{ localeStore.t('tasks.noRules') }}</li>
          </ul>

          <!-- 규칙 추가/편집 폼 -->
          <h3 class="section-title">{{ schedulerEditingId ? localeStore.t('tasks.updateRule') : localeStore.t('tasks.saveRule') }}</h3>
          <form class="stack-form" @submit.prevent="saveScheduleRule">
            <label>{{ localeStore.t('tasks.ruleTitle') }}
              <input v-model="schedulerForm.title" required type="text" :placeholder="localeStore.t('tasks.ruleTitlePlaceholder')" />
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
        </div>

        <!-- 작업 편집 폼 -->
        <form class="stack-form" style="margin-bottom: 1.25rem;" @submit.prevent="saveTaskDetail">
          <label>{{ localeStore.t('tasks.taskName') }}
            <input v-model="detailForm.title" required type="text" />
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
            <textarea v-model="detailForm.notes" v-auto-resize style="min-height: 2.5rem;" />
          </label>
          <div class="row-actions">
            <button type="submit">{{ localeStore.t('common.change') }}</button>
            <button class="ghost" type="button" @click="newEntry">{{ localeStore.t('tasks.newEntry') }}</button>
          </div>
        </form>

      </template>

      <!-- ③ 계절 작업 템플릿 -->
      <template v-if="rightPanel === 'template'">
        <p class="muted text-sm" style="margin-bottom: 0.75rem;">{{ localeStore.t('tasks.templateDesc') }}</p>

        <div v-for="season in templatesBySeason" :key="season.key" class="season-group">
          <p v-if="season.templates.length" class="season-label">{{ season.label }}</p>
          <ul v-if="season.templates.length" class="list clean">
            <li v-for="tpl in season.templates" :key="tpl.id" class="list-item card-like">
              <div>
                <div class="row-actions" style="gap: 0.35rem; margin-bottom: 0.2rem;">
                  <p class="item-title" style="font-size: 0.92rem; margin: 0;">{{ tpl.title }}</p>
                  <span class="pill text-xs" style="padding: 0.1rem 0.5rem;">{{ tpl.category }}</span>
                </div>
                <p class="item-meta text-sm">{{ tpl.recommendedMonth }}월 · {{ tpl.notes }}</p>
              </div>
              <button class="ghost" style="white-space: nowrap; flex-shrink: 0;" @click="createFromTemplate(tpl)">
                {{ localeStore.t('tasks.create') }}
              </button>
            </li>
          </ul>
        </div>

        <p v-if="templateResult" class="muted text-sm" style="margin-top: 0.5rem;">{{ templateResult }}</p>
      </template>
    </article>
    </Teleport>
  </section>
</template>
