<script setup>
import { computed, ref } from 'vue'
import { useFarmStore } from '../stores/farmStore'
import { useLocaleStore } from '../stores/localeStore'
import { useTreatmentStore } from '../stores/treatmentStore'
import { useRecommendSettingsStore } from '../stores/recommendSettingsStore'

const store = useFarmStore()
const localeStore = useLocaleStore()
const treatStore = useTreatmentStore()
const recSettingsStore = useRecommendSettingsStore()

// ── 백업 / 복원 ──────────────────────────────────────────────────────────────
const backupMessage = ref('')
const restoreError = ref('')
const pendingRestore = ref(null)
const restoreInput = ref(null)

const datasetLabels = {
  facilities: () => localeStore.t('nav.facilities'),
  ancillaries: () => localeStore.t('nav.ancillary'),
  seedlings: () => localeStore.t('nav.seedlings'),
  tasks: () => localeStore.t('nav.tasks'),
  scheduleRules: () => localeStore.t('settings.backupRules'),
  issues: () => localeStore.t('nav.issues'),
  inventory: () => localeStore.t('nav.inventory'),
  treatments: () => '방제기록',
}

function extendedSummary(payload) {
  const base = store.backupSummary(payload)
  base.treatments = Array.isArray(payload?.data?.treatments) ? payload.data.treatments.length : 0
  return base
}

const currentCounts = computed(() => {
  const base = store.backupSummary(store.exportBackup())
  base.treatments = treatStore.treatments.length
  return base
})

async function exportBackup() {
  const payload = await store.exportBackupWithPhotos()
  payload.data.treatments = treatStore.treatments
  payload.data.recommendSettings = { ...recSettingsStore.settings }
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
    pendingRestore.value = { payload, summary: extendedSummary(payload) }
  } catch {
    restoreError.value = localeStore.t('settings.restoreInvalid')
  }
}

function cancelRestore() {
  pendingRestore.value = null
}

async function confirmRestore() {
  if (!pendingRestore.value) return
  const { payload } = pendingRestore.value
  await store.restoreBackup(payload)
  if (Array.isArray(payload.data?.treatments)) {
    await treatStore.replaceAllTreatments(payload.data.treatments)
  }
  if (payload.data?.recommendSettings) {
    recSettingsStore.restoreSettings(payload.data.recommendSettings)
  }
  pendingRestore.value = null
  backupMessage.value = localeStore.t('settings.restoreDone')
}

const inputs = ref({
  ancillaryTypes: '',
  equipmentTypes: '',
  seedlingVarieties: '',
  rootstockTypes: '',
  taskCategories: '',
})

const errors = ref({
  ancillaryTypes: '',
  equipmentTypes: '',
  seedlingVarieties: '',
  rootstockTypes: '',
  taskCategories: '',
  pesticideTypes: '',
})

const groups = [
  { key: 'ancillaryTypes',    label: () => localeStore.t('settings.ancillaryTypes'),    hint: () => localeStore.t('settings.ancillaryHint') },
  { key: 'equipmentTypes',    label: () => localeStore.t('settings.equipmentTypes'),    hint: () => localeStore.t('settings.equipmentHint') },
  { key: 'seedlingVarieties', label: () => localeStore.t('settings.seedlingVarieties'), hint: () => localeStore.t('settings.seedlingHint') },
  { key: 'rootstockTypes',    label: () => localeStore.t('settings.rootstockTypes'),    hint: () => localeStore.t('settings.rootstockHint') },
  { key: 'pesticideTypes',    label: () => localeStore.t('settings.pesticideTypes'),    hint: () => localeStore.t('settings.pesticideHint'), isPair: true },
  { key: 'taskCategories',    label: () => localeStore.t('settings.taskCategories'),    hint: () => localeStore.t('settings.taskCategoryHint') },
]

// 농약 종류 전용 pair 입력
const pesticideTypeInputs = ref({ name: '', abbr: '' })

function itemName(item) { return typeof item === 'string' ? item : item.name }
function itemAbbr(item) { return typeof item === 'string' ? '' : (item.abbr || '') }

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

