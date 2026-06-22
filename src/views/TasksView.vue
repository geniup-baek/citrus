<script setup>
import { computed, reactive, ref } from 'vue'
import { format, isSameDay, isWithinInterval, parseISO, startOfMonth, startOfWeek, endOfWeek, endOfMonth } from 'date-fns'
import { useFarmStore } from '../stores/farmStore'
import { useLocaleStore } from '../stores/localeStore'

const store = useFarmStore()
const localeStore = useLocaleStore()
const filter = ref('today')
const selectedTaskId = ref('')
const schedulerEditingId = ref('')
const schedulerRunResult = ref('')

const form = reactive({
  title: '',
  greenhouseId: '',
  dueDate: '',
  frequency: 'once',
  category: 'General',
  progress: 0,
  status: 'todo',
})

const logForm = reactive({
  note: '',
  progress: 0,
  status: 'in-progress',
})

const schedulerForm = reactive({
  id: '',
  title: '',
  greenhouseId: '',
  category: 'Routine',
  frequency: 'weekly',
  interval: 1,
  dayOfWeek: 1,
  dayOfMonth: 1,
  startDate: '',
  endDate: '',
  enabled: true,
})

const schedulerSettingsForm = reactive({
  generationDays: 21,
  duplicatePolicy: 'rule-and-date',
})

const weekdayOptions = computed(() => [
  { label: localeStore.t('tasks.monday'), value: 1 },
  { label: localeStore.t('tasks.tuesday'), value: 2 },
  { label: localeStore.t('tasks.wednesday'), value: 3 },
  { label: localeStore.t('tasks.thursday'), value: 4 },
  { label: localeStore.t('tasks.friday'), value: 5 },
  { label: localeStore.t('tasks.saturday'), value: 6 },
  { label: localeStore.t('tasks.sunday'), value: 7 },
])

const duplicatePolicyOptions = computed(() => [
  {
    value: 'rule-and-date',
    label: localeStore.t('tasks.duplicateRuleDate'),
  },
  {
    value: 'title-and-date',
    label: localeStore.t('tasks.duplicateTitleDate'),
  },
  {
    value: 'allow',
    label: localeStore.t('tasks.duplicateAllow'),
  },
])

const filteredTasks = computed(() => {
  const now = new Date()
  const weekRange = { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) }
  const monthRange = { start: startOfMonth(now), end: endOfMonth(now) }

  if (filter.value === 'annual') {
    return store.state.tasks.filter((task) => task.frequency === 'yearly')
  }

  if (filter.value === 'month') {
    return store.state.tasks.filter((task) =>
      isWithinInterval(parseISO(task.dueDate), monthRange),
    )
  }

  if (filter.value === 'week') {
    return store.state.tasks.filter((task) =>
      isWithinInterval(parseISO(task.dueDate), weekRange),
    )
  }

  if (filter.value === 'today') {
    return store.state.tasks.filter((task) => isSameDay(parseISO(task.dueDate), now))
  }

  return store.state.tasks
})

const selectedTask = computed(() =>
  store.state.tasks.find((task) => task.id === selectedTaskId.value),
)

const scheduleRules = computed(() => store.state.scheduleRules)

function greenhouseName(greenhouseId) {
  return (
    store.state.facilities.find((facility) => facility.id === greenhouseId)?.name ||
    localeStore.t('common.unknown')
  )
}

function frequencyLabel(value) {
  const map = {
    once: localeStore.t('tasks.frequencyOnce'),
    daily: localeStore.t('tasks.frequencyDaily'),
    weekly: localeStore.t('tasks.frequencyWeekly'),
    monthly: localeStore.t('tasks.frequencyMonthly'),
    yearly: localeStore.t('tasks.frequencyYearly'),
  }

  return map[value] || value
}

function taskStatusLabel(value) {
  const map = {
    todo: localeStore.t('tasks.statusTodo'),
    'in-progress': localeStore.t('tasks.statusInProgress'),
    done: localeStore.t('tasks.statusDone'),
  }

  return map[value] || value
}

