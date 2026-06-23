<script setup>
import { reactive, ref } from 'vue'
import { useFarmStore } from '../stores/farmStore'
import { useLocaleStore } from '../stores/localeStore'

const store = useFarmStore()
const localeStore = useLocaleStore()
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
  return (
    store.state.facilities.find((facility) => facility.id === greenhouseId)?.name ||
    localeStore.t('common.unknown')
  )
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
      <h2>{{ localeStore.t('seedlings.overview') }}</h2>
      <ul class="list clean">
        <li v-for="seedling in store.state.seedlings" :key="seedling.id" class="list-item card-like">
          <div>
            <p class="item-title">{{ seedling.variety }} · {{ seedling.quantity }} {{ localeStore.t('seedlings.treeUnit') }}</p>
            <p class="item-meta">
              {{ greenhouseName(seedling.greenhouseId) }} · {{ localeStore.t('seedlings.planted') }} {{ seedling.plantedAt }}
            </p>
            <p class="muted">{{ localeStore.t('seedlings.rootstockLabel') }}: {{ seedling.rootstock || localeStore.t('seedlings.na') }}</p>
            <p class="muted">{{ seedling.notes }}</p>
          </div>
          <div class="row-actions">
            <button class="ghost" @click="editSeedling(seedling)">{{ localeStore.t('common.edit') }}</button>
            <button class="danger" @click="store.removeSeedling(seedling.id)">{{ localeStore.t('common.delete') }}</button>
          </div>
        </li>
      </ul>
    </article>

    <article class="card">
      <h2>{{ editingId ? localeStore.t('seedlings.editTitle') : localeStore.t('seedlings.addTitle') }}</h2>
      <form class="stack-form" @submit.prevent="saveSeedling">
        <label>
          {{ localeStore.t('seedlings.greenhouse') }}
          <select v-model="form.greenhouseId" required>
            <option v-for="facility in store.state.facilities" :key="facility.id" :value="facility.id">
              {{ facility.name }}
            </option>
          </select>
        </label>
        <label>
          {{ localeStore.t('seedlings.variety') }}
          <select v-model="form.variety">
            <option>Hallabong</option>
            <option>Karahyang</option>
          </select>
        </label>
        <label>
          {{ localeStore.t('seedlings.quantity') }}
          <input v-model="form.quantity" min="0" required type="number" />
        </label>
        <label>
          {{ localeStore.t('seedlings.plantingDate') }}
          <input v-model="form.plantedAt" required type="date" />
        </label>
        <label>
          {{ localeStore.t('seedlings.rootstock') }}
          <input v-model="form.rootstock" type="text" placeholder="Citrange" />
        </label>
        <label>
          {{ localeStore.t('seedlings.notes') }}
          <textarea v-model="form.notes" rows="3" />
        </label>
        <div class="row-actions">
          <button type="submit">{{ localeStore.t('seedlings.save') }}</button>
          <button class="ghost" type="button" @click="clearForm">{{ localeStore.t('common.reset') }}</button>
        </div>
      </form>
    </article>
  </section>
</template>
