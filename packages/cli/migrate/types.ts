export type MigrationValue =
  | boolean
  | null
  | number
  | string
  | MigrationValue[]
  | { [key: string]: MigrationValue };

export interface MigrationConfig {
  miko: Record<string, MigrationValue>;
  vite: Record<string, MigrationValue>;
}

export interface MigrationFinding {
  level: 'info' | 'warning' | 'error';
  code: string;
  file: string;
  message: string;
}

export interface MigrationPlan {
  root: string;
  sourceFiles: string[];
  targetFile: string;
  generatedSource: string | null;
  findings: MigrationFinding[];
  safeToWrite: boolean;
}
