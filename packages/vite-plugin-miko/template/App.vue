<script setup lang="ts">
import { useRoute } from 'vue-router';
import { useHead, injectHead } from '@minar-kotonoha/framework/modules/@unhead/vue.ts';
import skeletonStyles from './styles/skeleton.less?inline';
import hiddenVCloakStyles from './styles/hiddenVCloak.less?inline';
import Fallback from './components/Fallback.vue';

const appRoute = useRoute();

const onResolve = () => {
  if (!import.meta.env.SSR) {
    document.getElementById('app')!.removeAttribute('v-cloak');
  }
};
const useSkeleton = appRoute.meta.useSkeleton ?? true;
const isDev = import.meta.env.DEV;

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

  // 只有显式配置 Framework CDN 时才注入外部脚本；默认使用应用内正常打包。
  const frameworkCDN = import.meta.env.VITE_FRAMEWORK_CDN;
  useHead({
    style: useSkeleton ? [skeletonStyles] : [hiddenVCloakStyles],
    ...(frameworkCDN
      ? {
          script: [
            {
              src: frameworkCDN,
              tagPosition: 'bodyClose' as const,
            },
          ],
          link: [
            {
              rel: 'preload',
              href: frameworkCDN,
              as: 'script',
            },
          ],
        }
      : {}),
  });
}
</script>

<template>
  <RouterView v-slot="{ Component, route }">
    <Suspense @resolve="onResolve">
      <ClientOnly v-if="route.meta.clientOnly === true">
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
