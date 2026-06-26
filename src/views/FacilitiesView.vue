<script setup>
import { reactive, ref } from 'vue'
import { useFarmStore } from '../stores/farmStore'
import { useLocaleStore } from '../stores/localeStore'
import { compressImageFile } from '../utils/imageProcessing'

const store = useFarmStore()
const localeStore = useLocaleStore()
const editingId = ref('')
const showForm = ref(false)

const form = reactive({
  id: '',
  name: '',
  notes: '',
})

// 사진
const formPhotos = ref([]) // 편집 중 유지되는 기존 사진
const photoPreviews = ref([]) // 새로 추가한 미리보기
const compressionReport = ref('')
const lightboxPhoto = ref(null)

function seedlingsByFacility(facilityId) {
  return store.state.seedlings.filter((s) => s.greenhouseId === facilityId)
}

function varietyTotalsByFacility(facilityId) {
  const totals = new Map()
  for (const s of seedlingsByFacility(facilityId)) {
    const variety = s.variety || ''
    totals.set(variety, (totals.get(variety) || 0) + 1)
  }
  return [...totals.entries()].map(([variety, count]) => ({ variety, count }))
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

// ── 사진 헬퍼 ────────────────────────────────────────────────────────────────
async function filesToPreviews(files) {
  let originalTotal = 0
  let compressedTotal = 0

  const previews = await Promise.all(
    files.map(async (file) => {
      const compressed = await compressImageFile(file, {
        maxWidth: 1280,
        maxHeight: 1280,
        quality: 0.78,
        outputType: 'image/jpeg',
      })
      originalTotal += compressed.originalSize
      compressedTotal += compressed.compressedSize
      return {
        id: crypto.randomUUID(),
        name: file.name,
        dataUrl: compressed.dataUrl,
        contentType: compressed.contentType,
        size: compressed.compressedSize,
        width: compressed.width,
        height: compressed.height,
        originalSize: compressed.originalSize,
      }
    }),
  )

  const report = previews.length
    ? localeStore.t('facilities.compressedReport', {
        count: previews.length,
        from: Math.round(originalTotal / 1024),
        to: Math.round(compressedTotal / 1024),
        ratio: originalTotal > 0 ? Math.round((compressedTotal / originalTotal) * 100) : 100,
      })
    : ''

  return { previews, report }
}

function previewToPhoto(photo) {
  return {
    id: photo.id,
    name: photo.name,
    contentType: photo.contentType,
    size: photo.size,
    width: photo.width,
    height: photo.height,
    originalSize: photo.originalSize,
    createdAt: new Date().toISOString(),
    dataUrl: photo.dataUrl,
  }
}

async function handlePhotoChange(event) {
  const files = Array.from(event.target.files || []).slice(0, 5)
  const { previews, report } = await filesToPreviews(files)
  photoPreviews.value = previews
  compressionReport.value = report
}

function removePreviewPhoto(id) {
  photoPreviews.value = photoPreviews.value.filter((p) => p.id !== id)
}

function removeExistingPhoto(id) {
  formPhotos.value = formPhotos.value.filter((p) => p.id !== id)
}

function openLightbox(photo) {
  lightboxPhoto.value = photo
}

function closeLightbox() {
  lightboxPhoto.value = null
}

function clearForm() {
  form.id = ''
  form.name = ''
  form.notes = ''
  formPhotos.value = []
  photoPreviews.value = []
  compressionReport.value = ''
  editingId.value = ''
}

function openAdd() {
  clearForm()
  showForm.value = true
}

function editFacility(facility) {
  form.id = facility.id
  form.name = facility.name
  form.notes = facility.notes
  formPhotos.value = [...(facility.photos || [])]
  photoPreviews.value = []
  compressionReport.value = ''
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
    notes: form.notes,
    photos: [...formPhotos.value, ...photoPreviews.value.map(previewToPhoto)],
  })
  clearForm()
}
</script>

<template>
  <div v-if="lightboxPhoto" class="lightbox-overlay" @click="closeLightbox">
    <img :src="lightboxPhoto.dataUrl" :alt="localeStore.t('facilities.facilityPhoto')" />
  </div>

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
            <p v-for="t in varietyTotalsByFacility(facility.id)" :key="t.variety" class="muted">
              {{ t.variety }} {{ t.count }}{{ localeStore.t('facilities.treeUnit') }}
            </p>
            <p v-if="!seedlingsByFacility(facility.id).length" class="muted">묘목 없음</p>
            <p class="muted">{{ facility.notes }}</p>
            <div v-if="facility.photos?.length" class="photo-grid compact-grid">
              <figure v-for="photo in facility.photos" :key="photo.id" class="photo-card">
                <button type="button" class="photo-card-btn" @click="openLightbox(photo)">
                  <img :src="photo.dataUrl" :alt="localeStore.t('facilities.facilityPhoto')" />
                </button>
                <figcaption>{{ photo.name }}</figcaption>
              </figure>
            </div>
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
          {{ localeStore.t('facilities.notes') }}
          <textarea v-model="form.notes" rows="3" :placeholder="localeStore.t('facilities.notesPlaceholder')" />
        </label>

        <template v-if="formPhotos.length">
          <p class="muted">{{ localeStore.t('facilities.existingPhotos') }}</p>
          <div class="photo-grid">
            <figure v-for="photo in formPhotos" :key="photo.id" class="photo-card">
              <button type="button" class="photo-card-btn" @click="openLightbox(photo)">
                <img :src="photo.dataUrl" :alt="localeStore.t('facilities.facilityPhoto')" />
              </button>
              <button type="button" class="danger photo-card-delete" @click="removeExistingPhoto(photo.id)">{{ localeStore.t('common.delete') }}</button>
            </figure>
          </div>
        </template>

        <label>
          {{ localeStore.t('facilities.attachPhotos') }}
          <input accept="image/*" multiple type="file" @change="handlePhotoChange" />
        </label>
        <p class="muted">{{ localeStore.t('facilities.photoLimit') }}</p>
        <p v-if="compressionReport" class="muted">{{ compressionReport }}</p>
        <div v-if="photoPreviews.length" class="photo-grid">
          <figure v-for="photo in photoPreviews" :key="photo.id" class="photo-card">
            <button type="button" class="photo-card-btn" @click="openLightbox(photo)">
              <img :src="photo.dataUrl" :alt="localeStore.t('facilities.facilityPhoto')" />
            </button>
            <button type="button" class="danger photo-card-delete" @click="removePreviewPhoto(photo.id)">{{ localeStore.t('common.delete') }}</button>
          </figure>
        </div>

        <div class="row-actions">
          <button type="submit">{{ editingId ? localeStore.t('common.change') : localeStore.t('common.add') }}</button>
          <button class="ghost" type="button" @click="clearForm">{{ localeStore.t('common.reset') }}</button>
        </div>
      </form>
    </article>
  </section>
</template>
