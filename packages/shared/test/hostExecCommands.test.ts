import { describe, expect, it } from 'vitest'
import { IPC } from '../src/ipc'
import { IPC_REQUEST_SCHEMAS } from '../src/ipcSchemaMap'
import { HOST_EXEC_COMMANDS, HostExecRequestSchema } from '../src/schemas'

/**
 * Rust source of truth: `apps/desktop/src-tauri/src/system_info.rs` `host_exec_handler`.
 * Update both sides together when adding or removing commands.
 */
const RUST_HOST_EXEC_COMMANDS = [
  'nvidia_smi_short',
  'systemctl_is_active',
  'systemctl_start',
  'systemctl_stop',
  'systemctl_is_active_fallback',
  'maintenance_docker_system_df',
  'maintenance_docker_ps_table',
  'maintenance_journalctl_docker',
  'maintenance_du_cache_tail',
  'settings_read_hosts',
  'settings_process_env',
  'settings_write_hosts',
  'settings_read_profile_env',
  'settings_write_profile_env',
  'security_ufw_enable',
  'security_sshd_disable_password',
  'security_sshd_disable_root',
] as const

describe('host exec command parity', () => {
  it('HOST_EXEC_COMMANDS matches Rust host_exec_handler whitelist', () => {
    expect([...HOST_EXEC_COMMANDS].sort()).toEqual([...RUST_HOST_EXEC_COMMANDS].sort())
  })

  it('ipc map uses HostExecRequestSchema for dh:host:exec', () => {
    expect(IPC_REQUEST_SCHEMAS[IPC.hostExec]).toBe(HostExecRequestSchema)
  })
})
