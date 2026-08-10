import { describe, expect, it } from 'vitest';
import { createMikoEntryTags, createMikoMonitorTags } from './html';

const shell = '<!doctype html><html><body><div id="app"></div></body></html>';

describe('createMikoEntryTags', () => {
  it('injects the Miko entry into a valid HTML shell', () => {
    expect(createMikoEntryTags(shell)).toEqual([
      {
        tag: 'script',
        attrs: {
          type: 'module',
          'data-miko-entry': '',
          src: 'virtual:index',
        },
        injectTo: 'body',
      },
    ]);
  });

  it('does not inject a second Miko entry', () => {
    expect(
      createMikoEntryTags(
        '<html><body><div id="app"></div><script type="module" data-miko-entry>import "virtual:index"</script></body></html>',
      ),
    ).toEqual([]);

    expect(
      createMikoEntryTags(
        '<html><body><div id="app"></div><script type="module">import "virtual:index"</script></body></html>',
      ),
    ).toEqual([]);

    expect(
      createMikoEntryTags(
        '<html><body><div id="app"></div><script type="module" src="virtual:index"></script></body></html>',
      ),
    ).toEqual([]);
  });

  it('does not treat classic scripts as the Miko module entry', () => {
    const classicScripts = [
      '<script data-miko-entry></script>',
      '<script src="virtual:index"></script>',
      '<script>import "virtual:index"</script>',
    ];

    for (const script of classicScripts) {
      expect(
        createMikoEntryTags(`<html><body><div id="app"></div>${script}</body></html>`),
      ).toHaveLength(1);
    }
  });

  it('detects only static imports from inline module code', () => {
    expect(
      createMikoEntryTags(
        '<html><body><div id="app"></div><script type="module">const ready = true; /* entry */ import\'virtual:index\'; console.log(ready)</script></body></html>',
      ),
    ).toEqual([]);
    expect(
      createMikoEntryTags(
        '<html><body><div id="app"></div><script type="module">export * from "virtual:index";</script></body></html>',
      ),
    ).toEqual([]);

    const nonEntries = [
      'console.log("virtual:index")',
      'void import("virtual:index")',
      'import "docs/virtual:index-example.js"',
    ];
    for (const code of nonEntries) {
      expect(
        createMikoEntryTags(
          `<html><body><div id="app"></div><script type="module">${code}</script></body></html>`,
        ),
      ).toHaveLength(1);
    }
  });

  it('requires exactly one app mount node', () => {
    expect(() => createMikoEntryTags('<html><body></body></html>')).toThrow(
      /唯一的 #app.*当前找到 0 个/,
    );
    expect(() =>
      createMikoEntryTags('<html><body><div id="app"></div><main id=app></main></body></html>'),
    ).toThrow(/唯一的 #app.*当前找到 2 个/);
  });

  it('counts only exact id attributes on real start tags', () => {
    expect(() =>
      createMikoEntryTags(
        '<html><body><div data-id=app></div><!-- <main id=app></main> --></body></html>',
      ),
    ).toThrow(/唯一的 #app.*当前找到 0 个/);
    expect(() => createMikoEntryTags('<html><body><3 id=app></3></body></html>')).toThrow(
      /唯一的 #app.*当前找到 0 个/,
    );

    expect(
      createMikoEntryTags(
        '<!doctype html><!-- <div id=app></div> --><html><body><script>const shell = "<main id=app>"</script><div id=app></div></body></html>',
      ),
    ).toHaveLength(1);
  });

  it('handles greater-than characters inside quoted attributes', () => {
    expect(
      createMikoEntryTags('<html><body><div title="1 > 0" id="app"></div></body></html>'),
    ).toHaveLength(1);
  });

  it('ignores app roots inside raw and inert HTML elements', () => {
    const nestedRoots =
      '<html><body><iframe><div id=app></div></iframe><xmp><main id=app></main></xmp><template><section id=app></section></template></body></html>';

    expect(() => createMikoEntryTags(nestedRoots)).toThrow(/唯一的 #app.*当前找到 0 个/);
    expect(
      createMikoEntryTags(nestedRoots.replace('</body>', '<div id=app></div></body>')),
    ).toHaveLength(1);
  });

  it('deduplicates only for real Miko script elements', () => {
    expect(
      createMikoEntryTags(
        '<html><head><meta content="virtual:index"><!-- <script data-miko-entry>import "virtual:index"</script> --></head><body><div data-miko-entry></div><div id="app"></div></body></html>',
      ),
    ).toHaveLength(1);

    expect(
      createMikoEntryTags(
        '<html><body><div id="app"></div><script>console.log("virtual:index")</script><script src="docs/virtual:index-example.js"></script><script src="/virtual:index"></script></body></html>',
      ),
    ).toHaveLength(1);
  });
});

describe('createMikoMonitorTags', () => {
  it('injects one monitor before the application entry', () => {
    expect(createMikoMonitorTags(shell)).toEqual([
      {
        tag: 'script',
        attrs: {
          defer: '',
          'data-miko-monitor': '',
          src: '/@miko/white-screen.js',
          'vite-ignore': '',
        },
        injectTo: 'head-prepend',
      },
    ]);
  });

  it('does not inject a second user-owned monitor', () => {
    expect(
      createMikoMonitorTags(
        '<html><head><script type="module" data-miko-monitor src="/custom-monitor.js"></script></head><body><div id="app"></div></body></html>',
      ),
    ).toEqual([]);
  });
});
