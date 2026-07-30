<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useHead, injectHead } from '@minar-kotonoha/framework/modules/@unhead/vue.ts';
import skeletonStyles from './styles/skeleton.less?inline';
import hiddenVCloakStyles from './styles/hiddenVCloak.less?inline';
import Fallback from './components/Fallback.vue';

const route = useRoute();

const onResolve = () => {
  if (!import.meta.env.SSR) {
    document.getElementById('app')!.removeAttribute('v-cloak');
  }
};
const useSkeleton = route.meta.useSkeleton ?? true;
const isSpaMode = import.meta.env.VITE_MIKO_SPA === 'true';
const isDev = import.meta.env.DEV;
// 仅对标记 clientOnly 的路由，或 SPA 模式下，整体走 <ClientOnly>
const useClientOnly = computed(() => isSpaMode || route.meta.clientOnly === true);

// 此处在预渲染时完成，故加个判断，客户端代码会剔除这块，减小包体积
if (import.meta.env.SSR) {
  // unhead v3.x createHead() 未设 head.ssr=true，useHead 会走 clientUseHead
  // (watchEffect) 路径导致 SSR 条目静默丢失。此处手动补设 ssr 标记。
  // 通过 injectHead() 拿到 vite-ssg 创建的 head 实例，仅当 ssr 未设时补 true。
  // 未来 unhead 修复后 head.ssr 已为 true，此段自动变为 no-op。
  try {
    const h: { ssr?: boolean } | undefined = injectHead();
    if (h && !h.ssr) h.ssr = true;
  } catch {}

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
      <ClientOnly v-if="useClientOnly">
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
