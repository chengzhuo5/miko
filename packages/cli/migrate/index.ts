import { basename } from 'node:path';
import type { CommandContext } from '../context';
import { MikoCliError } from '../errors';
import { analyzeMigration } from './analyze';
import type { MigrationPlan } from './types';

export interface MigrateDependencies {
  analyze(root: string): Promise<MigrationPlan>;
  output(message: string): void;
}

const defaultDependencies: MigrateDependencies = {
  analyze: analyzeMigration,
  output: console.log,
};

function renderPlan(plan: MigrationPlan): string {
  const sources =
    plan.sourceFiles.length === 0
      ? '(none)'
      : plan.sourceFiles.map((file) => basename(file)).join(', ');
  const lines = [
    'Miko v1 migration dry-run',
    `Source: ${sources}`,
    `Target: ${basename(plan.targetFile)}`,
    `Status: ${plan.safeToWrite ? 'safe' : 'manual'}`,
  ];
  if (plan.findings.length > 0) {
    lines.push(
      '',
      ...plan.findings.map(
        (finding) =>
          `[${finding.level.toUpperCase()}] ${finding.file}: [${finding.code}] ${finding.message}`,
      ),
    );
  }
  if (plan.generatedSource) lines.push('', plan.generatedSource.trimEnd());
  else if (plan.safeToWrite) lines.push('', 'No miko.config.ts is required after migration.');
  lines.push('', 'No files were changed. Run "miko migrate --write" to apply this plan.');
  return lines.join('\n');
}

export async function runMigrate(
  context: CommandContext,
  overrides: Partial<MigrateDependencies> = {},
): Promise<void> {
  const dependencies = { ...defaultDependencies, ...overrides };
  const plan = await dependencies.analyze(context.root);
  dependencies.output(renderPlan(plan));
  if (context.write) {
    throw new MikoCliError(
      'MIKO_MIGRATE_WRITE_UNAVAILABLE',
      '迁移写入将在安全计划确认后执行；当前没有修改任何文件',
      2,
    );
  }
}
