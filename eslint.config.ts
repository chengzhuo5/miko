import { globalIgnores } from 'eslint/config';
import config from '@minar-kotonoha/linter/eslint.config';
export default [
  ...config,
  globalIgnores(['app/**', "packages/linter/**"])
]
