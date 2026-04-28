import type { ReactElement } from 'react'
import { Outlet } from 'react-router-dom'

/** Nested dashboard routes (Main / Widget / Kernels / Logs) share this outlet. */
export function DashboardLayout(): ReactElement {
  return <Outlet />
}
