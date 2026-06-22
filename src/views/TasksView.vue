<script setup>
import { computed, reactive, ref } from 'vue'
import { format, isSameDay, isWithinInterval, parseISO, startOfMonth, startOfWeek, endOfWeek, endOfMonth } from 'date-fns'
import { useFarmStore } from '../stores/farmStore'

const store = useFarmStore()
const filter = ref('today')
const selectedTaskId = ref('')

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

form.greenhouseId = store.state.facilities[0]?.id || ''
form.dueDate = format(new Date(), 'yyyy-MM-dd')
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
