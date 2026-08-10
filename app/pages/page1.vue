<script setup lang="ts">
import { useHead } from '@unhead/vue';

useHead({
  title: 'Page 1',
});
</script>

<template>
  <h1>Client-only page</h1>
  <p>
    Visit <a href="https://vuejs.org/" target="_blank" rel="noopener">vuejs.org</a> to read the
    documentation
  </p>
</template>

<route lang="yaml">
meta:
  clientOnly: true
</route>
