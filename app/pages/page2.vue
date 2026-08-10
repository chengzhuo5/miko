<script setup lang="ts">
import { useHead } from '@unhead/vue';
import { shallowRef } from 'vue';

useHead({
  title: 'Page 2',
});

const count = shallowRef(0);

function increment() {
  count.value++;
}
</script>

<template>
  <h1>Interactive page</h1>
  <button type="button" @click="increment">Count: {{ count }}</button>
</template>
