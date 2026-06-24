<script setup>
import { ref } from 'vue'
import { useFarmStore } from '../stores/farmStore'
import { useLocaleStore } from '../stores/localeStore'

const store = useFarmStore()
const localeStore = useLocaleStore()

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
    </div>
  </section>
</template>