async function addTask() {
  await store.upsertTask({
    title: form.title,
    greenhouseId: form.greenhouseId,
    dueDate: form.dueDate,
    frequency: form.frequency,
    category: form.category,
    progress: Number(form.progress),
    status: form.status,
    logs: [],
  })

  form.title = ''
  form.category = 'General'
  form.progress = 0
  form.status = 'todo'
}

async function updateProgress() {
  if (!selectedTask.value || !logForm.note) {
    return
  }

  await store.addTaskLog(
    selectedTask.value.id,
    logForm.note,
    Number(logForm.progress),
    logForm.status,
  )

  logForm.note = ''
}

function clearSchedulerForm() {
  schedulerForm.id = ''
  schedulerForm.title = ''
  schedulerForm.greenhouseId = store.state.facilities[0]?.id || ''
  schedulerForm.category = 'Routine'
  schedulerForm.frequency = 'weekly'
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
}

async function runScheduler() {
  await saveSchedulerSettings()
  const generatedCount = await store.runTaskScheduler({
    daysAhead: Number(schedulerSettingsForm.generationDays),
    duplicatePolicy: schedulerSettingsForm.duplicatePolicy,
    persist: true,
  })
  schedulerRunResult.value = localeStore.t('tasks.generatedResult', {
    count: generatedCount,
    days: schedulerSettingsForm.generationDays,
  })
}

async function removeScheduleRule(id) {
  await store.removeScheduleRule(id)
  if (schedulerEditingId.value === id) {
    clearSchedulerForm()
  }
}

async function saveSchedulerSettings() {
  await store.updateScheduleSettings({
    generationDays: Number(schedulerSettingsForm.generationDays),
    duplicatePolicy: schedulerSettingsForm.duplicatePolicy,
  })
}

form.greenhouseId = store.state.facilities[0]?.id || ''
form.dueDate = format(new Date(), 'yyyy-MM-dd')
schedulerSettingsForm.generationDays = store.state.scheduleSettings?.generationDays || 21
schedulerSettingsForm.duplicatePolicy = store.state.scheduleSettings?.duplicatePolicy || 'rule-and-date'
clearSchedulerForm()
</script>

