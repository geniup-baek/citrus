<script setup>
import { computed } from 'vue'
import { format, parseISO } from 'date-fns'
import { useFarmStore } from '../stores/farmStore'
import { useLocaleStore } from '../stores/localeStore'
import StatCard from '../components/StatCard.vue'

const store = useFarmStore()
const localeStore = useLocaleStore()
const upcomingDays = 10

const facilityCount = computed(() => store.state.facilities.length)
const treeCount = computed(() =>
  store.state.seedlings.reduce((total, s) => total + Number(s.quantity || 0), 0),
)
const dueToday = computed(() => store.tasksToday.filter((task) => task.status !== '완료'))
const dueThisWeek = computed(() => store.tasksThisWeek.filter((task) => task.status !== '완료'))
const unresolvedIssues = computed(() => store.openIssues)
const upcoming = computed(() => store.listUpcomingDays(upcomingDays))

function greenhouseName(greenhouseId) {
  return (
    store.state.facilities.find((facility) => facility.id === greenhouseId)?.name ||
    localeStore.t('common.unknown')
  )
}

function prettyDate(dateText) {
  return format(parseISO(dateText), 'yyyy-MM-dd')
}

function taskStatusLabel(value) {
  const map = {
    '예정': localeStore.t('tasks.statusTodo'),
    '진행중': localeStore.t('tasks.statusInProgress'),
    '완료': localeStore.t('tasks.statusDone'),
  }

  return map[value] || value
}

function issueStatusLabel(value) {
  const map = {
    '조사중': localeStore.t('issues.statusInvestigating'),
    '대응중': localeStore.t('issues.statusMitigating'),
    '해결': localeStore.t('issues.statusResolved'),
  }

  return map[value] || value
}

function frequencyLabel(value) {
  return value
}
</script>

<template>
  <section class="page-grid">
    <div class="card">
      <h2>{{ localeStore.t('dashboard.todayAtGlance') }}</h2>
      <div class="stats-grid">
        <StatCard
          to="/facilities"
          :title="localeStore.t('dashboard.facilities')"
          :value="facilityCount"
          :helper="localeStore.t('dashboard.facilitiesHelper')"
        />
        <StatCard
          to="/seedlings"
          :title="localeStore.t('dashboard.trees')"
          :value="treeCount"
          :helper="localeStore.t('dashboard.treesHelper')"
        />
        <StatCard
          to="/tasks"
          :title="localeStore.t('dashboard.dueToday')"
          :value="dueToday.length"
          :helper="localeStore.t('dashboard.dueTodayHelper')"
        />
        <StatCard
          to="/issues"
          :title="localeStore.t('dashboard.openIssues')"
          :value="unresolvedIssues.length"
          :helper="localeStore.t('dashboard.openIssuesHelper')"
        />
      </div>
    </div>

    <div class="card split-card">
      <div>
        <h2>{{ localeStore.t('dashboard.weekPriorities') }}</h2>
        <ul class="list clean">
          <li v-for="task in dueThisWeek" :key="task.id" class="list-item">
            <router-link to="/tasks?filter=week" class="list-item-link">
              <div>
                <p class="item-title">{{ task.title }}</p>
                <p class="item-meta">
                  {{ greenhouseName(task.greenhouseId) }} · {{ localeStore.t('common.due') }} {{ prettyDate(task.dueDate) }}
                </p>
              </div>
              <span class="pill">{{ taskStatusLabel(task.status) }}</span>
            </router-link>
          </li>
          <li v-if="!dueThisWeek.length" class="muted">{{ localeStore.t('dashboard.noWeekWork') }}</li>
        </ul>
      </div>

      <div>
        <h2>{{ localeStore.t('dashboard.issueWatch') }}</h2>
        <ul class="list clean">
          <li v-for="issue in unresolvedIssues" :key="issue.id" class="list-item">
            <router-link to="/issues" class="list-item-link">
              <div>
                <p class="item-title">{{ issue.title }}</p>
                <p class="item-meta">{{ greenhouseName(issue.greenhouseId) }} · {{ issue.occurredAt }}</p>
              </div>
              <span class="pill danger">{{ issueStatusLabel(issue.status) }}</span>
            </router-link>
          </li>
          <li v-if="!unresolvedIssues.length" class="muted">{{ localeStore.t('dashboard.noIssues') }}</li>
        </ul>
      </div>
    </div>

    <div class="card">
      <h2>{{ localeStore.t('dashboard.upcoming', { days: upcomingDays }) }}</h2>
      <ul class="list clean">
        <li v-for="task in upcoming" :key="task.id" class="list-item">
          <router-link to="/tasks?filter=all" class="list-item-link">
            <div>
              <p class="item-title">{{ task.title }}</p>
              <p class="item-meta">
                {{ greenhouseName(task.greenhouseId) }} · {{ localeStore.t('common.due') }} {{ prettyDate(task.dueDate) }}
              </p>
            </div>
            <span class="pill">{{ frequencyLabel(task.frequency) }}</span>
          </router-link>
        </li>
        <li v-if="!upcoming.length" class="muted">{{ localeStore.t('dashboard.noUpcoming') }}</li>
      </ul>
    </div>
  </section>
</template>
