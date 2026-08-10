import { describe, expect, it } from 'vitest';
import type { ResolvedMikoConfig } from '@minar-kotonoha/vite-plugin-miko';
import type { PluginAssembly } from '@minar-kotonoha/vite-plugin-miko';
import { createDoctorReport, renderDoctorText } from './doctor';

function project(): ResolvedMikoConfig {
  return {
    viteRoot: 'D:/project',
    configFile: null,
    miko: { rendering: 'ssg' },
    capabilities: {
      legacy: {
        enabled: false,
        value: {},
        source: 'default',
        reason: '默认使用现代构建',
      },
      whiteScreen: {
        enabled: true,
        value: { timeout: 8000 },
        source: 'builtin',
        reason: '默认启用首次渲染白屏保护',
      },
    },
  } as ResolvedMikoConfig;
}

function assembly(): PluginAssembly {
  return {
    order: ['miko:vue', 'miko:runtime'],
    plugins: [],
    protectedPluginNames: [],
  };
}

describe('Miko Doctor', () => {
  it('creates a stable serializable report', () => {
    const report = createDoctorReport(project(), assembly());

    expect(JSON.parse(JSON.stringify(report))).toMatchObject({
      root: 'D:/project',
      configFile: null,
      rendering: 'ssg',
      capabilities: {
        legacy: {
          enabled: false,
          source: 'default',
          reason: '默认使用现代构建',
        },
        whiteScreen: {
          enabled: true,
          source: 'builtin',
          reason: '默认启用首次渲染白屏保护',
          value: 8000,
        },
      },
      plugins: ['miko:vue', 'miko:runtime'],
      warnings: [],
    });
  });

  it('renders the required text sections', () => {
    const output = renderDoctorText(createDoctorReport(project(), assembly()));

    expect(output).toContain('Miko Doctor');
    expect(output).toContain('Root: D:/project');
    expect(output).toContain('Config: (zero-config)');
    expect(output).toContain('Rendering: ssg');
    expect(output).toContain('Capabilities:');
    expect(output).toContain('legacy: disabled [default]');
    expect(output).toContain('whiteScreen: enabled [builtin] = 8000');
    expect(output).toContain('Plugin order:');
    expect(output).toContain('Warnings:');
  });
});
