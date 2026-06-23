<script setup>
import { computed, reactive, ref } from 'vue'
import { useFarmStore } from '../stores/farmStore'
import { compressImageFile } from '../utils/imageProcessing'
import { useLocaleStore } from '../stores/localeStore'

const store = useFarmStore()
const localeStore = useLocaleStore()
const editingId = ref('')
const showForm = ref(true)
const lightboxPhoto = ref(null)

const issueForm = reactive({
  title: '',
  greenhouseId: '',
  occurredAt: '',
  status: '조사중',
  symptoms: '',
})

const photoFiles = ref([])
const photoPreviews = ref([])
const compressionReport = ref('')
const resolutionNote = ref('')
const recommendationQuery = ref('')

const editingIssue = computed(() =>
  store.state.issues.find((issue) => issue.id === editingId.value),
)

const recommendations = computed(() => {
  const derivedQuery = recommendationQuery.value.trim() || issueForm.symptoms.trim()
  const queryPhotos = photoPreviews.value.map((photo) => ({
    name: photo.name,
    contentType: photo.contentType,
    width: photo.width,
    height: photo.height,
    size: photo.size,
  }))
  if (!derivedQuery && !queryPhotos.length) return []
  return store.suggestSimilarIssues({ query: derivedQuery, photos: queryPhotos })
})

function greenhouseName(greenhouseId) {
  return (
    store.state.facilities.find((facility) => facility.id === greenhouseId)?.name ||
    localeStore.t('common.unknown')
  )
}

function issueStatusLabel(value) {
  return value
}

function openLightbox(photo) {
  lightboxPhoto.value = photo
}

function closeLightbox() {
  lightboxPhoto.value = null
}

