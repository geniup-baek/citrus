<script setup>
import { reactive, ref } from 'vue'
import { useFarmStore } from '../stores/farmStore'
import { useLocaleStore } from '../stores/localeStore'

const store = useFarmStore()
const localeStore = useLocaleStore()
const editingId = ref('')
const showForm = ref(false)

const form = reactive({
  id: '',
  name: '',
  area: 0,
  notes: '',
})

function seedlingsByFacility(facilityId) {
  return store.state.seedlings.filter((s) => s.greenhouseId === facilityId)
}

function moved(arr, i, dir) {
  const j = i + dir
  if (j < 0 || j >= arr.length) return arr
  const res = [...arr]
  const tmp = res[i]
  res[i] = res[j]
  res[j] = tmp
  return res
}

function moveFacility(i, dir) {
  store.reorderFacilities(moved(store.state.facilities, i, dir))
}

function clearForm() {
  form.id = ''
  form.name = ''
  form.area = 0
  form.notes = ''
  editingId.value = ''
}

function openAdd() {
  clearForm()
  showForm.value = true
}

function editFacility(facility) {
  form.id = facility.id
  form.name = facility.name
  form.area = facility.area
  form.notes = facility.notes
  editingId.value = facility.id
  showForm.value = true
}

function closeForm() {
  clearForm()
  showForm.value = false
}

async function saveFacility() {
  await store.upsertFacility({
    id: form.id,
    name: form.name,
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
        <h2>{{ localeStore.t('facilities.inventory') }}</h2>
        <button v-if="!showForm" class="ghost" @click="openAdd">{{ localeStore.t('common.edit') }}</button>
        <button v-else class="ghost" @click="closeForm">{{ localeStore.t('common.exitEdit') }}</button>
      </div>
      <ul class="list clean">
        <li v-for="(facility, i) in store.state.facilities" :key="facility.id" class="list-item card-like">
          <div>
            <p class="item-title">{{ facility.name }}</p>
            <p class="item-meta">{{ facility.area }} m²</p>
            <p v-for="s in seedlingsByFacility(facility.id)" :key="s.id" class="muted">
              {{ s.variety }} {{ s.quantity }}{{ localeStore.t('facilities.treeUnit') }}
            </p>
            <p v-if="!seedlingsByFacility(facility.id).length" class="muted">묘목 없음</p>
            <p class="muted">{{ facility.notes }}</p>
          </div>
          <div v-if="showForm" class="row-actions">
            <button class="ghost" :disabled="i === 0" @click="moveFacility(i, -1)">{{ localeStore.t('common.moveUp') }}</button>
            <button class="ghost" :disabled="i === store.state.facilities.length - 1" @click="moveFacility(i, 1)">{{ localeStore.t('common.moveDown') }}</button>
            <button class="ghost" @click="editFacility(facility)">{{ localeStore.t('common.edit') }}</button>
            <button class="danger" @click="store.removeFacility(facility.id)">{{ localeStore.t('common.delete') }}</button>
          </div>
        </li>
      </ul>
    </article>

    <article v-if="showForm" class="card">
      <h2>{{ editingId ? localeStore.t('facilities.editTitle') : localeStore.t('facilities.addTitle') }}</h2>
      <form class="stack-form" @submit.prevent="saveFacility">
        <label>
          {{ localeStore.t('facilities.name') }}
          <input v-model="form.name" required type="text" :placeholder="localeStore.t('facilities.name')" />
        </label>
        <label>
          {{ localeStore.t('facilities.area') }}
          <input v-model="form.area" required min="0" type="number" />
        </label>
        <label>
          {{ localeStore.t('facilities.notes') }}
          <textarea v-model="form.notes" rows="3" :placeholder="localeStore.t('facilities.notesPlaceholder')" />
        </label>
        <div class="row-actions">
          <button type="submit">{{ editingId ? localeStore.t('common.change') : localeStore.t('common.add') }}</button>
          <button class="ghost" type="button" @click="clearForm">{{ localeStore.t('common.reset') }}</button>
        </div>
      </form>
    </article>
  </section>
</template>
