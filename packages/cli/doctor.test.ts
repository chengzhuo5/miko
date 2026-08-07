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
    expect(output).toContain('Plugin order:');
    expect(output).toContain('Warnings:');
  });
});
