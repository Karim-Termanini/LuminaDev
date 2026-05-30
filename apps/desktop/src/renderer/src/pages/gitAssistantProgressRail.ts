export type GitProgressStep = 'setup' | 'project' | 'save' | 'share'

export type GitProgressStepStatus = 'complete' | 'incomplete'

export type GitProgressRailState = Record<GitProgressStep, GitProgressStepStatus> & {
  active: GitProgressStep | null
}

export function computeGitProgressRail(input: {
  setupComplete: boolean
  projectComplete: boolean
  saveComplete: boolean
  githubConnected: boolean
  ahead: number | null
}): GitProgressRailState {
  const setup: GitProgressStepStatus = input.setupComplete ? 'complete' : 'incomplete'
  const project: GitProgressStepStatus = input.projectComplete ? 'complete' : 'incomplete'
  const save: GitProgressStepStatus = input.saveComplete ? 'complete' : 'incomplete'

  const unpushed = input.ahead != null && input.ahead > 0
  const shareComplete = input.githubConnected && !unpushed
  const share: GitProgressStepStatus = shareComplete ? 'complete' : 'incomplete'

  const order: GitProgressStep[] = ['setup', 'project', 'save', 'share']
  const statuses: Record<GitProgressStep, GitProgressStepStatus> = { setup, project, save, share }
  let active: GitProgressStep | null = null
  for (const step of order) {
    if (statuses[step] === 'incomplete') {
      active = step
      break
    }
  }

  return { setup, project, save, share, active }
}