<template>
  <section class="page-grid two-columns">
    <article class="card">
      <h2>{{ localeStore.t('tasks.addTask') }}</h2>
      <form class="stack-form" @submit.prevent="addTask">
        <label>
          {{ localeStore.t('tasks.taskName') }}
          <input v-model="form.title" required :placeholder="localeStore.t('tasks.taskNamePlaceholder')" type="text" />
        </label>
        <label>
          {{ localeStore.t('tasks.greenhouse') }}
          <select v-model="form.greenhouseId" required>
            <option v-for="facility in store.state.facilities" :key="facility.id" :value="facility.id">
              {{ facility.name }}
            </option>
          </select>
        </label>
        <label>
          {{ localeStore.t('tasks.dueDate') }}
          <input v-model="form.dueDate" required type="date" />
        </label>
        <label>
          {{ localeStore.t('tasks.frequency') }}
          <select v-model="form.frequency">
            <option value="once">{{ localeStore.t('tasks.frequencyOnce') }}</option>
            <option value="weekly">{{ localeStore.t('tasks.frequencyWeekly') }}</option>
            <option value="monthly">{{ localeStore.t('tasks.frequencyMonthly') }}</option>
            <option value="yearly">{{ localeStore.t('tasks.frequencyYearly') }}</option>
          </select>
        </label>
        <label>
          {{ localeStore.t('tasks.category') }}
          <input v-model="form.category" type="text" />
        </label>
        <div class="row-actions">
          <button type="submit">{{ localeStore.t('tasks.saveTask') }}</button>
        </div>
      </form>

      <h3 class="section-title">{{ localeStore.t('tasks.yearlyTemplates') }}</h3>
      <ul class="list clean">
        <li v-for="template in store.state.annualTaskTemplates" :key="template.id" class="list-item">
          <div>
            <p class="item-title">{{ template.title }}</p>
            <p class="item-meta">{{ localeStore.t('tasks.monthLabel') }} {{ template.recommendedMonth }} · {{ template.notes }}</p>
          </div>
          <button class="ghost" @click="store.createTaskFromTemplate(template.id, form.greenhouseId)">
            {{ localeStore.t('tasks.create') }}
          </button>
        </li>
      </ul>

      <div class="sub-card">
        <div class="row-actions align-start">
          <h3>{{ localeStore.t('tasks.recurringRules') }}</h3>
          <button class="ghost" @click="runScheduler">{{ localeStore.t('tasks.runNow') }}</button>
        </div>
        <p v-if="schedulerRunResult" class="muted">{{ schedulerRunResult }}</p>

        <form class="stack-form" @submit.prevent="saveSchedulerSettings">
          <div class="row-scheduler-grid">
            <label>
              {{ localeStore.t('tasks.generationRange') }}
              <input v-model="schedulerSettingsForm.generationDays" min="1" max="180" type="number" />
            </label>
            <label>
              {{ localeStore.t('tasks.duplicatePolicy') }}
              <select v-model="schedulerSettingsForm.duplicatePolicy">
                <option
                  v-for="option in duplicatePolicyOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>
          </div>
          <div class="row-actions">
            <button type="submit">{{ localeStore.t('tasks.saveSchedulerDefaults') }}</button>
          </div>
        </form>

        <form class="stack-form" @submit.prevent="saveScheduleRule">
          <label>
            {{ localeStore.t('tasks.ruleTitle') }}
            <input v-model="schedulerForm.title" required type="text" :placeholder="localeStore.t('tasks.ruleTitlePlaceholder')" />
          </label>
          <label>
            {{ localeStore.t('tasks.greenhouse') }}
            <select v-model="schedulerForm.greenhouseId" required>
              <option v-for="facility in store.state.facilities" :key="facility.id" :value="facility.id">
                {{ facility.name }}
              </option>
            </select>
          </label>
          <label>
            {{ localeStore.t('tasks.category') }}
            <input v-model="schedulerForm.category" type="text" />
          </label>
          <div class="row-scheduler-grid">
            <label>
              {{ localeStore.t('tasks.frequency') }}
              <select v-model="schedulerForm.frequency">
                <option value="daily">{{ localeStore.t('tasks.frequencyDaily') }}</option>
                <option value="weekly">{{ localeStore.t('tasks.frequencyWeekly') }}</option>
                <option value="monthly">{{ localeStore.t('tasks.frequencyMonthly') }}</option>
              </select>
            </label>
            <label>
              {{ localeStore.t('tasks.every') }}
              <input v-model="schedulerForm.interval" min="1" type="number" />
            </label>
            <label v-if="schedulerForm.frequency === 'weekly'">
              {{ localeStore.t('tasks.weekday') }}
              <select v-model="schedulerForm.dayOfWeek">
                <option v-for="option in weekdayOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>
            <label v-if="schedulerForm.frequency === 'monthly'">
              {{ localeStore.t('tasks.dayOfMonth') }}
              <input v-model="schedulerForm.dayOfMonth" min="1" max="31" type="number" />
            </label>
          </div>
          <div class="row-scheduler-grid">
            <label>
              {{ localeStore.t('tasks.startDate') }}
              <input v-model="schedulerForm.startDate" required type="date" />
            </label>
            <label>
              {{ localeStore.t('tasks.endDateOptional') }}
              <input v-model="schedulerForm.endDate" type="date" />
            </label>
          </div>
          <label class="inline-checkbox">
            <input v-model="schedulerForm.enabled" type="checkbox" />
            {{ localeStore.t('tasks.enableRule') }}
          </label>
          <div class="row-actions">
            <button type="submit">{{ schedulerEditingId ? localeStore.t('tasks.updateRule') : localeStore.t('tasks.saveRule') }}</button>
            <button class="ghost" type="button" @click="clearSchedulerForm">{{ localeStore.t('common.reset') }}</button>
          </div>
        </form>

        <ul class="list clean compact">
          <li v-for="rule in scheduleRules" :key="rule.id" class="list-item card-like">
            <div>
              <p class="item-title">{{ rule.title }}</p>
              <p class="item-meta">
                {{ greenhouseName(rule.greenhouseId) }} · {{ frequencyLabel(rule.frequency) }} · {{ localeStore.t('tasks.every') }} {{ rule.interval }}
              </p>
              <p class="muted" v-if="rule.frequency === 'weekly'">{{ localeStore.t('tasks.weekDayLabel', { day: rule.dayOfWeek }) }}</p>
              <p class="muted" v-if="rule.frequency === 'monthly'">{{ localeStore.t('tasks.monthDayLabel', { day: rule.dayOfMonth }) }}</p>
              <p class="muted">{{ localeStore.t('tasks.rangeLabel', { start: rule.startDate, end: rule.endDate || localeStore.t('common.ongoing') }) }}</p>
            </div>
            <div class="row-actions">
              <button class="ghost" @click="editSchedulerRule(rule)">{{ localeStore.t('common.edit') }}</button>
              <button class="danger" @click="removeScheduleRule(rule.id)">{{ localeStore.t('common.delete') }}</button>
            </div>
          </li>
        </ul>
      </div>
    </article>

    <article class="card">
      <div class="row-actions align-start">
        <h2>{{ localeStore.t('tasks.taskBoard') }}</h2>
        <div class="inline-filters">
          <button :class="{ ghost: filter !== 'annual' }" @click="filter = 'annual'">{{ localeStore.t('tasks.filterAnnual') }}</button>
          <button :class="{ ghost: filter !== 'month' }" @click="filter = 'month'">{{ localeStore.t('tasks.filterMonth') }}</button>
          <button :class="{ ghost: filter !== 'week' }" @click="filter = 'week'">{{ localeStore.t('tasks.filterWeek') }}</button>
          <button :class="{ ghost: filter !== 'today' }" @click="filter = 'today'">{{ localeStore.t('tasks.filterToday') }}</button>
          <button :class="{ ghost: filter !== 'all' }" @click="filter = 'all'">{{ localeStore.t('tasks.filterAll') }}</button>
        </div>
      </div>

      <ul class="list clean">
        <li v-for="task in filteredTasks" :key="task.id" class="list-item card-like">
          <div>
            <p class="item-title">{{ task.title }}</p>
            <p class="item-meta">
              {{ greenhouseName(task.greenhouseId) }} · {{ task.category }} · {{ localeStore.t('common.due') }} {{ task.dueDate }}
            </p>
            <p class="muted">{{ localeStore.t('tasks.progressStatus', { progress: task.progress, status: taskStatusLabel(task.status) }) }}</p>
            <p v-if="task.autoGenerated" class="muted">{{ localeStore.t('tasks.autoGenerated') }}</p>
          </div>
          <div class="row-actions">
            <button class="ghost" @click="selectedTaskId = task.id">{{ localeStore.t('tasks.recordProgress') }}</button>
            <button class="danger" @click="store.removeTask(task.id)">{{ localeStore.t('common.delete') }}</button>
          </div>
        </li>
        <li v-if="!filteredTasks.length" class="muted">{{ localeStore.t('tasks.noTasksByFilter') }}</li>
      </ul>

      <div v-if="selectedTask" class="sub-card">
        <h3>{{ localeStore.t('tasks.progressLog', { title: selectedTask.title }) }}</h3>
        <form class="stack-form" @submit.prevent="updateProgress">
          <label>
            {{ localeStore.t('tasks.logNote') }}
            <textarea v-model="logForm.note" required rows="3" />
          </label>
          <label>
            {{ localeStore.t('tasks.progressPercent') }}
            <input v-model="logForm.progress" max="100" min="0" type="number" />
          </label>
          <label>
            {{ localeStore.t('tasks.status') }}
            <select v-model="logForm.status">
              <option value="todo">{{ localeStore.t('tasks.statusTodo') }}</option>
              <option value="in-progress">{{ localeStore.t('tasks.statusInProgress') }}</option>
              <option value="done">{{ localeStore.t('tasks.statusDone') }}</option>
            </select>
          </label>
          <button type="submit">{{ localeStore.t('tasks.addLog') }}</button>
        </form>

        <ul class="list clean compact">
          <li v-for="log in selectedTask.logs" :key="log.date + log.note" class="list-item">
            <p class="item-meta">{{ log.date }}</p>
            <p>{{ log.note }}</p>
          </li>
        </ul>
      </div>
    </article>
  </section>
</template>
