import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import type { NotificationSettings } from '@linux-dev-home/shared'

type ToastType = 'info' | 'warn' | 'error' | 'success'

interface Toast {
  id: string
  type: ToastType
  message: string
}

interface NotificationContextType {
  showToast: (type: ToastType, message: string) => void
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [settings, setSettings] = useState<NotificationSettings>({ globalMute: false, minSeverity: 'info', osNotifications: false })

  useEffect(() => {
    void window.dh.storeGet({ key: 'notification_settings' }).then((res) => {
      if (res.ok && res.data && typeof res.data === 'object') {
        setSettings(res.data as NotificationSettings)
      }
    })
  }, [])

  const showToast = (type: ToastType, message: string) => {
    if (settings.globalMute) return

    const severityOrder: Record<ToastType, number> = { info: 0, success: 0, warn: 1, error: 2 }
    const minOrder = severityOrder[settings.minSeverity] || 0
    const currentOrder = severityOrder[type] || 0

    if (currentOrder < minOrder) return

    const id = Math.random().toString(36).substring(2, 9)
    setToasts((prev) => [...prev, { id, type, message }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 5000)
  }

  return (
    <NotificationContext.Provider value={{ showToast }}>
      {children}
      <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {toasts.map((t) => (
          <div key={t.id} style={{
            minWidth: 280, maxWidth: 400, padding: '12px 16px', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            background: t.type === 'success' ? 'var(--green, #16a34a)' : t.type === 'error' ? 'var(--red, #dc2626)' : t.type === 'warn' ? 'var(--orange, #ea580c)' : 'var(--accent, #3b82f6)',
            color: '#fff', display: 'flex', alignItems: 'center', gap: 12, animation: 'hp-slide-in 0.3s ease-out'
          }}>
            <span className={`codicon ${t.type === 'success' ? 'codicon-check' : t.type === 'error' ? 'codicon-error' : 'codicon-warning'}`} style={{ fontSize: 18 }} />
            <span style={{ fontSize: 14, flex: 1 }}>{t.message}</span>
            <button onClick={() => setToasts((prev) => prev.filter((toast) => toast.id !== t.id))} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 4 }}>
                <span className="codicon codicon-close" />
            </button>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes hp-slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </NotificationContext.Provider>
  )
}

export function useNotification() {
  const context = useContext(NotificationContext)
  if (!context) throw new Error('useNotification must be used within NotificationProvider')
  return context
}
