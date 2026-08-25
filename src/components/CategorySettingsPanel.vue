<script setup>
import { ref } from 'vue'
import { useFarmStore } from '../stores/farmStore'
import { useLocaleStore } from '../stores/localeStore'
import { confirm } from '../composables/useConfirm'

const store = useFarmStore()
const localeStore = useLocaleStore()

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

async function removeOption(key, item) {
  const ok = await confirm({ message: `'${itemName(item)}' 항목을 삭제합니다. 되돌릴 수 없습니다.` })
  if (!ok) return
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
</template>
