import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BuildFixtureName } from './types';

export type FixtureName = BuildFixtureName;

export interface GeneratedFixture {
  name: FixtureName;
  root: string;
  routeCount: number;
  componentCount: number;
  deepRoute: string;
  unvisitedRoute: string;
}

interface FixtureSize {
  routes: number;
  components: number;
  layouts: number;
}

const FIXTURE_SIZES: Record<Exclude<FixtureName, 'runtime'>, FixtureSize> = {
  small: { routes: 3, components: 20, layouts: 1 },
  medium: { routes: 50, components: 200, layouts: 3 },
  large: { routes: 500, components: 1000, layouts: 5 },
};
const workspaceNodeModules = fileURLToPath(new URL('../../node_modules', import.meta.url));

function padded(index: number, width: number): string {
  return String(index).padStart(width, '0');
}

async function writeBatches(
  entries: Array<{ path: string; content: string }>,
  batchSize = 64,
): Promise<void> {
  for (let index = 0; index < entries.length; index += batchSize) {
    await Promise.all(
      entries
        .slice(index, index + batchSize)
        .map(entry => writeFile(entry.path, entry.content, 'utf8')),
    );
  }
}

async function writeCommonFiles(
  root: string,
  dependencies: Record<string, string>,
): Promise<void> {
  await writeBatches([
    {
      path: join(root, 'package.json'),
      content: `${JSON.stringify(
        {
          name: 'miko-performance-fixture',
          private: true,
          type: 'module',
          scripts: {
            build: 'miko build',
          },
          dependencies,
        },
        null,
        2,
      )}\n`,
    },
    {
      path: join(root, 'index.ts'),
      content: 'export default function bootstrap() {}\n',
    },
    {
      path: join(root, 'miko.config.ts'),
      content: [
        'export default {',
        '  vite: {',
        '    logLevel: "silent",',
        '    publicDir: false,',
        '  },',
        '}',
        '',
      ].join('\n'),
    },
  ]);
}

async function generateSizedFixture(
  root: string,
  name: Exclude<FixtureName, 'runtime'>,
): Promise<GeneratedFixture> {
  const size = FIXTURE_SIZES[name];
  const pages = join(root, 'pages');
  const components = join(root, 'components');
  const layouts = join(root, 'layouts');
  await Promise.all([
    mkdir(pages, { recursive: true }),
    mkdir(components, { recursive: true }),
    mkdir(layouts, { recursive: true }),
  ]);
  await writeCommonFiles(root, {});

  const entries: Array<{ path: string; content: string }> = [
    {
      path: join(pages, 'index.vue'),
      content: [
        '<template>',
        '  <main id="performance-home">',
        `    <h1>${name} home</h1>`,
        '    <PerfComponent0001 />',
        '  </main>',
        '</template>',
        '',
      ].join('\n'),
    },
  ];

  for (let index = 1; index < size.routes; index++) {
    const route = `route-${padded(index, 4)}`;
    entries.push({
      path: join(pages, `${route}.vue`),
      content: [
        '<template>',
        `  <main id="${route}">`,
        `    <h1>${name} ${route}</h1>`,
        '    <PerfComponent0001 />',
        '  </main>',
        '</template>',
        '',
      ].join('\n'),
    });
  }

  for (let index = 1; index <= size.components; index++) {
    const component = `PerfComponent${padded(index, 4)}`;
    entries.push({
      path: join(components, `${component}.vue`),
      content: [
        '<template>',
        `  <span data-performance-component="${component}">${component}</span>`,
        '</template>',
        '',
      ].join('\n'),
    });
  }

  for (let index = 1; index <= size.layouts; index++) {
    const layout = `layout-${padded(index, 2)}`;
    entries.push({
      path: join(layouts, `${layout}.vue`),
      content: [
        '<template>',
        `  <section data-performance-layout="${layout}">`,
        '    <RouterView />',
        '  </section>',
        '</template>',
        '',
      ].join('\n'),
    });
  }

  await writeBatches(entries);
  return {
    name,
    root,
    routeCount: size.routes,
    componentCount: size.components,
    deepRoute: `/route-${padded(size.routes - 1, 4)}`,
    unvisitedRoute: '/route-0001',
  };
}

