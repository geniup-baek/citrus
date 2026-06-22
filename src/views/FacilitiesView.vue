<script setup>
import { reactive, ref } from 'vue'
import { useFarmStore } from '../stores/farmStore'
import { useLocaleStore } from '../stores/localeStore'

const store = useFarmStore()
const localeStore = useLocaleStore()
const editingId = ref('')

const form = reactive({
  id: '',
  name: '',
  area: 0,
  trees: 0,
  notes: '',
})

function clearForm() {
  form.id = ''
  form.name = ''
  form.area = 0
  form.trees = 0
  form.notes = ''
  editingId.value = ''
}

function editFacility(facility) {
  form.id = facility.id
  form.name = facility.name
  form.area = facility.area
  form.trees = facility.trees
  form.notes = facility.notes
  editingId.value = facility.id
}

async function saveFacility() {
  await store.upsertFacility({
    id: form.id,
    name: form.name,
    area: Number(form.area),
    trees: Number(form.trees),
    notes: form.notes,
  })

  clearForm()
}
</script>

<template>
  <section class="page-grid two-columns">
    <article class="card">
      <h2>{{ editingId ? localeStore.t('facilities.editTitle') : localeStore.t('facilities.addTitle') }}</h2>
      <form class="stack-form" @submit.prevent="saveFacility">
        <label>
          {{ localeStore.t('facilities.name') }}
          <input v-model="form.name" required type="text" placeholder="Greenhouse 5" />
        </label>
        <label>
          {{ localeStore.t('facilities.area') }}
          <input v-model="form.area" required min="0" type="number" />
        </label>
        <label>
          {{ localeStore.t('facilities.treeCount') }}
          <input v-model="form.trees" required min="0" type="number" />
        </label>
        <label>
          {{ localeStore.t('facilities.notes') }}
          <textarea v-model="form.notes" rows="3" :placeholder="localeStore.t('facilities.notesPlaceholder')" />
        </label>
        <div class="row-actions">
          <button type="submit">{{ localeStore.t('common.save') }}</button>
          <button class="ghost" type="button" @click="clearForm">{{ localeStore.t('common.reset') }}</button>
        </div>
      </form>
    </article>

    <article class="card">
      <h2>{{ localeStore.t('facilities.inventory') }}</h2>
      <ul class="list clean">
        <li v-for="facility in store.state.facilities" :key="facility.id" class="list-item card-like">
          <div>
            <p class="item-title">{{ facility.name }}</p>
            <p class="item-meta">{{ facility.area }} m² · {{ facility.trees }} {{ localeStore.t('facilities.treeUnit') }}</p>
            <p class="muted">{{ facility.notes }}</p>
          </div>
          <div class="row-actions">
            <button class="ghost" @click="editFacility(facility)">{{ localeStore.t('common.edit') }}</button>
            <button class="danger" @click="store.removeFacility(facility.id)">{{ localeStore.t('common.delete') }}</button>
          </div>
        </li>
      </ul>
    </article>
  </section>
</template>
