<script setup>
import { reactive, ref } from 'vue'
import { useFarmStore } from '../stores/farmStore'

const store = useFarmStore()
const editingId = ref('')

const form = reactive({
  id: '',
  greenhouseId: '',
  variety: 'Hallabong',
  quantity: 0,
  plantedAt: '',
  rootstock: '',
  notes: '',
})

function greenhouseName(greenhouseId) {
  return store.state.facilities.find((facility) => facility.id === greenhouseId)?.name || 'Unknown'
}

function clearForm() {
  form.id = ''
  form.greenhouseId = store.state.facilities[0]?.id || ''
  form.variety = 'Hallabong'
  form.quantity = 0
  form.plantedAt = ''
  form.rootstock = ''
  form.notes = ''
  editingId.value = ''
}

function editSeedling(seedling) {
  form.id = seedling.id
  form.greenhouseId = seedling.greenhouseId
  form.variety = seedling.variety
  form.quantity = seedling.quantity
  form.plantedAt = seedling.plantedAt
  form.rootstock = seedling.rootstock
  form.notes = seedling.notes
  editingId.value = seedling.id
}

async function saveSeedling() {
  await store.upsertSeedling({
    id: form.id,
    greenhouseId: form.greenhouseId,
    variety: form.variety,
    quantity: Number(form.quantity),
    plantedAt: form.plantedAt,
    rootstock: form.rootstock,
    notes: form.notes,
  })

  clearForm()
}

clearForm()
</script>

<template>
  <section class="page-grid two-columns">
    <article class="card">
      <h2>{{ editingId ? 'Edit seedling batch' : 'Add seedling batch' }}</h2>
      <form class="stack-form" @submit.prevent="saveSeedling">
        <label>
          Greenhouse
          <select v-model="form.greenhouseId" required>
            <option v-for="facility in store.state.facilities" :key="facility.id" :value="facility.id">
              {{ facility.name }}
            </option>
          </select>
        </label>
        <label>
          Variety
          <select v-model="form.variety">
            <option>Hallabong</option>
            <option>Karahyang</option>
          </select>
        </label>
        <label>
          Quantity
          <input v-model="form.quantity" min="0" required type="number" />
        </label>
        <label>
          Planting date
          <input v-model="form.plantedAt" required type="date" />
        </label>
        <label>
          Rootstock
          <input v-model="form.rootstock" type="text" placeholder="Citrange" />
        </label>
        <label>
          Notes
          <textarea v-model="form.notes" rows="3" />
        </label>
        <div class="row-actions">
          <button type="submit">Save</button>
          <button class="ghost" type="button" @click="clearForm">Reset</button>
        </div>
      </form>
    </article>

    <article class="card">
      <h2>Seedling overview</h2>
      <ul class="list clean">
        <li v-for="seedling in store.state.seedlings" :key="seedling.id" class="list-item card-like">
          <div>
            <p class="item-title">{{ seedling.variety }} · {{ seedling.quantity }} trees</p>
            <p class="item-meta">
              {{ greenhouseName(seedling.greenhouseId) }} · planted {{ seedling.plantedAt }}
            </p>
            <p class="muted">Rootstock: {{ seedling.rootstock || 'N/A' }}</p>
            <p class="muted">{{ seedling.notes }}</p>
          </div>
          <div class="row-actions">
            <button class="ghost" @click="editSeedling(seedling)">Edit</button>
            <button class="danger" @click="store.removeSeedling(seedling.id)">Delete</button>
          </div>
        </li>
      </ul>
    </article>
  </section>
</template>
