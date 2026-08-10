import {
  assembleMikoPlugins,
  resolveMikoProject,
  type PluginAssembly,
  type ResolvedMikoConfig,
} from '@minar-kotonoha/vite-plugin-miko';
import type { CommandContext } from './context';

export interface DoctorCapabilityReport {
  enabled: boolean;
  source: string;
  reason: string;
  value?: boolean | number | string | null;
}

export interface DoctorReport {
  root: string;
  configFile: string | null;
  rendering: 'ssg' | 'spa';
  capabilities: Record<string, DoctorCapabilityReport>;
  plugins: string[];
  warnings: string[];
}

export function createDoctorReport(
  project: ResolvedMikoConfig,
  assembly: PluginAssembly,
): DoctorReport {
  const capabilities = Object.fromEntries(
    Object.entries(project.capabilities)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, capability]) => {
        let value =
          capability.value === null ||
          ['boolean', 'number', 'string'].includes(typeof capability.value)
            ? (capability.value as boolean | number | string | null)
            : undefined;
        if (
          value === undefined &&
          name === 'whiteScreen' &&
          typeof capability.value === 'object' &&
          capability.value !== null &&
          'timeout' in capability.value &&
          typeof capability.value.timeout === 'number'
        ) {
          value = capability.value.timeout;
        }
        return [
          name,
          {
          enabled: capability.enabled,
          source: capability.source,
          reason: capability.reason,
            ...(value === undefined ? {} : { value }),
          },
        ];
      }),
  );

  return {
    root: project.viteRoot,
    configFile: project.configFile,
    rendering: project.miko.rendering,
    capabilities,
    plugins: [...assembly.order],
    warnings: [],
  };
}

export function renderDoctorText(report: DoctorReport): string {
  const lines = [
    'Miko Doctor',
    `Root: ${report.root}`,
    `Config: ${report.configFile ?? '(zero-config)'}`,
    `Rendering: ${report.rendering}`,
    'Capabilities:',
  ];

  for (const [name, capability] of Object.entries(report.capabilities)) {
    const state = capability.enabled ? 'enabled' : 'disabled';
    const value = capability.value === undefined ? '' : ` = ${String(capability.value)}`;
    lines.push(`  ${name}: ${state} [${capability.source}]${value} — ${capability.reason}`);
  }

  lines.push('Plugin order:');
  if (report.plugins.length === 0) lines.push('  (none)');
  else report.plugins.forEach((plugin, index) => lines.push(`  ${index + 1}. ${plugin}`));

  lines.push('Warnings:');
  if (report.warnings.length === 0) lines.push('  (none)');
  else report.warnings.forEach(warning => lines.push(`  - ${warning}`));

  return lines.join('\n');
}

async function assembleDoctorPlugins(project: ResolvedMikoConfig): Promise<PluginAssembly> {
  const originalLog = console.log;
  console.log = () => {};
  try {
    return await assembleMikoPlugins(project);
  } finally {
    console.log = originalLog;
  }
}

export async function runDoctor(
  context: CommandContext,
  output: (message: string) => void = console.log,
): Promise<void> {
  const project = await resolveMikoProject({
    command: 'doctor',
    mode: context.mode,
    root: context.root,
  });
  const assembly = await assembleDoctorPlugins(project);
  const report = createDoctorReport(project, assembly);
  output(context.json ? JSON.stringify(report, null, 2) : renderDoctorText(report));
}
