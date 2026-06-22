<script setup>
import { computed, reactive, ref } from 'vue'
import { format, isSameDay, isWithinInterval, parseISO, startOfMonth, startOfWeek, endOfWeek, endOfMonth } from 'date-fns'
import { useFarmStore } from '../stores/farmStore'

const store = useFarmStore()
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

const weekdayOptions = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 7 },
]

const duplicatePolicyOptions = [
  {
    value: 'rule-and-date',
    label: 'Skip duplicates by rule/date',
  },
  {
    value: 'title-and-date',
    label: 'Skip duplicates by title/date',
  },
  {
    value: 'allow',
    label: 'Allow duplicates',
  },
]

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
  return store.state.facilities.find((facility) => facility.id === greenhouseId)?.name || 'Unknown'
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
  schedulerRunResult.value = `Generated ${generatedCount} task(s) for the next ${schedulerSettingsForm.generationDays} days.`
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
      <h2>Add task</h2>
      <form class="stack-form" @submit.prevent="addTask">
        <label>
          Task name
          <input v-model="form.title" required placeholder="Spray calibration" type="text" />
        </label>
        <label>
          Greenhouse
          <select v-model="form.greenhouseId" required>
            <option v-for="facility in store.state.facilities" :key="facility.id" :value="facility.id">
              {{ facility.name }}
            </option>
          </select>
        </label>
        <label>
          Due date
          <input v-model="form.dueDate" required type="date" />
        </label>
        <label>
          Frequency
          <select v-model="form.frequency">
            <option value="once">One time</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </label>
        <label>
          Category
          <input v-model="form.category" type="text" />
        </label>
        <div class="row-actions">
          <button type="submit">Save task</button>
        </div>
      </form>

      <h3 class="section-title">Yearly task templates</h3>
      <ul class="list clean">
        <li v-for="template in store.state.annualTaskTemplates" :key="template.id" class="list-item">
          <div>
            <p class="item-title">{{ template.title }}</p>
            <p class="item-meta">Month {{ template.recommendedMonth }} · {{ template.notes }}</p>
          </div>
          <button class="ghost" @click="store.createTaskFromTemplate(template.id, form.greenhouseId)">
            Create
          </button>
        </li>
      </ul>

      <div class="sub-card">
        <div class="row-actions align-start">
          <h3>Recurring scheduler rules</h3>
          <button class="ghost" @click="runScheduler">Run now</button>
        </div>
        <p v-if="schedulerRunResult" class="muted">{{ schedulerRunResult }}</p>

        <form class="stack-form" @submit.prevent="saveSchedulerSettings">
          <div class="row-scheduler-grid">
            <label>
              Generation range (days)
              <input v-model="schedulerSettingsForm.generationDays" min="1" max="180" type="number" />
            </label>
            <label>
              Duplicate policy
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
            <button type="submit">Save scheduler defaults</button>
          </div>
        </form>

        <form class="stack-form" @submit.prevent="saveScheduleRule">
          <label>
            Rule title
            <input v-model="schedulerForm.title" required type="text" placeholder="Weekly pest scouting" />
          </label>
          <label>
            Greenhouse
            <select v-model="schedulerForm.greenhouseId" required>
              <option v-for="facility in store.state.facilities" :key="facility.id" :value="facility.id">
                {{ facility.name }}
              </option>
            </select>
          </label>
          <label>
            Category
            <input v-model="schedulerForm.category" type="text" />
          </label>
          <div class="row-scheduler-grid">
            <label>
              Frequency
              <select v-model="schedulerForm.frequency">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            <label>
              Every
              <input v-model="schedulerForm.interval" min="1" type="number" />
            </label>
            <label v-if="schedulerForm.frequency === 'weekly'">
              Weekday
              <select v-model="schedulerForm.dayOfWeek">
                <option v-for="option in weekdayOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>
            <label v-if="schedulerForm.frequency === 'monthly'">
              Day of month
              <input v-model="schedulerForm.dayOfMonth" min="1" max="31" type="number" />
            </label>
          </div>
          <div class="row-scheduler-grid">
            <label>
              Start date
              <input v-model="schedulerForm.startDate" required type="date" />
            </label>
            <label>
              End date (optional)
              <input v-model="schedulerForm.endDate" type="date" />
            </label>
          </div>
          <label class="inline-checkbox">
            <input v-model="schedulerForm.enabled" type="checkbox" />
            Enable rule
          </label>
          <div class="row-actions">
            <button type="submit">{{ schedulerEditingId ? 'Update rule' : 'Save rule' }}</button>
            <button class="ghost" type="button" @click="clearSchedulerForm">Reset</button>
          </div>
        </form>

        <ul class="list clean compact">
          <li v-for="rule in scheduleRules" :key="rule.id" class="list-item card-like">
            <div>
              <p class="item-title">{{ rule.title }}</p>
              <p class="item-meta">
                {{ greenhouseName(rule.greenhouseId) }} · {{ rule.frequency }} · every {{ rule.interval }}
              </p>
              <p class="muted" v-if="rule.frequency === 'weekly'">Weekday {{ rule.dayOfWeek }}</p>
              <p class="muted" v-if="rule.frequency === 'monthly'">Month day {{ rule.dayOfMonth }}</p>
              <p class="muted">{{ rule.startDate }} ~ {{ rule.endDate || 'ongoing' }}</p>
            </div>
            <div class="row-actions">
              <button class="ghost" @click="editSchedulerRule(rule)">Edit</button>
              <button class="danger" @click="removeScheduleRule(rule.id)">Delete</button>
            </div>
          </li>
        </ul>
      </div>
    </article>

    <article class="card">
      <div class="row-actions align-start">
        <h2>Task board</h2>
        <div class="inline-filters">
          <button :class="{ ghost: filter !== 'annual' }" @click="filter = 'annual'">Annual</button>
          <button :class="{ ghost: filter !== 'month' }" @click="filter = 'month'">Month</button>
          <button :class="{ ghost: filter !== 'week' }" @click="filter = 'week'">Week</button>
          <button :class="{ ghost: filter !== 'today' }" @click="filter = 'today'">Today</button>
          <button :class="{ ghost: filter !== 'all' }" @click="filter = 'all'">All</button>
        </div>
      </div>

      <ul class="list clean">
        <li v-for="task in filteredTasks" :key="task.id" class="list-item card-like">
          <div>
            <p class="item-title">{{ task.title }}</p>
            <p class="item-meta">
              {{ greenhouseName(task.greenhouseId) }} · {{ task.category }} · due {{ task.dueDate }}
            </p>
            <p class="muted">Progress {{ task.progress }}% · status {{ task.status }}</p>
            <p v-if="task.autoGenerated" class="muted">Auto-generated task</p>
          </div>
          <div class="row-actions">
            <button class="ghost" @click="selectedTaskId = task.id">Record progress</button>
            <button class="danger" @click="store.removeTask(task.id)">Delete</button>
          </div>
        </li>
        <li v-if="!filteredTasks.length" class="muted">No tasks for this filter.</li>
      </ul>

      <div v-if="selectedTask" class="sub-card">
        <h3>Progress log - {{ selectedTask.title }}</h3>
        <form class="stack-form" @submit.prevent="updateProgress">
          <label>
            Log note
            <textarea v-model="logForm.note" required rows="3" />
          </label>
          <label>
            Progress (%)
            <input v-model="logForm.progress" max="100" min="0" type="number" />
          </label>
          <label>
            Status
            <select v-model="logForm.status">
              <option value="todo">todo</option>
              <option value="in-progress">in-progress</option>
              <option value="done">done</option>
            </select>
          </label>
          <button type="submit">Add log</button>
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
