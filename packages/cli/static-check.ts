import { access, readFile, readdir, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { parse as parseHtml } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { MikoCliError } from './errors';

type HtmlNode = DefaultTreeAdapterMap['node'];
type HtmlElement = DefaultTreeAdapterMap['element'];

export interface StaticCheckIssue {
  code: string;
  file: string;
  message: string;
}

export interface StaticCheckResult {
  routes: string[];
  issues: StaticCheckIssue[];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function collectElements(node: HtmlNode, elements: HtmlElement[]): void {
  if ('tagName' in node) {
    elements.push(node);
    if (node.tagName === 'template') return;
  }
  if ('childNodes' in node) {
    for (const child of node.childNodes) collectElements(child, elements);
  }
}

function getAttribute(element: HtmlElement, name: string): string | undefined {
  return element.attrs.find((attribute) => attribute.name === name)?.value;
}

function hasAttribute(element: HtmlElement, name: string): boolean {
  return element.attrs.some((attribute) => attribute.name === name);
}

function relativeFile(root: string, file: string): string {
  return relative(root, file).split(sep).join('/');
}

function routeFor(file: string): string {
  if (file === 'index.html') return '/';
  if (file.endsWith('/index.html')) return `/${file.slice(0, -'index.html'.length)}`;
  return `/${file.slice(0, -'.html'.length)}`;
}

async function collectHtmlFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === '.miko' || entry.isSymbolicLink()) continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && entry.name.endsWith('.html')) {
        files.push(path);
      }
    }
  }

  await visit(root);
  return files.sort(compareText);
}

function criticalReferences(elements: HtmlElement[]): string[] {
  const references: string[] = [];
  for (const element of elements) {
    if (element.tagName === 'script') {
      const src = getAttribute(element, 'src');
      if (src) references.push(src);
      continue;
    }
    if (element.tagName !== 'link') continue;
    const rel = new Set((getAttribute(element, 'rel') ?? '').toLowerCase().split(/\s+/u));
    const as = (getAttribute(element, 'as') ?? '').toLowerCase();
    if (
      rel.has('stylesheet') ||
      rel.has('modulepreload') ||
      (rel.has('preload') && (as === 'script' || as === 'style'))
    ) {
      const href = getAttribute(element, 'href');
      if (href) references.push(href);
    }
  }
  return references;
}

function basePathname(base: string): string {
  try {
    return new URL(base).pathname;
  } catch {
    if (!base.startsWith('/')) return '/';
    return base.endsWith('/') ? base : `${base}/`;
  }
}

function resolveLocalReference(
  root: string,
  htmlFile: string,
  reference: string,
  base: string,
): { path?: string; baseMismatch?: boolean } {
  const source = reference.split(/[?#]/u, 1)[0] ?? '';
  if (
    !source ||
    source.startsWith('#') ||
    source.startsWith('//') ||
    /^[a-z][a-z\d+.-]*:/iu.test(source)
  ) {
    return {};
  }

  let path: string;
  if (source.startsWith('/')) {
    const prefix = basePathname(base);
    if (prefix !== '/' && !source.startsWith(prefix)) return { baseMismatch: true };
    path = resolve(root, source.slice(prefix === '/' ? 1 : prefix.length));
  } else {
    path = resolve(dirname(htmlFile), decodeURIComponent(source));
  }

  const fromRoot = relative(root, path);
  if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) return { baseMismatch: true };
  return { path };
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function issue(code: string, file: string, message: string): StaticCheckIssue {
  return { code, file, message };
}

export async function checkStaticOutput(outDir: string, base: string): Promise<StaticCheckResult> {
  const root = resolve(outDir);
  try {
    await access(root);
  } catch {
    return {
      routes: [],
      issues: [issue('MIKO_STATIC_OUTPUT_MISSING', root, `构建输出目录不存在：${root}`)],
    };
  }

  const htmlFiles = await collectHtmlFiles(root);
  if (htmlFiles.length === 0) {
    return {
      routes: [],
      issues: [issue('MIKO_STATIC_NO_HTML', root, '构建输出中没有 HTML 路由')],
    };
  }

  const issues: StaticCheckIssue[] = [];
  const routes: string[] = [];
  for (const htmlFile of htmlFiles) {
    const file = relativeFile(root, htmlFile);
    routes.push(routeFor(file));
    const source = await readFile(htmlFile, 'utf8');
    if (source.trim().length === 0) {
      issues.push(issue('MIKO_STATIC_EMPTY_HTML', file, 'HTML 产物为空'));
      continue;
    }

    const elements: HtmlElement[] = [];
    collectElements(parseHtml(source), elements);
    const appRoots = elements.filter((element) => getAttribute(element, 'id') === 'app');
    if (appRoots.length !== 1) {
      issues.push(
        issue(
          'MIKO_STATIC_APP_ROOT',
          file,
          `HTML 必须包含唯一的 #app，当前找到 ${appRoots.length} 个`,
        ),
      );
    }

    const hasMonitor = elements.some(
      (element) =>
        element.tagName === 'script' &&
        (hasAttribute(element, 'data-miko-monitor') ||
          /(?:^|\/)miko-white-screen-[^/]+\.js$/u.test(getAttribute(element, 'src') ?? '')),
    );
    if (appRoots.some((rootElement) => hasAttribute(rootElement, 'v-cloak')) && !hasMonitor) {
      issues.push(
        issue(
          'MIKO_STATIC_BOOT_PROTOCOL',
          file,
          'HTML 保留了 v-cloak，但没有白屏监控资源负责解除启动遮罩',
        ),
      );
    }

    if (elements.some((element) => element.tagName === 'vite-error-overlay')) {
      issues.push(issue('MIKO_STATIC_ERROR_HTML', file, 'HTML 包含 Vite 错误 Overlay'));
    }

    for (const reference of criticalReferences(elements)) {
      const resolved = resolveLocalReference(root, htmlFile, reference, base);
      if (resolved.baseMismatch) {
        issues.push(
          issue(
            'MIKO_STATIC_BASE_MISMATCH',
            file,
            `资源 ${reference} 不在配置的 base ${base} 下`,
          ),
        );
      } else if (resolved.path && !(await isFile(resolved.path))) {
        issues.push(
          issue(
            'MIKO_STATIC_ASSET_MISSING',
            file,
            `资源 ${reference} 对应的文件不存在`,
          ),
        );
      }
    }
  }

  routes.sort(compareText);
  return { routes, issues };
}

export async function assertStaticOutput(outDir: string, base: string): Promise<void> {
  const result = await checkStaticOutput(outDir, base);
  if (result.issues.length === 0) return;

  const summary = result.issues
    .map((entry) => `${entry.file}: [${entry.code}] ${entry.message}`)
    .join('\n');
  throw new MikoCliError(
    'MIKO_BUILD_STATIC_CHECK',
    `构建产物静态检查失败（${result.issues.length} 项）\n${summary}`,
    5,
  );
}
