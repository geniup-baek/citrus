import { computed, onBeforeUnmount, onMounted } from 'vue'
import { formatISO, isSameDay, parseISO } from 'date-fns'
import { useLocaleStore } from '../stores/localeStore'

export function useTaskNotifier(store) {
  let intervalId = null
  const canNotify = () => 'Notification' in globalThis
  const localeStore = useLocaleStore()

  const dueTodayPending = computed(() =>
    store.state.tasks.filter((task) => {
      const dueDate = parseISO(task.dueDate)
      return isSameDay(dueDate, new Date()) && task.status !== '완료'
    }),
  )

  function requestPermission() {
    if (!canNotify()) {
      return
    }

    if (Notification.permission === 'default') {
      return Notification.requestPermission()
    }

    return Promise.resolve(Notification.permission)
  }

  async function notifyDueTasks() {
    if (!canNotify()) {
      return
    }

    if (Notification.permission !== 'granted') {
      return
    }

    const todayKey = formatISO(new Date(), { representation: 'date' })

    for (const task of dueTodayPending.value) {
      if (store.getTaskLastNotified(task.id) === todayKey) {
        continue
      }

      const facility = store.state.facilities.find((item) => item.id === task.greenhouseId)

      new Notification(localeStore.t('notifier.title'), {
        body: `${task.title} - ${facility?.name || localeStore.t('notifier.noGreenhouse')}`,
        tag: task.id,
      })

      await store.markTaskNotified(task.id, todayKey)
    }
  }

  onMounted(async () => {
    await requestPermission()
    await notifyDueTasks()

    intervalId = setInterval(() => {
      notifyDueTasks()
    }, 60 * 1000)
  })

  onBeforeUnmount(() => {
    if (intervalId) {
      clearInterval(intervalId)
    }
  })

  return { dueTodayPending, requestPermission }
}
