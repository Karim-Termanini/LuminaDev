import { describe, expect, it } from 'vitest'
import {
  dataScienceScaffoldOptions,
  defaultDataScienceDeps,
  partitionDataScienceDeps,
} from './dataScienceCreateWizard'

describe('dataScienceCreateWizard', () => {
  it('partitions mixed deps into python and r', () => {
    const { python, r } = partitionDataScienceDeps({
      pandas: 'latest',
      tidyverse: 'latest',
      numpy: '1.0',
    })
    expect(Object.keys(python)).toEqual(['pandas', 'numpy'])
    expect(Object.keys(r)).toEqual(['tidyverse'])
  })

  it('builds scaffold options for both toolchain', () => {
    const opts = dataScienceScaffoldOptions(
      'both',
      { pandas: 'latest', caret: 'latest' },
      { createNotebook: true, createMainScript: false }
    )
    expect(opts.dependencies).toEqual({ pandas: 'latest' })
    expect(opts.rDependencies).toEqual({ caret: 'latest' })
  })

  it('defaults both toolchain deps to beginner set', () => {
    const deps = defaultDataScienceDeps('both')
    expect(deps.pandas).toBe('latest')
    expect(deps.ggplot2).toBe('latest')
    expect(deps.tidyverse).toBeUndefined()
    expect(deps.tensorflow).toBeUndefined()
  })
})
