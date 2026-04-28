import type { DashboardLayoutFile } from '@linux-dev-home/shared'
import type { ReactElement, ReactNode } from 'react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

export type WidgetLayoutContextValue = {
  layout: DashboardLayoutFile | null
  setLayout: (next: DashboardLayoutFile) => void
  removePlacement: (instanceId: string) => Promise<void>
  reloadLayout: () => Promise<void>
}

const WidgetLayoutContext = createContext<WidgetLayoutContextValue | null>(null)

export function useWidgetLayout(): WidgetLayoutContextValue {
  const v = useContext(WidgetLayoutContext)
  if (!v) {
    throw new Error('useWidgetLayout must be used within WidgetLayoutProvider')
  }
  return v
}

export function WidgetLayoutProvider({ children }: { children: ReactNode }): ReactElement {
  const [layout, setLayout] = useState<DashboardLayoutFile | null>(null)
  const layoutRef = useRef(layout)
  layoutRef.current = layout

  const reloadLayout = useCallback(async () => {
    try {
      const raw = (await window.dh.layoutGet()) as DashboardLayoutFile
      setLayout(raw)
    } catch {
      setLayout(null)
    }
  }, [])

  useEffect(() => {
    void reloadLayout()
  }, [reloadLayout])

  const removePlacement = useCallback(
    async (instanceId: string) => {
      const prev = layoutRef.current
      if (!prev) return
      const next: DashboardLayoutFile = {
        version: 1,
        placements: prev.placements.filter((p) => p.instanceId !== instanceId),
      }
      try {
        await window.dh.layoutSet(next)
        setLayout(next)
      } catch {
        await reloadLayout()
      }
    },
    [reloadLayout]
  )

  const value = useMemo(
    () => ({
      layout,
      setLayout,
      removePlacement,
      reloadLayout,
    }),
    [layout, removePlacement, reloadLayout]
  )

  return <WidgetLayoutContext.Provider value={value}>{children}</WidgetLayoutContext.Provider>
}