function addPesticideType() {
  const name = pesticideTypeInputs.value.name.trim()
  if (!name) return
  const abbr = pesticideTypeInputs.value.abbr.trim()
  const current = store.state.appSettings.pesticideTypes || []
  if (current.some(v => itemName(v) === name)) {
    errors.value.pesticideTypes = localeStore.t('settings.duplicateError')
    return
  }
  store.updateAppSettings({ pesticideTypes: [...current, { name, abbr }] })
  pesticideTypeInputs.value = { name: '', abbr: '' }
  errors.value.pesticideTypes = ''
}

function removeOption(key, item) {
  const current = store.state.appSettings[key] || []
  store.updateAppSettings({ [key]: current.filter((v) => itemName(v) !== itemName(item)) })
}

function onInput(key) {
  if (errors.value[key]) errors.value[key] = ''
}

const editingItem = ref(null)
const editInputs = ref({ text: '', abbr: '' })

function startEdit(key, item, i) {
  editingItem.value = { key, i }
  editInputs.value = { text: itemName(item), abbr: itemAbbr(item) }
}

function cancelEdit() {
  editingItem.value = null
}

function saveEdit(key, i, isPair) {
  const newName = editInputs.value.text.trim()
  if (!newName) return
  const current = store.state.appSettings[key] || []
  if (current.some((v, j) => j !== i && itemName(v) === newName)) return
  const updated = current.map((v, j) => {
    if (j !== i) return v
    return isPair ? { name: newName, abbr: editInputs.value.abbr.trim() } : newName
  })
  store.updateAppSettings({ [key]: updated })
  editingItem.value = null
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
              :key="group.isPair ? itemName(item) : item"
              class="list-item settings-item"
              :class="{ 'settings-item-editing': editingItem?.key === group.key && editingItem?.i === i }"
            >
              <template v-if="editingItem?.key === group.key && editingItem?.i === i">
                <input
                  v-model="editInputs.text"
                  class="settings-edit-input"
                  type="text"
                  @keydown.enter.prevent="saveEdit(group.key, i, group.isPair)"
                  @keydown.escape.prevent="cancelEdit"
                />
                <input
                  v-if="group.isPair"
                  v-model="editInputs.abbr"
                  class="settings-abbr-input"
                  type="text"
                  placeholder="약어"
                  @keydown.enter.prevent="saveEdit(group.key, i, group.isPair)"
                  @keydown.escape.prevent="cancelEdit"
                />
                <div class="row-actions">
                  <button type="button" :disabled="!editInputs.text.trim()" @click="saveEdit(group.key, i, group.isPair)">저장</button>
                  <button class="ghost" type="button" @click="cancelEdit">취소</button>
                </div>
              </template>
              <template v-else>
                <span v-if="group.isPair" class="settings-item-name">
                  {{ itemName(item) }}<span v-if="itemAbbr(item)" class="settings-item-abbr">{{ itemAbbr(item) }}</span>
                </span>
                <span v-else class="settings-item-name">{{ item }}</span>
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
                    class="ghost icon-btn"
                    type="button"
                    :title="localeStore.t('common.edit')"
                    :aria-label="localeStore.t('common.edit')"
                    @click="startEdit(group.key, item, i)"
                  >✎</button>
                  <button
                    class="danger icon-btn"
                    type="button"
                    :title="localeStore.t('common.delete')"
                    :aria-label="localeStore.t('common.delete')"
                    @click="removeOption(group.key, item)"
                  >✕</button>
                </div>
              </template>
            </li>
            <li v-if="!store.state.appSettings[group.key]?.length" class="muted">
              {{ localeStore.t('settings.noOptions') }}
            </li>
          </ul>

          <template v-if="group.isPair">
            <div class="settings-add-row settings-add-pair">
              <input
                v-model="pesticideTypeInputs.name"
                type="text"
                placeholder="표시명 (예: 살충제)"
                @input="onInput('pesticideTypes')"
                @keydown.enter.prevent="addPesticideType"
              />
              <input
                v-model="pesticideTypeInputs.abbr"
                type="text"
                placeholder="약어 (예: 살충)"
                class="settings-abbr-input"
                @keydown.enter.prevent="addPesticideType"
              />
              <button type="button" :disabled="!pesticideTypeInputs.name.trim()" @click="addPesticideType">{{ localeStore.t('settings.add') }}</button>
            </div>
          </template>
          <template v-else>
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
          </template>
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
            <span v-if="pendingRestore.summary.photos" class="pill">{{ localeStore.t('settings.backupPhotos', { count: pendingRestore.summary.photos }) }}</span>
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
