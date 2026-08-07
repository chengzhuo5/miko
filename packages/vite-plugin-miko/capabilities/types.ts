export interface ProjectConventions {
  components: boolean;
  layouts: boolean;
  unoConfig: string | null;
  janusSchemas: string | null;
  lintConfig: string | null;
}

export interface ProjectSignals {
  root: string;
  packageJsonPath: string | null;
  dependencies: string[];
  browserslist: string[];
  browserslistConfigFile: string | null;
  conventions: ProjectConventions;
  watchedFiles: string[];
  watchedDirectories: string[];
}
