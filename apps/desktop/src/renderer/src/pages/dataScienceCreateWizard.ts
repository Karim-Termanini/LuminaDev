export type DataScienceToolchain = 'python' | 'r' | 'both'

export const DS_PYTHON_PACKAGES = [
  'pandas',
  'numpy',
  'matplotlib',
  'scikit-learn',
  'tensorflow',
  'torch',
  'seaborn',
  'sqlalchemy',
] as const

export const DS_R_PACKAGES = [
  'tidyverse',
  'caret',
  'tidymodels',
  'shiny',
  'ggplot2',
  'dplyr',
  'stringr',
  'lubridate',
] as const

export const DS_BOTH_PYTHON_PACKAGES = ['pandas', 'numpy', 'scikit-learn', 'reticulate'] as const

export const DS_BOTH_R_PACKAGES = ['tidyverse', 'caret', 'ggplot2'] as const

/** Fast, reliable starter set — no meta-packages or GPU stacks. */
export const BEGINNER_DS_PYTHON_PACKAGES = ['pandas', 'numpy', 'matplotlib', 'scikit-learn'] as const

export const BEGINNER_DS_R_PACKAGES = ['ggplot2', 'dplyr'] as const

export const BEGINNER_DS_BOTH_PYTHON_PACKAGES = ['pandas', 'numpy', 'scikit-learn'] as const

export const BEGINNER_DS_BOTH_R_PACKAGES = ['ggplot2', 'dplyr'] as const

const HEAVY_OR_SLOW_PACKAGES = new Set([
  'tensorflow',
  'torch',
  'tidyverse',
  'tidymodels',
  'caret',
  'shiny',
  'reticulate',
])

const R_PACKAGE_SET = new Set<string>([...DS_R_PACKAGES, ...DS_BOTH_R_PACKAGES])

export function isHeavyDataSciencePackage(name: string): boolean {
  return HEAVY_OR_SLOW_PACKAGES.has(name)
}

export function defaultBeginnerDataScienceDeps(tc: DataScienceToolchain): Record<string, string> {
  const pick = (names: readonly string[]) =>
    Object.fromEntries(names.map((n) => [n, 'latest']))
  if (tc === 'r') return pick(BEGINNER_DS_R_PACKAGES)
  if (tc === 'both') {
    return pick([...BEGINNER_DS_BOTH_PYTHON_PACKAGES, ...BEGINNER_DS_BOTH_R_PACKAGES])
  }
  return pick(BEGINNER_DS_PYTHON_PACKAGES)
}

/** @deprecated Use defaultBeginnerDataScienceDeps or defaultExpertDataScienceDeps */
export function defaultDataScienceDeps(tc: DataScienceToolchain): Record<string, string> {
  return defaultBeginnerDataScienceDeps(tc)
}

export function defaultExpertDataScienceDeps(tc: DataScienceToolchain): Record<string, string> {
  const pick = (names: readonly string[]) =>
    Object.fromEntries(names.map((n) => [n, 'latest']))
  if (tc === 'r') return pick(['tidyverse', 'caret', 'ggplot2', 'dplyr'])
  if (tc === 'both') {
    return pick([...DS_BOTH_PYTHON_PACKAGES, ...DS_BOTH_R_PACKAGES])
  }
  return pick(['pandas', 'numpy', 'matplotlib', 'scikit-learn', 'seaborn', 'sqlalchemy'])
}

export function beginnerDepsSummaryKey(tc: DataScienceToolchain): string {
  if (tc === 'r') return 'main.createProject.beginnerDepsR'
  if (tc === 'both') return 'main.createProject.beginnerDepsBoth'
  return 'main.createProject.beginnerDepsPython'
}

export function expertPythonPackages(tc: DataScienceToolchain): readonly string[] {
  if (tc === 'both') return DS_BOTH_PYTHON_PACKAGES
  return DS_PYTHON_PACKAGES.filter((p) => !isHeavyDataSciencePackage(p))
}

export function expertRPackages(tc: DataScienceToolchain): readonly string[] {
  if (tc === 'both') return DS_BOTH_R_PACKAGES
  return DS_R_PACKAGES.filter((p) => !isHeavyDataSciencePackage(p))
}

export function partitionDataScienceDeps(deps: Record<string, string>): {
  python: Record<string, string>
  r: Record<string, string>
} {
  const python: Record<string, string> = {}
  const r: Record<string, string> = {}
  for (const [name, version] of Object.entries(deps)) {
    if (R_PACKAGE_SET.has(name)) {
      r[name] = version
    } else {
      python[name] = version
    }
  }
  return { python, r }
}

export function dataScienceScaffoldOptions(
  toolchain: DataScienceToolchain,
  deps: Record<string, string>,
  extras: {
    createNotebook: boolean
    createMainScript: boolean
  }
): {
  toolchain: DataScienceToolchain
  dependencies: Record<string, string>
  rDependencies: Record<string, string>
  createNotebook: boolean
  createMainScript: boolean
} {
  const { python, r } = partitionDataScienceDeps(deps)
  if (toolchain === 'python') {
    return { toolchain, dependencies: python, rDependencies: {}, ...extras }
  }
  if (toolchain === 'r') {
    return { toolchain, dependencies: {}, rDependencies: r, ...extras }
  }
  return { toolchain, dependencies: python, rDependencies: r, ...extras }
}
