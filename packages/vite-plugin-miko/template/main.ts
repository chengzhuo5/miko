import App from './App.vue';

// 多语言会让包体积增加100K，默认关闭
// import { createI18n } from 'vue-i18n';
// import messages from '@intlify/unplugin-vue-i18n/messages';

import { ViteSSG } from '@minar-kotonoha/vite-ssg';

import { setupLayouts } from 'virtual:generated-layouts';
import { routes, handleHotUpdate } from 'vue-router/auto-routes';

import { bootstrap } from 'virtual:bootstrap';
import { setupMikoRuntime, markMikoReady } from 'virtual:miko-runtime';

import 'virtual:uno.css';

export const createApp = ViteSSG(
  // the root component
  App,
  // vue-router options
  { routes: setupLayouts(routes), base: import.meta.env.BASE_URL },
  // function to have custom setups
  async ({ app, router, initialState, onSSRAppRendered }) => {
    // const i18n = createI18n({
    //   locale: 'zh-CN',
    //   messages,
    // });
    // app.use(i18n);

    if (import.meta.hot) {
      handleHotUpdate(router);
    }

    setupMikoRuntime(app, initialState, onSSRAppRendered);
    // 首次路由导航完成后标记白屏监控 ready（mixin 兜底幂等，二者先到先得）
    router
      .isReady()
      .then(() => markMikoReady())
      .catch(() => {});
    await bootstrap(app, router, initialState);
  },
  {
    hydration: import.meta.env.PROD,
  },
);
