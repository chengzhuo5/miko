<script setup lang="ts">
import { useHead } from '@unhead/vue';
import { onMounted, ref } from 'vue';
useHead({
  title: 'Page 2',
});
const count = ref(0);
const onClick = () => {
  count.value++;
};
console.log('111');
onMounted(() => {
  console.log('222');
});
const { resolve, promise } = Promise.withResolvers();
setTimeout(resolve, 3000);
await promise;
count.value = Date.now();
const client = !import.meta.env.SSR;
</script>

<template>
  <h1>You did it!2</h1>
  <p @click="onClick">
    Visit <a href="https://vuejs.org/" target="_blank" rel="noopener">vuejs.org</a> to read the
    documentation
  </p>
  <div>{{ count }}</div>
  <div v-if="client">{{ count }}</div>
</template>

<style scoped></style>
