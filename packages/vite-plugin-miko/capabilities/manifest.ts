import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, parse, resolve } from 'node:path';
import browserslist from 'browserslist';
import type { ProjectConventions, ProjectSignals } from './types';

interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const UNO_CONFIG_FILES = ['uno.config.ts', 'uno.config.mts', 'uno.config.js', 'uno.config.mjs'];
const LINT_CONFIG_FILES = [
  'eslint.config.ts',
  'eslint.config.mts',
  'eslint.config.js',
  'eslint.config.mjs',
  'oxlint.config.ts',
  'oxlint.config.js',
  '.oxlintrc.json',
];
const BROWSERSLIST_CONFIG_FILES = ['.browserslistrc', 'browserslist'];

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function findFirstFile(root: string, candidates: string[]): string | null {
  for (const candidate of candidates) {
    const path = resolve(root, candidate);
    if (existsSync(path)) return path;
  }
  return null;
}

function findNearestPackageJson(root: string): string | null {
  let directory = root;
  const filesystemRoot = parse(directory).root;

  while (true) {
    const packageJson = join(directory, 'package.json');
    if (existsSync(packageJson)) return resolve(packageJson);
    if (directory === filesystemRoot) return null;
    directory = dirname(directory);
  }
}

async function readManifest(path: string | null): Promise<PackageManifest> {
  if (!path) return {};
  return JSON.parse(await readFile(path, 'utf8')) as PackageManifest;
}

function collectDependencies(manifest: PackageManifest): string[] {
  return [
    ...new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ]),
  ].sort();
}

function inspectConventions(root: string): ProjectConventions {
  const components = resolve(root, 'components');
  const layouts = resolve(root, 'layouts');
  const schemas = resolve(root, 'schemas');

  return {
    components: isDirectory(components),
    layouts: isDirectory(layouts),
    unoConfig: findFirstFile(root, UNO_CONFIG_FILES),
    janusSchemas: isDirectory(schemas) ? schemas : null,
    lintConfig: findFirstFile(root, LINT_CONFIG_FILES),
  };
}

export async function inspectProject(root: string, mode: string): Promise<ProjectSignals> {
  const resolvedRoot = resolve(root);
  const packageJsonPath = findNearestPackageJson(resolvedRoot);
  const manifest = await readManifest(packageJsonPath);
  const conventions = inspectConventions(resolvedRoot);
  const browserslistConfigFile = browserslist.findConfigFile(resolvedRoot);
  const targets = browserslistConfigFile
    ? (browserslist.loadConfig({ config: browserslistConfigFile, env: mode }) ?? [])
    : [];

  const watchedFiles = [
    packageJsonPath,
    resolve(resolvedRoot, 'miko.config.ts'),
    ...BROWSERSLIST_CONFIG_FILES.map((file) => resolve(resolvedRoot, file)),
    ...UNO_CONFIG_FILES.map((file) => resolve(resolvedRoot, file)),
    ...LINT_CONFIG_FILES.map((file) => resolve(resolvedRoot, file)),
    browserslistConfigFile ? resolve(browserslistConfigFile) : null,
  ].filter((path): path is string => path !== null);

  return {
    root: resolvedRoot,
    packageJsonPath,
    dependencies: collectDependencies(manifest),
    browserslist: [...targets],
    browserslistConfigFile: browserslistConfigFile ? resolve(browserslistConfigFile) : null,
    conventions,
    watchedFiles: [...new Set(watchedFiles)].sort(),
    watchedDirectories: [
      resolve(resolvedRoot, 'components'),
      resolve(resolvedRoot, 'layouts'),
      resolve(resolvedRoot, 'schemas'),
    ].sort(),
  };
}
