import * as path from 'path';
import * as ts from 'typescript';
import {
  CachedFileLoader,
  FileCache,
  FileLoader,
  resolveNormalizedPath,
  UncachedFileLoader,
} from '@bazel/typescript';

export const BAZEL_BIN = /\b(blaze|bazel)-out\b.*?\bbin\b/;
export const SVELTE_JS_EXT = /(.svelte.js)$/g;
export const SVELTE_DTS_EXT = /(.svelte.d.ts)$/;
export const SCRIPT_TAG = /<script(\s[^]*?)?>([^]*?)<\/script>/gi;
export const SVELTE_FILE_COMPONENT_NAME = /(.*?).svelte.(d.ts|js)$/;
export const MISSING_DECLARATION = /'(.*?)'/;

export function isSvelteOutputFile(fileName: string): boolean {
  return SVELTE_JS_EXT.test(fileName);
}

export function isSvelteDeclarationFile(fileName: string): boolean {
  return SVELTE_DTS_EXT.test(fileName);
}

export function isSvelteInputFile(fileName: string): boolean {
  return fileName.endsWith('.svelte');
}

export function getSvelteNameFromPath(fileName: string): string {
  return path.basename(fileName).match(SVELTE_FILE_COMPONENT_NAME)[1];
}

export function createFileLoader(
  fileCache: FileCache,
  inputs?: Record<string, string>,
): FileLoader {
  if (!inputs) {
    return new UncachedFileLoader();
  }

  const fileLoader = new CachedFileLoader(fileCache);
  // Resolve the inputs to absolute paths to match TypeScript internals
  const resolvedInputs = new Map<string, string>();
  const inputKeys = Object.keys(inputs);

  inputKeys.forEach(key => {
    resolvedInputs.set(resolveNormalizedPath(key), inputs[key]);
  });

  fileCache.updateCache(resolvedInputs);

  return fileLoader;
}

export function relativeToRootDirs(
  filePath: string,
  rootDirs: string[],
): string {
  if (!filePath) return filePath;
  // NB: the rootDirs should have been sorted longest-first
  for (let i = 0; i < rootDirs.length; i++) {
    const dir = rootDirs[i];
    const rel = path.posix.relative(dir, filePath);
    if (rel.indexOf('.') != 0) return rel;
  }

  return filePath;
}

export function hasDiagnosticsErrors(
  diagnostics: ReadonlyArray<ts.Diagnostic>,
) {
  return diagnostics.some(d => d.category === ts.DiagnosticCategory.Error);
}

export function gatherDiagnosticsForInputsOnly(
  program: ts.Program,
): ts.Diagnostic[] {
  const diagnostics: ts.Diagnostic[] = [];
  // These checks mirror ts.getPreEmitDiagnostics, with the important
  // exception of avoiding b/30708240, which is that if you call
  // program.getDeclarationDiagnostics() it somehow corrupts the emit.
  /*const strictDeps = new StrictDepsPlugin(program, {
    rootDir: this.compilerOpts.rootDir,
    allowedStrictDeps: this.bazelOpts.allowedStrictDeps,
    compilationTargetSrc: this.bazelOpts.compilationTargetSrc,
  });*/

  diagnostics.push(...program.getOptionsDiagnostics());
  diagnostics.push(...program.getGlobalDiagnostics());
  const programFiles = program
    .getSourceFiles()
    .filter(sf => isSvelteInputFile(sf.fileName));

  return programFiles.reduce(
    (allDiagnostics, sf) => [
      //diagnostics.push(...strictDeps.getDiagnostics(sf));
      // Note: We only get the diagnostics for individual files
      // to e.g. not check libraries.
      ...allDiagnostics,
      ...program.getSyntacticDiagnostics(sf),
      ...program.getSemanticDiagnostics(sf),
    ],
    diagnostics,
  );
}