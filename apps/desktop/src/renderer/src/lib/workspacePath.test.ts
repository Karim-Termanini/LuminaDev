import { describe, expect, it } from 'vitest'
import { isAutoComposeMountPath, isUserLinkedWorkspacePath } from './workspacePath'

describe('workspacePath', () => {
  it('detects auto compose mount paths', () => {
    expect(isAutoComposeMountPath('/home/user/LuminaProjects/my-lab/default', 'my-lab')).toBe(true)
    expect(isAutoComposeMountPath('~/LuminaProjects/my-lab/default/', 'my-lab')).toBe(true)
  })

  it('treats real project paths as linked workspaces', () => {
    expect(isUserLinkedWorkspacePath('/home/user/LuminaProjects/my-lab/my-project', 'my-lab')).toBe(
      true
    )
    expect(isUserLinkedWorkspacePath('/home/user/LuminaProjects/my-lab/default', 'my-lab')).toBe(
      false
    )
  })
})
