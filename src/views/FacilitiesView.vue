<script setup>
import { reactive, ref } from 'vue'
import { useFarmStore } from '../stores/farmStore'

const store = useFarmStore()
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
      <h2>{{ editingId ? 'Edit facility' : 'Add facility' }}</h2>
      <form class="stack-form" @submit.prevent="saveFacility">
        <label>
          Facility name
          <input v-model="form.name" required type="text" placeholder="Greenhouse 5" />
        </label>
        <label>
          Area (m²)
          <input v-model="form.area" required min="0" type="number" />
        </label>
        <label>
          Tree count
          <input v-model="form.trees" required min="0" type="number" />
        </label>
        <label>
          Notes
          <textarea v-model="form.notes" rows="3" placeholder="Any operating details" />
        </label>
        <div class="row-actions">
          <button type="submit">Save</button>
          <button class="ghost" type="button" @click="clearForm">Reset</button>
        </div>
      </form>
    </article>

    <article class="card">
      <h2>Facility inventory</h2>
      <ul class="list clean">
        <li v-for="facility in store.state.facilities" :key="facility.id" class="list-item card-like">
          <div>
            <p class="item-title">{{ facility.name }}</p>
            <p class="item-meta">{{ facility.area }} m² · {{ facility.trees }} trees</p>
            <p class="muted">{{ facility.notes }}</p>
          </div>
          <div class="row-actions">
            <button class="ghost" @click="editFacility(facility)">Edit</button>
            <button class="danger" @click="store.removeFacility(facility.id)">Delete</button>
          </div>
        </li>
      </ul>
    </article>
  </section>
</template>
