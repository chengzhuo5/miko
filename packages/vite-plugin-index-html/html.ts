import { initSync, parse as parseModule } from 'es-module-lexer';
import { parse as parseHtml } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import type { HtmlTagDescriptor } from 'vite';

type HtmlNode = DefaultTreeAdapterMap['node'];
type HtmlElement = DefaultTreeAdapterMap['element'];
type SourceRange = { startOffset: number; endOffset: number };

initSync();

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

function getText(element: HtmlElement): string {
  return element.childNodes
    .filter((node) => node.nodeName === '#text')
    .map((node) => ('value' in node ? node.value : ''))
    .join('');
}

function hasStaticMikoImport(code: string): boolean {
  try {
    const [imports] = parseModule(code);
    return imports.some((specifier) => specifier.d === -1 && specifier.n === 'virtual:index');
  } catch {
    return false;
  }
}

function replaceAttributeValue(html: string, range: SourceRange, replacement: string): string {
  const attribute = html.slice(range.startOffset, range.endOffset);
  const equals = attribute.indexOf('=');
  if (equals === -1) return html;

  let valueStart = equals + 1;
  while (/\s/u.test(attribute[valueStart] ?? '')) valueStart += 1;

  let valueEnd = attribute.length;
  const quote = attribute[valueStart];
  if (quote === '"' || quote === "'") {
    valueStart += 1;
    valueEnd = attribute.lastIndexOf(quote);
    if (valueEnd < valueStart) return html;
  }

  const startOffset = range.startOffset + valueStart;
  const endOffset = range.startOffset + valueEnd;
  return `${html.slice(0, startOffset)}${replacement}${html.slice(endOffset)}`;
}

export function rewriteMikoEntrySource(html: string, entrySource: string): string {
  if (entrySource === 'virtual:index' || !html.includes('virtual:index')) return html;

  const elements: HtmlElement[] = [];
  collectElements(parseHtml(html, { sourceCodeLocationInfo: true }), elements);
  const ranges = elements
    .filter(
      (element) =>
        element.tagName === 'script' &&
        getAttribute(element, 'type') === 'module' &&
        getAttribute(element, 'src') === 'virtual:index',
    )
    .flatMap((element) => {
      const range = element.sourceCodeLocation?.attrs?.src;
      return range ? [range] : [];
    })
    .sort((left, right) => right.startOffset - left.startOffset);

  return ranges.reduce(
    (transformed, range) => replaceAttributeValue(transformed, range, entrySource),
    html,
  );
}

export function createMikoEntryTags(
  html: string,
  entrySource = 'virtual:index',
): HtmlTagDescriptor[] {
  const elements: HtmlElement[] = [];
  collectElements(parseHtml(html), elements);

  const appRoots = elements.filter((element) => getAttribute(element, 'id') === 'app').length;
  if (appRoots !== 1) {
    throw new Error(`[miko] index.html 必须包含唯一的 #app 挂载节点，当前找到 ${appRoots} 个`);
  }

  const hasMikoEntry = elements.some(
    (element) =>
      element.tagName === 'script' &&
      getAttribute(element, 'type') === 'module' &&
      (hasAttribute(element, 'data-miko-entry') ||
        getAttribute(element, 'src') === entrySource ||
        getAttribute(element, 'src') === 'virtual:index' ||
        hasStaticMikoImport(getText(element))),
  );
  if (hasMikoEntry) return [];

  return [
    {
      tag: 'script',
      attrs: {
        type: 'module',
        'data-miko-entry': '',
        src: entrySource,
      },
      injectTo: 'body',
    },
  ];
}
