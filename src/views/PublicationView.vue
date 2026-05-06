<template>
  <section class="publication-view">
    <h2>Publicación</h2>
    <p>Categoría: {{ category }}</p>
    <p>Slug: {{ slug }}</p>
    <div class="content" v-if="loading">Cargando publicación...</div>
    <div class="content" v-else-if="publication">
      <h3 v-if="publication.title">{{ publication.title }}</h3>
      <div v-if="publication.content" v-html="publication.content"></div>
    </div>
    <div class="content" v-else>
      Publicación no encontrada.
    </div>
  </section>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const category = ref<string | undefined>(undefined)
const slug = ref<string | undefined>(undefined)
const loading = ref<boolean>(true)
const publication = ref<{ title?: string; content?: string } | null>(null)

async function loadPublication(categoryValue: string, slugValue: string) {
  loading.value = true
  publication.value = null
  try {
    const apiPath = `/api/publications/${encodeURIComponent(categoryValue)}/${encodeURIComponent(slugValue)}`
    // Debug log for traceability
    console.debug('[PublicationView] loading from', apiPath)
    const res = await fetch(apiPath)
    if (res.ok) {
      const data = await res.json()
      publication.value = {
        title: data.title || data.name,
        content: data.content || data.body
      }
    } else {
      // Fallback: no data returned
      publication.value = null
    }
  } catch (e) {
    publication.value = null
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  category.value = route.params.category as string
  slug.value = route.params.slug as string
  if (category.value && slug.value) {
    loadPublication(category.value, slug.value)
  } else {
    loading.value = false
  }
})
</script>
<style scoped>
.publication-view { padding: 16px; }
.publication-view .content { margin-top: 8px; }
</style>
