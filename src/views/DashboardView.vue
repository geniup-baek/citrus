<script setup>
import { computed } from 'vue'
import { format, parseISO } from 'date-fns'
import { useFarmStore } from '../stores/farmStore'
import StatCard from '../components/StatCard.vue'

const store = useFarmStore()

const facilityCount = computed(() => store.state.facilities.length)
const treeCount = computed(() =>
  store.state.facilities.reduce((total, facility) => total + Number(facility.trees || 0), 0),
)
const dueToday = computed(() => store.tasksToday.filter((task) => task.status !== 'done'))
const dueThisWeek = computed(() => store.tasksThisWeek.filter((task) => task.status !== 'done'))
const unresolvedIssues = computed(() => store.openIssues)
const upcoming = computed(() => store.listUpcomingDays(10))

function greenhouseName(greenhouseId) {
  return store.state.facilities.find((facility) => facility.id === greenhouseId)?.name || 'Unknown'
}

function prettyDate(dateText) {
  return format(parseISO(dateText), 'yyyy-MM-dd')
}
</script>

<template>
  <section class="page-grid">
    <div class="card">
      <h2>Today at a glance</h2>
      <div class="stats-grid">
        <StatCard title="Facilities" :value="facilityCount" helper="4 houses currently in production" />
        <StatCard title="Trees" :value="treeCount" helper="Hallabong and Karahyang combined" />
        <StatCard title="Due today" :value="dueToday.length" helper="Pending or in-progress tasks" />
        <StatCard title="Open issues" :value="unresolvedIssues.length" helper="Needs diagnosis or follow-up" />
      </div>
    </div>

    <div class="card split-card">
      <div>
        <h2>This week priorities</h2>
        <ul class="list clean">
          <li v-for="task in dueThisWeek" :key="task.id" class="list-item">
            <div>
              <p class="item-title">{{ task.title }}</p>
              <p class="item-meta">{{ greenhouseName(task.greenhouseId) }} · due {{ prettyDate(task.dueDate) }}</p>
            </div>
            <span class="pill">{{ task.status }}</span>
          </li>
          <li v-if="!dueThisWeek.length" class="muted">No pending work this week.</li>
        </ul>
      </div>

      <div>
        <h2>Issue watch</h2>
        <ul class="list clean">
          <li v-for="issue in unresolvedIssues" :key="issue.id" class="list-item">
            <div>
              <p class="item-title">{{ issue.title }}</p>
              <p class="item-meta">{{ greenhouseName(issue.greenhouseId) }} · {{ issue.occurredAt }}</p>
            </div>
            <span class="pill danger">{{ issue.status }}</span>
          </li>
          <li v-if="!unresolvedIssues.length" class="muted">No unresolved issues.</li>
        </ul>
      </div>
    </div>

    <div class="card">
      <h2>Upcoming 10 days</h2>
      <ul class="list clean">
        <li v-for="task in upcoming" :key="task.id" class="list-item">
          <div>
            <p class="item-title">{{ task.title }}</p>
            <p class="item-meta">{{ greenhouseName(task.greenhouseId) }} · due {{ prettyDate(task.dueDate) }}</p>
          </div>
          <span class="pill">{{ task.frequency }}</span>
        </li>
        <li v-if="!upcoming.length" class="muted">No upcoming tasks. Add one from Tasks.</li>
      </ul>
    </div>
  </section>
</template>
