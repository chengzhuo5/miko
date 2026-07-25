<script setup lang="ts">
import { useRoute } from 'vue-router';
import { useHead } from '@minar-kotonoha/framework/modules/@unhead/vue.ts';
import skeletonStyles from './styles/skeleton.less?inline';
import hiddenVCloakStyles from './styles/hiddenVCloak.less?inline';
import Fallback from './components/Fallback.vue';

const onResolve = () => {
  if (!import.meta.env.SSR) {
    document.getElementById('app')!.removeAttribute('v-cloak');
  }
};
const useSkeleton = useRoute().meta.useSkeleton ?? true;
const isDev = import.meta.env.DEV;

// 此处在预渲染时完成，故加个判断，客户端代码会剔除这块，减小包体积
if (import.meta.env.SSR) {
  // 生产环境 Framework CDN 地址，可通过 VITE_FRAMEWORK_CDN 自定义
  // 默认使用 unpkg CDN，配合 @minar-kotonoha/framework 发布版本
  const frameworkCDN = import.meta.env.VITE_FRAMEWORK_CDN
    || `https://unpkg.com/@minar-kotonoha/framework@${import.meta.env.VITE_LIB_VERSION}/dist/framework_v${import.meta.env.VITE_LIB_VERSION}.umd.js`;
  const framework = frameworkCDN;
  useHead({
    style: useSkeleton ? [skeletonStyles] : [hiddenVCloakStyles],
    script: [
      {
        src: framework,
        tagPosition: 'bodyClose',
      },
    ],
    link: [
      {
        rel: 'preload',
        href: framework,
        as: 'script',
      },
    ],
  });
}
</script>

<template>
  <RouterView v-slot="{ Component, route }">
    <Suspense @resolve="onResolve">
      <ClientOnly v-if="(console.log(`路由${route.fullPath}使用预渲染：${!route.meta.clientOnly}`), route.meta.clientOnly)">
        <component :is="Component" />
      </ClientOnly>
      <component :is="Component" v-else />
      <template v-if="isDev" #fallback>
        <!-- 只有在开发环境才会走fallback -->
        <Fallback />
      </template>
    </Suspense>
  </RouterView>
</template>
<style lang="less">
body {
  margin: 0;
}

[v-cloak] > .loading {
  position: fixed;
  top: 50%;
  left: 50%;
  visibility: visible;
  transform: translate(-50%, -50%);
  transition-duration: 0.5s;
  transition-property: opacity;
  opacity: 0;
}

/* 同上：https://unocss.dev/integrations/runtime#preventing-fouc */
[un-cloak] {
  display: none;
}
</style>
