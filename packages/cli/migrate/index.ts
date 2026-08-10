import { basename } from 'node:path';
import { runCheck } from '../check';
import type { CommandContext } from '../context';
import { runDoctor } from '../doctor';
import { MikoCliError } from '../errors';
import { analyzeMigration } from './analyze';
import type { MigrationPlan } from './types';
import { writeMigration, type MigrationWriteResult } from './write';

export interface MigrateDependencies {
  analyze(root: string): Promise<MigrationPlan>;
  check(context: CommandContext): Promise<void>;
  doctor(context: CommandContext): Promise<void>;
  output(message: string): void;
  write(plan: MigrationPlan): Promise<MigrationWriteResult>;
}

const defaultDependencies: MigrateDependencies = {
  analyze: analyzeMigration,
  check: runCheck,
  doctor: (context) => runDoctor(context),
  output: console.log,
  write: writeMigration,
};

function planStatus(plan: MigrationPlan): 'safe' | 'current' | 'nothing' | 'manual' {
  if (plan.safeToWrite) return 'safe';
  if (plan.findings.some((finding) => finding.code === 'MIKO_MIGRATE_CURRENT')) {
    return 'current';
  }
  if (plan.findings.some((finding) => finding.code === 'MIKO_MIGRATE_NOTHING')) {
    return 'nothing';
  }
  return 'manual';
}

function renderPlan(plan: MigrationPlan, write: boolean): string {
  const sources =
    plan.sourceFiles.length === 0
      ? '(none)'
      : plan.sourceFiles.map((file) => basename(file)).join(', ');
  const lines = [
    write ? 'Miko v1 migration plan' : 'Miko v1 migration dry-run',
    `Source: ${sources}`,
    `Target: ${basename(plan.targetFile)}`,
    `Status: ${planStatus(plan)}`,
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
  if (!write) {
    lines.push('', 'No files were changed. Run "miko migrate --write" to apply this plan.');
  }
  return lines.join('\n');
}

function isNoOp(plan: MigrationPlan): boolean {
  return (
    (planStatus(plan) === 'current' || planStatus(plan) === 'nothing') &&
    plan.findings.length > 0 &&
    plan.findings.every(
      (finding) =>
        finding.level === 'info' &&
        (finding.code === 'MIKO_MIGRATE_CURRENT' || finding.code === 'MIKO_MIGRATE_NOTHING'),
    )
  );
}

function verificationContext(context: CommandContext, command: 'check' | 'doctor'): CommandContext {
  return {
    ...context,
    allRoutes: false,
    checkAfterWrite: false,
    command,
    json: false,
    lib: false,
    write: false,
  };
}

export async function runMigrate(
  context: CommandContext,
  overrides: Partial<MigrateDependencies> = {},
): Promise<void> {
  const dependencies = { ...defaultDependencies, ...overrides };
  const plan = await dependencies.analyze(context.root);
  dependencies.output(renderPlan(plan, context.write === true));
  if (!context.write) return;
  if (isNoOp(plan)) {
    dependencies.output('No migration changes are required.');
    return;
  }
  if (!plan.safeToWrite) {
    throw new MikoCliError('MIKO_MIGRATE_UNSAFE', '迁移计划包含需要人工处理的内容，拒绝写入', 7);
  }

  const result = await dependencies.write(plan);
  dependencies.output(
    `Migration written\nTarget: ${result.targetFile}\nBackup: ${result.backupDir}`,
  );
  await dependencies.doctor(verificationContext(context, 'doctor'));
  if (context.checkAfterWrite) {
    await dependencies.check(verificationContext(context, 'check'));
  }
}
