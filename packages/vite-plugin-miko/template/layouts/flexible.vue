<script setup lang="ts">
import { provide } from 'vue'
import { useRouter, routerKey } from 'vue-router'

// 显式 provide router 确保嵌套 RouterView 内子组件注入可靠
provide(routerKey, useRouter())
</script>

<template>
  <RouterView />
</template>
