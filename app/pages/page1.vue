<script setup lang="ts">
import { useHead } from '@unhead/vue';
if (import.meta.env.SSR)
  useHead({
    title: 'Page 1',
  });
const { resolve, promise } = Promise.withResolvers();
setTimeout(resolve, 1000);
await promise;
</script>

<template>
  <h1>You did it!</h1>
  <p>
    Visit <a href="https://vuejs.org/" target="_blank" rel="noopener">vuejs.org</a> to read the
    documentation
  </p>
</template>

<style scoped></style>
<route lang="yaml">
meta:
  clientOnly: true
</route>
