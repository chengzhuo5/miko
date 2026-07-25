import { globalIgnores } from 'eslint/config';
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript';
import pluginVue from 'eslint-plugin-vue';
import pluginVitest from '@vitest/eslint-plugin';
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting';
import pluginOxlint from 'eslint-plugin-oxlint';
import vueMacros from '@vue-macros/eslint-config';

// To allow more languages other than `ts` in `.vue` files, uncomment the following lines:
// import { configureVueProject } from '@vue/eslint-config-typescript'
// configureVueProject({ scriptLangs: ['ts', 'tsx'] })
// More info at https://github.com/vuejs/eslint-config-typescript/#advanced-setup

export default defineConfigWithVueTs(
  vueMacros,
  {
    name: 'app/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
  },

  globalIgnores(['**/dist/**', '**/dist-ssr/**', '**/coverage/**', '**/.vite-ssg-temp/**']),

  ...pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,

  {
    ...pluginVitest.configs.recommended,
    files: ['src/**/__tests__/*'],
  },

  skipFormatting,

  ...pluginOxlint.configs['flat/recommended'],
  {
    rules: {
      'vue/multi-word-component-names': 'off',
      // '@typescript-eslint/no-explicit-any': 'off',
      // '@typescript-eslint/no-unused-vars': 'off',
      // '@typescript-eslint/no-empty-object-type': 'off',
      // 'no-unused-vars': 'off',
      // 'prefer-const': 'off',
      // 'vue/no-dupe-keys': 'off',
      // 'vue/require-default-prop': 'off',
      // 'vue/prop-name-casing': 'off',
      // 'vue/attribute-hyphenation': 'off',
      // 'vue/no-v-html': 'off',
    },
  },
);
