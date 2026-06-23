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

const groups = [
  { key: 'ancillaryTypes',    label: () => localeStore.t('settings.ancillaryTypes') },
  { key: 'seedlingVarieties', label: () => localeStore.t('settings.seedlingVarieties') },
  { key: 'rootstockTypes',    label: () => localeStore.t('settings.rootstockTypes') },
  { key: 'taskCategories',    label: () => localeStore.t('settings.taskCategories') },
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
  if (current.includes(val)) return
  store.updateAppSettings({ [key]: [...current, val] })
  inputs.value[key] = ''
}

function removeOption(key, item) {
  const current = store.state.appSettings[key] || []
  store.updateAppSettings({ [key]: current.filter((v) => v !== item) })
}
</script>

<template>
  <section class="page-grid">
    <div class="card">
      <h2>{{ localeStore.t('settings.title') }}</h2>
      <div class="settings-groups">
        <div v-for="group in groups" :key="group.key" class="sub-card">
          <h3>{{ group.label() }}</h3>
          <ul class="list clean compact">
            <li
              v-for="(item, i) in store.state.appSettings[group.key]"
              :key="item"
              class="list-item"
            >
              <span>{{ item }}</span>
              <div class="row-actions">
                <button class="ghost" type="button" :disabled="i === 0" @click="moveOption(group.key, i, -1)">{{ localeStore.t('common.moveUp') }}</button>
                <button class="ghost" type="button" :disabled="i === store.state.appSettings[group.key].length - 1" @click="moveOption(group.key, i, 1)">{{ localeStore.t('common.moveDown') }}</button>
                <button class="danger" type="button" @click="removeOption(group.key, item)">{{ localeStore.t('common.delete') }}</button>
              </div>
            </li>
            <li v-if="!store.state.appSettings[group.key]?.length" class="muted">
              {{ localeStore.t('settings.noOptions') }}
            </li>
          </ul>
          <div class="row-actions">
            <input
              v-model="inputs[group.key]"
              type="text"
              :placeholder="localeStore.t('settings.addPlaceholder')"
              @keydown.enter.prevent="addOption(group.key)"
            />
            <button type="button" @click="addOption(group.key)">{{ localeStore.t('settings.add') }}</button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