async function generateRuntimeFixture(root: string): Promise<GeneratedFixture> {
  const pages = join(root, 'pages');
  const components = join(root, 'components');
  const stores = join(root, 'stores');
  const layouts = join(root, 'layouts');
  await Promise.all([
    mkdir(join(pages, 'deep'), { recursive: true }),
    mkdir(components, { recursive: true }),
    mkdir(stores, { recursive: true }),
    mkdir(layouts, { recursive: true }),
  ]);
  await writeCommonFiles(root, {
    '@unhead/vue': '^3.2.1',
    pinia: '^4.0.2',
    vue: '^3.5.40',
    'vue-router': '^5.2.0',
  });

  await writeBatches([
    {
      path: join(stores, 'runtime.ts'),
      content: [
        "import { defineStore } from 'pinia'",
        '',
        "export const useRuntimeStore = defineStore('runtime', {",
        '  state: () => ({ count: 1 }),',
        '})',
        '',
      ].join('\n'),
    },
    {
      path: join(components, 'SharedAsync.vue'),
      content: [
        '<template>',
        '  <p id="shared-async-marker">SHARED_ASYNC_MARKER</p>',
        '</template>',
        '',
      ].join('\n'),
    },
    {
      path: join(layouts, 'performance.vue'),
      content: [
        '<template>',
        '  <section id="runtime-layout"><RouterView /></section>',
        '</template>',
        '',
      ].join('\n'),
    },
    {
      path: join(pages, 'index.vue'),
      content: [
        '<script setup lang="ts">',
        "import { useHead } from '@unhead/vue'",
        "import { defineAsyncComponent } from 'vue'",
        "import { useRuntimeStore } from '../stores/runtime'",
        '',
        "const SharedAsync = defineAsyncComponent(() => import('../components/SharedAsync.vue'))",
        'const store = useRuntimeStore()',
        "useHead({ title: 'Miko Runtime Performance', meta: [{ name: 'description', content: 'runtime fixture' }] })",
        '</script>',
        '',
        '<template>',
        '  <main id="runtime-home">',
        '    <h1 id="home-lcp-marker">MIKO_RUNTIME_HOME</h1>',
        '    <p id="runtime-store-count">{{ store.count }}</p>',
        '    <RouterLink id="deep-route-link" to="/deep/nested">Deep route</RouterLink>',
        '    <SharedAsync />',
        '  </main>',
        '</template>',
        '',
      ].join('\n'),
    },
    {
      path: join(pages, 'deep', 'nested.vue'),
      content: [
        '<script setup lang="ts">',
        "import { defineAsyncComponent } from 'vue'",
        "const SharedAsync = defineAsyncComponent(() => import('../../components/SharedAsync.vue'))",
        '</script>',
        '',
        '<template>',
        '  <main id="deep-route-marker">',
        '    <h1>DEEP_ROUTE_MARKER</h1>',
        '    <SharedAsync />',
        '  </main>',
        '</template>',
        '',
      ].join('\n'),
    },
    {
      path: join(pages, 'client-only.vue'),
      content: [
        '<template>',
        '  <main id="client-only-marker">CLIENT_ONLY_MARKER</main>',
        '</template>',
        '',
        '<route lang="yaml">',
        'meta:',
        '  clientOnly: true',
        '</route>',
        '',
      ].join('\n'),
    },
    {
      path: join(pages, 'unvisited.vue'),
      content: [
        '<template>',
        '  <main id="unvisited-route-marker">UNVISITED_ROUTE_MARKER</main>',
        '</template>',
        '',
      ].join('\n'),
    },
  ]);

  return {
    name: 'runtime',
    root,
    routeCount: 4,
    componentCount: 1,
    deepRoute: '/deep/nested',
    unvisitedRoute: '/unvisited',
  };
}

export async function generateFixture(
  parent: string,
  name: FixtureName,
): Promise<GeneratedFixture> {
  const root = resolve(parent, name);
  await mkdir(root, { recursive: true });
  await symlink(
    workspaceNodeModules,
    join(root, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );

  return name === 'runtime'
    ? generateRuntimeFixture(root)
    : generateSizedFixture(root, name);
}
