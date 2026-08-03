// 此处不用tsdown打包的原因是tsdown对import.meta.glob的兼容性不佳
import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    target: ['chrome49', 'safari10'],
    lib: {
      entry: {
        framework: './index.ts',
      },
      formats: ['umd'],
      name: 'framework',
      fileName: (format) => {
        const baseName = 'framework';
        switch (format) {
          case 'es':
          case 'esm':
            return `${baseName}.mjs`;
          case 'commonjs':
          case 'cjs':
            return `${baseName}.cjs`;
          case 'iife':
            return `${baseName}.js`;
          default:
            return `${baseName}.${format}.js`;
        }
      },
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  preview: {
    port: 8080,
  },
});
