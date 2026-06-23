<script setup>
import { computed, reactive, ref } from 'vue'
import { useFarmStore } from '../stores/farmStore'
import { useLocaleStore } from '../stores/localeStore'

const store = useFarmStore()
const localeStore = useLocaleStore()
const editingId = ref('')
const showForm = ref(false)

const typeOptions = computed(() => store.state.appSettings?.ancillaryTypes ?? ['창고', '숙소', '사무실', '기타'])

const form = reactive({
  id: '',
  name: '',
  type: '',
  area: 0,
  notes: '',
})

function moved(arr, i, dir) {
  const j = i + dir
  if (j < 0 || j >= arr.length) return arr
  const res = [...arr]
  const tmp = res[i]
  res[i] = res[j]
  res[j] = tmp
  return res
}

function moveAncillary(i, dir) {
  store.reorderAncillaries(moved(store.state.ancillaries, i, dir))
}

function clearForm() {
  form.id = ''
  form.name = ''
  form.type = typeOptions.value[0] ?? ''
  form.area = 0
  form.notes = ''
  editingId.value = ''
}

function openAdd() {
  clearForm()
  showForm.value = true
}

function editAncillary(item) {
  form.id = item.id
  form.name = item.name
  form.type = item.type
  form.area = item.area
  form.notes = item.notes
  editingId.value = item.id
  showForm.value = true
}

function closeForm() {
  clearForm()
  showForm.value = false
}

async function saveAncillary() {
  await store.upsertAncillary({
    id: form.id,
    name: form.name,
    type: form.type,
    area: Number(form.area),
    notes: form.notes,
  })
  clearForm()
}
</script>

<template>
  <section :class="['page-grid', showForm ? 'two-columns' : '']">
    <article class="card">
      <div class="row-actions align-start">
        <h2>{{ localeStore.t('ancillary.inventory') }}</h2>
        <button v-if="!showForm" class="ghost" @click="openAdd">{{ localeStore.t('common.edit') }}</button>
        <button v-else class="ghost" @click="closeForm">{{ localeStore.t('common.exitEdit') }}</button>
      </div>
      <ul class="list clean">
        <li v-for="(item, i) in store.state.ancillaries" :key="item.id" class="list-item card-like">
          <div>
            <p class="item-title">{{ item.name }}</p>
            <p class="item-meta">{{ item.type }} · {{ item.area }} m²</p>
            <p class="muted">{{ item.notes }}</p>
          </div>
          <div v-if="showForm" class="row-actions">
            <button class="ghost" :disabled="i === 0" @click="moveAncillary(i, -1)">{{ localeStore.t('common.moveUp') }}</button>
            <button class="ghost" :disabled="i === store.state.ancillaries.length - 1" @click="moveAncillary(i, 1)">{{ localeStore.t('common.moveDown') }}</button>
            <button class="ghost" @click="editAncillary(item)">{{ localeStore.t('common.edit') }}</button>
            <button class="danger" @click="store.removeAncillary(item.id)">{{ localeStore.t('common.delete') }}</button>
          </div>
        </li>
      </ul>
    </article>

    <article v-if="showForm" class="card">
      <h2>{{ editingId ? localeStore.t('ancillary.editTitle') : localeStore.t('ancillary.addTitle') }}</h2>
      <form class="stack-form" @submit.prevent="saveAncillary">
        <label>
          {{ localeStore.t('ancillary.name') }}
          <input v-model="form.name" required type="text" :placeholder="localeStore.t('ancillary.name')" />
        </label>
        <label>
          {{ localeStore.t('ancillary.type') }}
          <select v-model="form.type">
            <option v-for="t in typeOptions" :key="t" :value="t">{{ t }}</option>
          </select>
        </label>
        <label>
          {{ localeStore.t('ancillary.area') }}
          <input v-model="form.area" required min="0" type="number" />
        </label>
        <label>
          {{ localeStore.t('ancillary.notes') }}
          <textarea v-model="form.notes" rows="3" :placeholder="localeStore.t('ancillary.notesPlaceholder')" />
        </label>
        <div class="row-actions">
          <button type="submit">{{ editingId ? localeStore.t('common.change') : localeStore.t('common.add') }}</button>
          <button class="ghost" type="button" @click="clearForm">{{ localeStore.t('common.reset') }}</button>
        </div>
      </form>
    </article>
  </section>
</template>
