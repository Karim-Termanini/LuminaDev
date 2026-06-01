export type SshTarget = 'sandbox' | 'host'

export type SshSession = {
  id: string
  termId?: string
  bmId: string
  bmName: string
  user: string
  host: string
  port: number
  status: 'connecting' | 'connected' | 'disconnected'
  startTime: number
  isTransfer?: boolean
}
