import type { ReactElement } from 'react'
import { Outlet } from 'react-router-dom'

/** Nested dashboard routes (Main / Kernels / Logs / Monitor) share this outlet. */
export function DashboardLayout(): ReactElement {
  return <Outlet />
}
