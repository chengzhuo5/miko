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
  const frameworkCDN = import.meta.env.VITE_FRAMEWORK_CDN
    || `https://unpkg.com/@minar-kotonoha/framework@${import.meta.env.VITE_LIB_VERSION}/dist/framework_v${import.meta.env.VITE_LIB_VERSION}.umd.js`;
  const framework = frameworkCDN;
  useHead({
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

// ===== 骨架屏样式（原由 useHead 注入，现移至静态块，绕过 SSR 时 unhead 不产出问题） =====
// 参考 styles/skeleton.less 和 styles/hiddenVCloak.less
[v-cloak],
.skeleton {
  pointer-events: none !important;

  // 光柱特效
  &::before {
    content: '';
    position: fixed;
    width: 25vw;
    height: 100%;
    top: 0;
    left: 0;
    transform: translateX(-25vw);
    overflow: hidden;
    background-image: linear-gradient(
      to left,
      rgba(255, 255, 255, 0) 0,
      rgba(255, 255, 255, 1) 50%,
      rgba(255, 255, 255, 0) 100%
    );
    animation: miko-skeleton-shimmer 1.25s linear infinite;
    z-index: 1000;
  }

  @keyframes miko-skeleton-shimmer {
    0% {
      transform: translateX(-25vw);
    }
    100% {
      transform: translateX(100vw);
    }
  }

  * {
    white-space: nowrap !important;
    border-color: transparent !important;
    color: transparent !important;
    &::first-line {
      background-color: #e8e6e850;
    }
    &::placeholder {
      color: transparent !important;
    }
  }
  i,
  img {
    visibility: hidden !important;
  }
}

// 隐藏 v-cloak 闪烁（useSkeleton=false 时备选，与骨架屏互斥）
[v-cloak].no-skeleton {
  opacity: 0;
}
</style>
