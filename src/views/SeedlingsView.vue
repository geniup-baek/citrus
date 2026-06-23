<script setup>
import { computed, reactive, ref } from 'vue'
import { useFarmStore } from '../stores/farmStore'
import { useLocaleStore } from '../stores/localeStore'

const store = useFarmStore()
const localeStore = useLocaleStore()
const editingId = ref('')
const showForm = ref(false)

const varieties = computed(() => store.state.appSettings?.seedlingVarieties ?? ['한라봉', '카라향'])

const sortBy = ref('greenhouse')
const sortDir = ref('asc')
const filterGreenhouseId = ref('')
const filterVariety = ref('')

const displayedSeedlings = computed(() => {
  let list = [...store.state.seedlings]

  if (filterGreenhouseId.value) {
    list = list.filter((s) => s.greenhouseId === filterGreenhouseId.value)
  }
  if (filterVariety.value) {
    list = list.filter((s) => s.variety === filterVariety.value)
  }

  list.sort((a, b) => {
    let va, vb
    if (sortBy.value === 'greenhouse') {
      va = greenhouseName(a.greenhouseId)
      vb = greenhouseName(b.greenhouseId)
    } else if (sortBy.value === 'variety') {
      va = a.variety
      vb = b.variety
    } else {
      va = a.plantedAt
      vb = b.plantedAt
    }
    return sortDir.value === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
  })

  return list
})

const form = reactive({
  id: '',
  greenhouseId: '',
  variety: '',
  quantity: 0,
  plantedAt: '',
  rootstock: '',
  notes: '',
})

function greenhouseName(greenhouseId) {
  return (
    store.state.facilities.find((f) => f.id === greenhouseId)?.name ||
    localeStore.t('common.unknown')
  )
}

function clearForm() {
  form.id = ''
  form.greenhouseId = store.state.facilities[0]?.id || ''
  form.variety = varieties.value[0] ?? ''
  form.quantity = 0
  form.plantedAt = ''
  form.rootstock = ''
  form.notes = ''
  editingId.value = ''
}

function openAdd() {
  clearForm()
  showForm.value = true
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
  showForm.value = true
}

function closeForm() {
  clearForm()
  showForm.value = false
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
  <section :class="['page-grid', showForm ? 'two-columns' : '']">
    <article class="card">
      <div class="row-actions align-start">
        <h2>{{ localeStore.t('seedlings.overview') }}</h2>
        <button v-if="!showForm" class="ghost" @click="openAdd">{{ localeStore.t('common.edit') }}</button>
        <button v-else class="ghost" @click="closeForm">{{ localeStore.t('common.exitEdit') }}</button>
      </div>

      <div class="sort-filter-bar">
        <span class="filter-label">{{ localeStore.t('seedlings.sortBy') }}</span>
        <select v-model="sortBy" class="compact-select">
          <option value="greenhouse">{{ localeStore.t('seedlings.sortGreenhouse') }}</option>
          <option value="variety">{{ localeStore.t('seedlings.sortVariety') }}</option>
          <option value="plantedAt">{{ localeStore.t('seedlings.sortPlantedAt') }}</option>
        </select>
        <button
          class="ghost compact-btn"
          type="button"
          :title="sortDir === 'asc' ? localeStore.t('seedlings.ascending') : localeStore.t('seedlings.descending')"
          @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'"
        >{{ sortDir === 'asc' ? '↑' : '↓' }}</button>
        <span class="filter-sep">|</span>
        <span class="filter-label">{{ localeStore.t('seedlings.filterGreenhouse') }}</span>
        <select v-model="filterGreenhouseId" class="compact-select">
          <option value="">{{ localeStore.t('seedlings.filterAll') }}</option>
          <option v-for="f in store.state.facilities" :key="f.id" :value="f.id">{{ f.name }}</option>
        </select>
        <span class="filter-label">{{ localeStore.t('seedlings.filterVariety') }}</span>
        <select v-model="filterVariety" class="compact-select">
          <option value="">{{ localeStore.t('seedlings.filterAll') }}</option>
          <option v-for="v in varieties" :key="v" :value="v">{{ v }}</option>
        </select>
      </div>

      <ul class="list clean">
        <li v-for="seedling in displayedSeedlings" :key="seedling.id" class="list-item card-like">
          <div>
            <p class="item-title">{{ seedling.variety }} · {{ seedling.quantity }} {{ localeStore.t('seedlings.treeUnit') }}</p>
            <p class="item-meta">
              {{ greenhouseName(seedling.greenhouseId) }} · {{ localeStore.t('seedlings.planted') }} {{ seedling.plantedAt }}
            </p>
            <p class="muted">{{ localeStore.t('seedlings.rootstockLabel') }}: {{ seedling.rootstock || localeStore.t('seedlings.na') }}</p>
            <p class="muted">{{ seedling.notes }}</p>
          </div>
          <div v-if="showForm" class="row-actions">
            <button class="ghost" @click="editSeedling(seedling)">{{ localeStore.t('common.edit') }}</button>
            <button class="danger" @click="store.removeSeedling(seedling.id)">{{ localeStore.t('common.delete') }}</button>
          </div>
        </li>
        <li v-if="!displayedSeedlings.length" class="muted">{{ localeStore.t('common.noData') }}</li>
      </ul>
    </article>

    <article v-if="showForm" class="card">
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
            <option v-for="v in varieties" :key="v" :value="v">{{ v }}</option>
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
          <select v-model="form.rootstock">
            <option value="">{{ localeStore.t('seedlings.na') }}</option>
            <option v-for="r in store.state.appSettings?.rootstockTypes ?? []" :key="r" :value="r">{{ r }}</option>
          </select>
        </label>
        <label>
          {{ localeStore.t('seedlings.notes') }}
          <textarea v-model="form.notes" rows="3" />
        </label>
        <div class="row-actions">
          <button type="submit">{{ editingId ? localeStore.t('common.change') : localeStore.t('common.add') }}</button>
          <button class="ghost" type="button" @click="clearForm">{{ localeStore.t('common.reset') }}</button>
        </div>
      </form>
    </article>
  </section>
</template>
