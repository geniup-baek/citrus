<script setup>
import { computed, ref } from 'vue'
import { useFarmStore } from '../stores/farmStore'
import { useLocaleStore } from '../stores/localeStore'

const store = useFarmStore()
const localeStore = useLocaleStore()

// ── 백업 / 복원 ──────────────────────────────────────────────────────────────
const backupMessage = ref('')
const restoreError = ref('')
const pendingRestore = ref(null) // { payload, summary }
const restoreInput = ref(null)

const datasetLabels = {
  facilities: () => localeStore.t('nav.facilities'),
  ancillaries: () => localeStore.t('nav.ancillary'),
  seedlings: () => localeStore.t('nav.seedlings'),
  tasks: () => localeStore.t('nav.tasks'),
  scheduleRules: () => localeStore.t('settings.backupRules'),
  issues: () => localeStore.t('nav.issues'),
  inventory: () => localeStore.t('nav.inventory'),
}

const currentCounts = computed(() => store.backupSummary(store.exportBackup()))

function exportBackup() {
  const payload = store.exportBackup()
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `citrus-backup-${payload.exportedAt.slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  restoreError.value = ''
  backupMessage.value = localeStore.t('settings.backupExported', { date: payload.exportedAt.slice(0, 10) })
}

async function handleRestoreFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return

  backupMessage.value = ''
  restoreError.value = ''
  pendingRestore.value = null

  try {
    const payload = JSON.parse(await file.text())
    if (!store.isValidBackup(payload)) {
      restoreError.value = localeStore.t('settings.restoreInvalid')
      return
    }
    pendingRestore.value = { payload, summary: store.backupSummary(payload) }
  } catch {
    restoreError.value = localeStore.t('settings.restoreInvalid')
  }
}

function cancelRestore() {
  pendingRestore.value = null
}

async function confirmRestore() {
  if (!pendingRestore.value) return
  await store.restoreBackup(pendingRestore.value.payload)
  pendingRestore.value = null
  backupMessage.value = localeStore.t('settings.restoreDone')
}

const inputs = ref({
  ancillaryTypes: '',
  seedlingVarieties: '',
  rootstockTypes: '',
  taskCategories: '',
})

const errors = ref({
  ancillaryTypes: '',
  seedlingVarieties: '',
  rootstockTypes: '',
  taskCategories: '',
})

const groups = [
  { key: 'ancillaryTypes',    label: () => localeStore.t('settings.ancillaryTypes'),    hint: () => localeStore.t('settings.ancillaryHint') },
  { key: 'seedlingVarieties', label: () => localeStore.t('settings.seedlingVarieties'), hint: () => localeStore.t('settings.seedlingHint') },
  { key: 'rootstockTypes',    label: () => localeStore.t('settings.rootstockTypes'),    hint: () => localeStore.t('settings.rootstockHint') },
  { key: 'taskCategories',    label: () => localeStore.t('settings.taskCategories'),    hint: () => localeStore.t('settings.taskCategoryHint') },
]

function moved(arr, i, dir) {
  const j = i + dir
  if (j < 0 || j >= arr.length) return arr
  const res = [...arr]
  const tmp = res[i]
  res[i] = res[j]
  res[j] = tmp
  return res
}

function moveOption(key, i, dir) {
  const current = store.state.appSettings[key] || []
  store.updateAppSettings({ [key]: moved(current, i, dir) })
}

function addOption(key) {
  const val = inputs.value[key].trim()
  if (!val) return
  const current = store.state.appSettings[key] || []
  if (current.includes(val)) {
    errors.value[key] = localeStore.t('settings.duplicateError')
    return
  }
  store.updateAppSettings({ [key]: [...current, val] })
  inputs.value[key] = ''
  errors.value[key] = ''
}

function removeOption(key, item) {
  const current = store.state.appSettings[key] || []
  store.updateAppSettings({ [key]: current.filter((v) => v !== item) })
}

function onInput(key) {
  if (errors.value[key]) errors.value[key] = ''
}
</script>

<template>
  <section class="page-grid">
    <div class="card">
      <h2>{{ localeStore.t('settings.title') }}</h2>
      <p class="muted settings-subtitle">{{ localeStore.t('settings.subtitle') }}</p>

      <div class="settings-groups">
        <div v-for="group in groups" :key="group.key" class="sub-card settings-group">
          <div class="settings-group-head">
            <h3>{{ group.label() }}</h3>
            <span class="pill">{{ localeStore.t('settings.itemCount', { count: store.state.appSettings[group.key]?.length || 0 }) }}</span>
          </div>
          <p class="muted settings-group-hint">{{ group.hint() }}</p>

          <ul class="list clean compact">
            <li
              v-for="(item, i) in store.state.appSettings[group.key]"
              :key="item"
              class="list-item settings-item"
            >
              <span class="settings-item-name">{{ item }}</span>
              <div class="row-actions settings-item-actions">
                <button
                  class="ghost icon-btn"
                  type="button"
                  :disabled="i === 0"
                  :title="localeStore.t('common.moveUp')"
                  :aria-label="localeStore.t('common.moveUp')"
                  @click="moveOption(group.key, i, -1)"
                >↑</button>
                <button
                  class="ghost icon-btn"
                  type="button"
                  :disabled="i === store.state.appSettings[group.key].length - 1"
                  :title="localeStore.t('common.moveDown')"
                  :aria-label="localeStore.t('common.moveDown')"
                  @click="moveOption(group.key, i, 1)"
                >↓</button>
                <button
                  class="danger icon-btn"
                  type="button"
                  :title="localeStore.t('common.delete')"
                  :aria-label="localeStore.t('common.delete')"
                  @click="removeOption(group.key, item)"
                >✕</button>
              </div>
            </li>
            <li v-if="!store.state.appSettings[group.key]?.length" class="muted">
              {{ localeStore.t('settings.noOptions') }}
            </li>
          </ul>

          <div class="row-actions settings-add-row">
            <input
              v-model="inputs[group.key]"
              type="text"
              :placeholder="localeStore.t('settings.addPlaceholder')"
              @input="onInput(group.key)"
              @keydown.enter.prevent="addOption(group.key)"
            />
            <button type="button" :disabled="!inputs[group.key].trim()" @click="addOption(group.key)">{{ localeStore.t('settings.add') }}</button>
          </div>
          <p v-if="errors[group.key]" class="settings-error">{{ errors[group.key] }}</p>
        </div>
      </div>

      <div class="sub-card settings-backup">
        <div class="settings-group-head">
          <h3>{{ localeStore.t('settings.backupTitle') }}</h3>
        </div>
        <p class="muted settings-group-hint">{{ localeStore.t('settings.backupDesc') }}</p>

        <div class="backup-counts">
          <span v-for="(labelFn, key) in datasetLabels" :key="key" class="pill">
            {{ localeStore.t('settings.backupCount', { label: labelFn(), count: currentCounts[key] }) }}
          </span>
          <span v-if="currentCounts.settings" class="pill">{{ localeStore.t('settings.backupSettingsIncluded') }}</span>
        </div>

        <div class="row-actions settings-backup-actions">
          <button type="button" @click="exportBackup">{{ localeStore.t('settings.backupExport') }}</button>
          <button class="ghost" type="button" @click="restoreInput?.click()">{{ localeStore.t('settings.backupImport') }}</button>
          <input ref="restoreInput" accept="application/json,.json" type="file" hidden @change="handleRestoreFile" />
        </div>

        <p v-if="backupMessage" class="muted settings-backup-msg">{{ backupMessage }}</p>
        <p v-if="restoreError" class="settings-error">{{ restoreError }}</p>

        <div v-if="pendingRestore" class="restore-preview">
          <p class="restore-preview-title">{{ localeStore.t('settings.restorePreviewTitle') }}</p>
          <div class="backup-counts">
            <span v-for="(labelFn, key) in datasetLabels" :key="key" class="pill">
              {{ localeStore.t('settings.backupCount', { label: labelFn(), count: pendingRestore.summary[key] }) }}
            </span>
            <span v-if="pendingRestore.summary.settings" class="pill">{{ localeStore.t('settings.backupSettingsIncluded') }}</span>
          </div>
          <p class="settings-error">{{ localeStore.t('settings.restoreWarning') }}</p>
          <div class="row-actions">
            <button class="danger" type="button" @click="confirmRestore">{{ localeStore.t('settings.restoreRun') }}</button>
            <button class="ghost" type="button" @click="cancelRestore">{{ localeStore.t('common.cancel') }}</button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
