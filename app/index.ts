import type { App } from 'vue';
import type { Router } from 'vue-router';
import { createPinia } from 'pinia';

export default (app: App<Element>, _router: Router) => {
  app.use(createPinia());

  // ===== Janus 前端接口可观测·缓存·契约校验（可选） =====
  // 启用方式：
  //   1. bun link @janus/core @janus/unplugin
  //   2. 取消下面注释（miko 插件会自动发现并启用 Janus）
  //   3. 创建 schemas/ 目录放 JSON Schema 文件
  //
  // import { createJanus } from '@janus/core'
  // app.use(createJanus({
  //   // 零配置即可运行（默认拦截全部 + console.log 上报）
  //   // 高级配置见 @janus/core README
  // }))

  console.log('当前APP', import.meta.env.VITE_APP_NAME);
};