async function handlePhotoChange(event) {
  const files = Array.from(event.target.files || [])
  photoFiles.value = files.slice(0, 5)

  let originalTotal = 0
  let compressedTotal = 0

  photoPreviews.value = await Promise.all(
    photoFiles.value.map(async (file) => {
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

  if (photoPreviews.value.length) {
    const ratio = originalTotal > 0 ? Math.round((compressedTotal / originalTotal) * 100) : 100
    compressionReport.value = localeStore.t('issues.compressedReport', {
      count: photoPreviews.value.length,
      from: Math.round(originalTotal / 1024),
      to: Math.round(compressedTotal / 1024),
      ratio,
    })
  } else {
    compressionReport.value = ''
  }
}

function removePreviewPhoto(id) {
  photoPreviews.value = photoPreviews.value.filter((p) => p.id !== id)
}

async function removeExistingPhoto(photoId) {
  if (!editingIssue.value) return
  await store.upsertIssue({
    ...editingIssue.value,
    photos: editingIssue.value.photos.filter((p) => p.id !== photoId),
  })
}

function clearForm() {
  issueForm.title = ''
  issueForm.greenhouseId = store.state.facilities[0]?.id || ''
  issueForm.occurredAt = new Date().toISOString().slice(0, 10)
  issueForm.status = '조사중'
  issueForm.symptoms = ''
  photoFiles.value = []
  photoPreviews.value = []
  compressionReport.value = ''
  resolutionNote.value = ''
  editingId.value = ''
}

function editIssue(issue) {
  editingId.value = issue.id
  issueForm.title = issue.title
  issueForm.greenhouseId = issue.greenhouseId
  issueForm.occurredAt = issue.occurredAt
  issueForm.status = issue.status
  issueForm.symptoms = issue.symptoms
  photoFiles.value = []
  photoPreviews.value = []
  compressionReport.value = ''
  resolutionNote.value = ''
}

function closeForm() {
  clearForm()
  showForm.value = false
}

async function saveIssue() {
  const newPhotos = photoPreviews.value.map((photo) => ({
    id: photo.id,
    name: photo.name,
    contentType: photo.contentType,
    size: photo.size,
    width: photo.width,
    height: photo.height,
    originalSize: photo.originalSize,
    createdAt: new Date().toISOString(),
    dataUrl: photo.dataUrl,
  }))

  const existingPhotos = editingIssue.value?.photos || []
  const existingSteps = editingIssue.value?.resolutionSteps || []

  await store.upsertIssue({
    id: editingId.value || undefined,
    title: issueForm.title,
    greenhouseId: issueForm.greenhouseId,
    occurredAt: issueForm.occurredAt,
    status: issueForm.status,
    symptoms: issueForm.symptoms,
    resolutionSteps: existingSteps,
    photos: [...existingPhotos, ...newPhotos],
  })

  clearForm()
}

async function addStep() {
  if (!editingIssue.value || !resolutionNote.value.trim()) return
  await store.addIssueResolutionStep(editingIssue.value.id, resolutionNote.value)
  resolutionNote.value = ''
}

clearForm()
</script>

<template>
  <div v-if="lightboxPhoto" class="lightbox-overlay" @click="closeLightbox">
    <img :src="lightboxPhoto.dataUrl" :alt="localeStore.t('issues.issueEvidence')" />
  </div>

  <section :class="['page-grid', showForm ? 'two-columns' : '']">
    <article class="card">
      <div class="row-actions align-start">
        <h2>{{ localeStore.t('issues.issueHistory') }}</h2>
        <button v-if="!showForm" class="ghost" @click="showForm = true">{{ localeStore.t('common.edit') }}</button>
        <button v-else class="ghost" @click="closeForm">{{ localeStore.t('common.exitEdit') }}</button>
      </div>
      <ul class="list clean">
        <li v-for="issue in store.state.issues" :key="issue.id" class="list-item card-like">
          <div>
            <p class="item-title">{{ issue.title }}</p>
            <p class="item-meta">{{ greenhouseName(issue.greenhouseId) }} · {{ issue.occurredAt }}</p>
            <p class="muted">{{ issue.symptoms }}</p>
            <div v-if="issue.photos?.length" class="photo-grid compact-grid">
              <figure v-for="photo in issue.photos" :key="photo.id" class="photo-card">
                <button type="button" class="photo-card-btn" @click="openLightbox(photo)">
                  <img :src="photo.dataUrl" :alt="localeStore.t('issues.issueEvidence')" />
                </button>
                <figcaption>{{ photo.name }}</figcaption>
              </figure>
            </div>
          </div>
          <div class="row-actions">
            <span class="pill" :class="{ danger: issue.status !== '해결' }">{{ issueStatusLabel(issue.status) }}</span>
            <template v-if="showForm">
              <button class="ghost" @click="editIssue(issue)">{{ localeStore.t('common.edit') }}</button>
              <button class="danger" @click="store.removeIssue(issue.id)">{{ localeStore.t('common.delete') }}</button>
            </template>
          </div>
        </li>
      </ul>
    </article>

    <article v-if="showForm" class="card">
      <h2>{{ editingId ? localeStore.t('issues.editTitle') : localeStore.t('issues.recordIssue') }}</h2>
      <form class="stack-form" @submit.prevent="saveIssue">
        <label>
          {{ localeStore.t('issues.issueTitle') }}
          <input v-model="issueForm.title" required type="text" :placeholder="localeStore.t('issues.issueTitlePlaceholder')" />
        </label>
        <label>
          {{ localeStore.t('issues.greenhouse') }}
          <select v-model="issueForm.greenhouseId" required>
            <option v-for="facility in store.state.facilities" :key="facility.id" :value="facility.id">
              {{ facility.name }}
            </option>
          </select>
        </label>
        <label>
          {{ localeStore.t('issues.dateObserved') }}
          <input v-model="issueForm.occurredAt" required type="date" />
        </label>
        <label>
          {{ localeStore.t('issues.status') }}
          <select v-model="issueForm.status">
            <option value="조사중">{{ localeStore.t('issues.statusInvestigating') }}</option>
            <option value="대응중">{{ localeStore.t('issues.statusMitigating') }}</option>
            <option value="해결">{{ localeStore.t('issues.statusResolved') }}</option>
          </select>
        </label>
        <label>
          {{ localeStore.t('issues.symptoms') }}
          <textarea v-model="issueForm.symptoms" required rows="4" />
        </label>

        <template v-if="editingIssue?.photos?.length">
          <p class="muted">{{ localeStore.t('issues.existingPhotos') }}</p>
          <div class="photo-grid">
            <figure v-for="photo in editingIssue.photos" :key="photo.id" class="photo-card">
              <button type="button" class="photo-card-btn" @click="openLightbox(photo)">
                <img :src="photo.dataUrl" :alt="localeStore.t('issues.issueEvidence')" />
              </button>
              <button type="button" class="danger photo-card-delete" @click="removeExistingPhoto(photo.id)">{{ localeStore.t('common.delete') }}</button>
            </figure>
          </div>
        </template>

        <label>
          {{ localeStore.t('issues.attachPhotos') }}
          <input accept="image/*" multiple type="file" @change="handlePhotoChange" />
        </label>
        <p class="muted">{{ localeStore.t('issues.photoLimit') }}</p>
        <p v-if="compressionReport" class="muted">{{ compressionReport }}</p>
        <div v-if="photoPreviews.length" class="photo-grid">
          <figure v-for="photo in photoPreviews" :key="photo.id" class="photo-card">
            <button type="button" class="photo-card-btn" @click="openLightbox(photo)">
              <img :src="photo.dataUrl" :alt="localeStore.t('issues.issueEvidence')" />
            </button>
            <button type="button" class="danger photo-card-delete" @click="removePreviewPhoto(photo.id)">{{ localeStore.t('common.delete') }}</button>
          </figure>
        </div>

        <div class="row-actions">
          <button type="submit">{{ editingId ? localeStore.t('common.change') : localeStore.t('common.add') }}</button>
          <button class="ghost" type="button" @click="clearForm">{{ localeStore.t('common.reset') }}</button>
        </div>
      </form>

      <template v-if="editingIssue">
        <h3 class="section-title">{{ localeStore.t('issues.resolutionLog', { title: editingIssue.title }) }}</h3>
        <form class="stack-form" @submit.prevent="addStep">
          <label>
            {{ localeStore.t('issues.newResolutionStep') }}
            <textarea v-model="resolutionNote" rows="3" required />
          </label>
          <button type="submit">{{ localeStore.t('issues.addStep') }}</button>
        </form>
        <ul class="list clean compact">
          <li
            v-for="step in editingIssue.resolutionSteps"
            :key="step.date + step.note"
            class="list-item"
          >
            <p class="item-meta">{{ step.date }}</p>
            <p>{{ step.note }}</p>
          </li>
        </ul>
      </template>

      <h3 class="section-title">{{ localeStore.t('issues.findSimilar') }}</h3>
      <label>
        {{ localeStore.t('issues.searchText') }}
        <textarea v-model="recommendationQuery" rows="3" :placeholder="localeStore.t('issues.searchPlaceholder')" />
      </label>
      <ul class="list clean compact">
        <li v-for="entry in recommendations" :key="entry.issue.id" class="list-item">
          <p class="item-title">{{ localeStore.t('issues.scoreLabel', { title: entry.issue.title, score: entry.score.toFixed(2) }) }}</p>
          <p class="item-meta">{{ entry.issue.symptoms }}</p>
          <p class="muted">{{ localeStore.t('issues.textPhotoScore', { text: entry.textScore.toFixed(2), photo: entry.photoScore.toFixed(2) }) }}</p>
          <p class="muted">
            {{ localeStore.t('issues.steps') }}: {{ (entry.issue.resolutionSteps || []).map((step) => step.note).join(' | ') || localeStore.t('issues.noSteps') }}
          </p>
        </li>
      </ul>
    </article>
  </section>
</template>
