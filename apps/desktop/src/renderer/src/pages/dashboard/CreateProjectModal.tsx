import type { ReactElement } from 'react'
import { useEffect, useRef } from 'react'
import {
  beginnerDepsSummaryKey,
  defaultBeginnerDataScienceDeps,
  defaultExpertDataScienceDeps,
  expertPythonPackages,
  expertRPackages,
} from '../dataScienceCreateWizard'
import { persistPreferredEditorCmd } from './constants'
import type { DashboardMainViewModel } from './useDashboardMainPage'

export function CreateProjectModal({ vm }: { vm: DashboardMainViewModel }): ReactElement | null {
  const { t } = vm
  const logsContainerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight
    }
  }, [vm.installLogs])
  if (!vm.createProjectModalOpen || !vm.selectedProfile) return null
  return (
        <div className="fluent-modal-overlay">
          <div className="fluent-modal-content" style={{ maxWidth: vm.isDataScience ? 520 : 400 }}>
            {vm.isScaffolding ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 20 }}>{vm.scaffoldStatusText}</h3>
                <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
                  {t('main.createProject.settingUp', { name: vm.createProjectName })}
                </p>

                <div
                  style={{
                    width: '100%',
                    height: 6,
                    background: 'rgba(255,255,255,0.1)',
                    borderRadius: 3,
                    overflow: 'hidden',
                    marginBottom: 24,
                    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.2)',
                  }}
                >
                  <div
                    style={{
                      width: `${vm.scaffoldProgress}%`,
                      height: '100%',
                      background: vm.selectedProfile.accent,
                      borderRadius: 3,
                      transition: 'width 0.4s ease-out',
                      boxShadow: `0 0 10px ${vm.selectedProfile.accent}`,
                    }}
                  />
                </div>

                {vm.installLogs.length > 0 && (
                  <div
                    style={{
                      marginTop: 24,
                      textAlign: 'left',
                      background: 'rgba(0,0,0,0.4)',
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.08)',
                      overflow: 'hidden',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                    }}
                  >
                    {/* Terminal Header */}
                    <div
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        padding: '8px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      <div
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: '#ff5f56',
                        }}
                      />
                      <div
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: '#ffbd2e',
                        }}
                      />
                      <div
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: '#27c93f',
                        }}
                      />
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 11,
                          color: 'var(--text-muted)',
                          fontFamily: 'sans-serif',
                          letterSpacing: 0.5,
                        }}
                      >
                        {t('main.createProject.installProgress')}
                      </span>
                    </div>
                    {/* Terminal Body */}
                    <div
                      ref={logsContainerRef}
                      style={{
                        padding: 12,
                        height: 140,
                        overflowY: 'auto',
                        fontFamily: '"Fira Code", monospace, Consolas',
                        fontSize: 12,
                        color: '#a9adc1',
                        lineHeight: 1.5,
                      }}
                    >
                      {vm.installLogs.map((log, i) => (
                        <div key={i} style={{ marginBottom: 4, wordBreak: 'break-all' }}>
                          <span style={{ color: vm.selectedProfile.accent, marginRight: 8 }}>❯</span>
                          {log}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : !vm.isDataScience && !vm.isWebDev ? (
              <>
                <h2 style={{ margin: '0 0 16px 0', fontSize: 24, fontWeight: 700 }}>
                  {t('main.createProject.title')}
                </h2>
                <p
                  style={{
                    margin: '0 0 24px',
                    color: 'var(--text-muted)',
                    fontSize: 15,
                    lineHeight: 1.6,
                  }}
                >
                  {t('main.createProject.description', {
                    profile: vm.selectedProfile.title,
                    path: vm.projectsHomeDir,
                  })}
                </p>
                <input
                  type="text"
                  autoFocus
                  value={vm.createProjectName}
                  onChange={(e) => vm.setCreateProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') vm.submitCreateProject()
                  }}
                  placeholder={t('main.createProject.placeholder')}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(0,0,0,0.2)',
                    color: 'var(--text)',
                    fontSize: 16,
                    marginBottom: 20,
                    outline: 'none',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)',
                    transition: 'border-color 0.2s ease',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = vm.selectedProfile.accent
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                  }}
                />
                {(vm.selectedProfile?.baseTemplate || vm.selectedProfile?.name) === 'mobile' && (
                  <div style={{ marginBottom: 20 }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 13,
                        color: 'var(--text-muted)',
                        marginBottom: 8,
                        fontWeight: 600,
                        letterSpacing: 0.5,
                        textTransform: 'uppercase',
                      }}
                    >
                      {t('main.createProject.mobileFramework')}
                    </label>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {(['react-native', 'flutter'] as const).map((fw) => (
                        <button
                          key={fw}
                          type="button"
                          onClick={() => vm.setMobileSubTemplate(fw)}
                          style={{
                            flex: 1,
                            padding: '10px 16px',
                            borderRadius: 8,
                            border: `1px solid ${vm.mobileSubTemplate === fw ? vm.selectedProfile.accent : 'rgba(255,255,255,0.1)'}`,
                            background:
                              vm.mobileSubTemplate === fw
                                ? `${vm.selectedProfile.accent}22`
                                : 'rgba(0,0,0,0.2)',
                            color:
                              vm.mobileSubTemplate === fw
                                ? vm.selectedProfile.accent
                                : 'var(--text-muted)',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: 14,
                            transition: 'all 0.2s ease',
                          }}
                        >
                          {fw === 'react-native'
                            ? t('main.createProject.reactNative')
                            : t('main.createProject.flutter')}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {Object.keys(vm.suggestedPorts).length > 0 && (
                  <div
                    style={{
                      marginBottom: 20,
                      padding: '12px 14px',
                      borderRadius: 8,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: 0.8,
                        textTransform: 'uppercase',
                        color: 'var(--text-muted)',
                        marginBottom: 8,
                      }}
                    >
                      {t('main.createProject.servicesPorts')}
                    </div>
                    {Object.entries(vm.suggestedPorts).map(([svc, port]) => (
                      <div
                        key={svc}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 4,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 13,
                            color: 'var(--text-muted)',
                            textTransform: 'capitalize',
                          }}
                        >
                          {svc.replace('_', ' ')}
                        </span>
                        <span
                          style={{
                            fontSize: 13,
                            fontFamily: 'monospace',
                            color: vm.selectedProfile.accent,
                          }}
                        >
                          :{port}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div
                  style={{
                    display: 'flex',
                    gap: 12,
                    justifyContent: 'flex-end',
                    borderTop: '1px solid rgba(255,255,255,0.1)',
                    paddingTop: 16,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      vm.closeCreateProjectModal()
                      vm.setSuggestedPorts({})
                    }}
                    style={{
                      padding: '10px 24px',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 6,
                      background: 'rgba(255,255,255,0.05)',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: 14,
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                    }}
                  >
                    {t('main.createProject.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={vm.submitCreateProject}
                    disabled={!vm.createProjectName.trim()}
                    style={{
                      padding: '10px 24px',
                      border: 'none',
                      borderRadius: 6,
                      background: vm.createProjectName.trim()
                        ? vm.selectedProfile.accent
                        : 'rgba(255,255,255,0.1)',
                      color: vm.createProjectName.trim() ? '#fff' : 'var(--text-muted)',
                      cursor: vm.createProjectName.trim() ? 'pointer' : 'not-allowed',
                      fontWeight: 600,
                      fontSize: 14,
                      boxShadow: vm.createProjectName.trim()
                        ? `0 4px 12px ${vm.selectedProfile.accent}40`
                        : 'none',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (vm.createProjectName.trim()) {
                        e.currentTarget.style.transform = 'translateY(-1px)'
                        e.currentTarget.style.boxShadow = `0 6px 16px ${vm.selectedProfile.accent}60`
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (vm.createProjectName.trim()) {
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow = `0 4px 12px ${vm.selectedProfile.accent}40`
                      }
                    }}
                  >
                    {t('main.createProject.create')}
                  </button>
                </div>
              </>
            ) : vm.isDataScience || vm.isWebDev ? (
              <>
                <h2 style={{ margin: '0 0 16px 0', fontSize: 24, fontWeight: 700 }}>
                  {vm.isDataScience
                    ? t('main.createProject.setupWizard', { profile: 'Data Science' })
                    : t('main.createProject.setupWizard', { profile: 'Web Development' })}
                </h2>

                <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
                  {[1, 2, 3].map((step) => (
                    <div
                      key={step}
                      style={{
                        flex: 1,
                        height: 4,
                        borderRadius: 2,
                        background:
                          step <= vm.createProjectStep
                            ? vm.selectedProfile.accent
                            : 'rgba(255,255,255,0.1)',
                        transition: 'background 0.3s ease',
                      }}
                    />
                  ))}
                </div>

                {vm.createProjectStep === 1 && (
                  <div style={{ animation: 'fade-in 0.3s ease' }}>
                    <p
                      style={{
                        margin: '0 0 24px',
                        color: 'var(--text-muted)',
                        fontSize: 15,
                        lineHeight: 1.6,
                      }}
                    >
                      {t('main.createProject.step1')}
                    </p>

                    <strong
                      style={{
                        display: 'block',
                        marginBottom: 8,
                        fontSize: 13,
                        color: 'var(--text-muted)',
                      }}
                    >
                      {t('main.createProject.projectName')}
                    </strong>
                    <input
                      type="text"
                      autoFocus
                      value={vm.createProjectName}
                      onChange={(e) => vm.setCreateProjectName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && vm.createProjectName.trim()) vm.setCreateProjectStep(2)
                      }}
                      placeholder={
                        vm.isDataScience
                          ? t('main.createProject.placeholderDataScience')
                          : t('main.createProject.placeholderWebDev')
                      }
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(0,0,0,0.2)',
                        color: 'var(--text)',
                        fontSize: 16,
                        marginBottom: 20,
                        outline: 'none',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)',
                        transition: 'border-color 0.2s ease',
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = vm.selectedProfile.accent
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                      }}
                    />

                    {vm.isDataScience ? (
                      <>
                        <strong
                          style={{
                            display: 'block',
                            marginBottom: 8,
                            fontSize: 13,
                            color: 'var(--text-muted)',
                          }}
                        >
                          {t('main.createProject.toolchain', 'Toolchain')}
                        </strong>
                        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                          {(['python', 'r', 'both'] as const).map((tc) => (
                            <button
                              key={tc}
                              type="button"
                              onClick={() => {
                                vm.setCreateProjectToolchain(tc)
                                vm.setCreateProjectDeps(
                                  vm.createProjectDepsMode === 'beginner'
                                    ? defaultBeginnerDataScienceDeps(tc)
                                    : defaultExpertDataScienceDeps(tc)
                                )
                              }}
                              style={{
                                flex: 1,
                                padding: '10px 16px',
                                borderRadius: 8,
                                border: `1px solid ${vm.createProjectToolchain === tc ? vm.selectedProfile.accent : 'rgba(255,255,255,0.1)'}`,
                                background:
                                  vm.createProjectToolchain === tc
                                    ? `${vm.selectedProfile.accent}22`
                                    : 'rgba(0,0,0,0.2)',
                                color:
                                  vm.createProjectToolchain === tc
                                    ? vm.selectedProfile.accent
                                    : 'var(--text-muted)',
                                cursor: 'pointer',
                                fontWeight: 600,
                                fontSize: 14,
                                transition: 'all 0.2s ease',
                                textTransform: 'capitalize',
                              }}
                            >
                              {tc}
                            </button>
                          ))}
                        </div>

                        {vm.createProjectToolchain !== 'r' && (
                          <>
                            <strong
                              style={{
                                display: 'block',
                                marginBottom: 8,
                                fontSize: 13,
                                color: 'var(--text-muted)',
                              }}
                            >
                              {t('main.createProject.pythonVersion')}
                            </strong>
                            <select
                              value={vm.createProjectPythonVer}
                              onChange={(e) => vm.setCreateProjectPythonVer(e.target.value)}
                              style={{
                                width: '100%',
                                padding: '12px 16px',
                                borderRadius: 8,
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'rgba(0,0,0,0.2)',
                                color: 'var(--text)',
                                fontSize: 16,
                                marginBottom: 32,
                                outline: 'none',
                                appearance: 'none',
                                cursor: 'pointer',
                              }}
                            >
                              <option value="latest">
                                {t('main.createProject.latestStableJupyter')}
                              </option>
                              <option value="3.11">{t('main.createProject.python311')}</option>
                              <option value="3.10">{t('main.createProject.python310')}</option>
                              <option value="3.9">{t('main.createProject.python39')}</option>
                              <option value="3.8">{t('main.createProject.python38')}</option>
                            </select>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <strong
                          style={{
                            display: 'block',
                            marginBottom: 8,
                            fontSize: 13,
                            color: 'var(--text-muted)',
                          }}
                        >
                          {t('main.createProject.nodeVersion')}
                        </strong>
                        <select
                          value={vm.createProjectPythonVer} // We are reusing the state variable for simplicity
                          onChange={(e) => vm.setCreateProjectPythonVer(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '12px 16px',
                            borderRadius: 8,
                            border: '1px solid rgba(255,255,255,0.1)',
                            background: 'rgba(0,0,0,0.2)',
                            color: 'var(--text)',
                            fontSize: 16,
                            marginBottom: 32,
                            outline: 'none',
                            appearance: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          <option value="latest">{t('main.createProject.latestStable22')}</option>
                          <option value="20">{t('main.createProject.node20')}</option>
                          <option value="18">{t('main.createProject.node18')}</option>
                        </select>
                      </>
                    )}
                  </div>
                )}
                {vm.createProjectStep === 2 && (
                  <div style={{ animation: 'fade-in 0.3s ease' }}>
                    <p
                      style={{
                        margin: '0 0 24px',
                        color: 'var(--text-muted)',
                        fontSize: 15,
                        lineHeight: 1.6,
                      }}
                    >
                      {t('main.createProject.step2')}
                    </p>

                    <strong
                      style={{
                        display: 'block',
                        marginBottom: 8,
                        fontSize: 13,
                        color: 'var(--text-muted)',
                      }}
                    >
                      {t('main.createProject.pgVersion')}
                    </strong>
                    <select
                      value={vm.createProjectPostgresVer}
                      onChange={(e) => vm.setCreateProjectPostgresVer(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(0,0,0,0.2)',
                        color: 'var(--text)',
                        fontSize: 16,
                        marginBottom: 20,
                        outline: 'none',
                        appearance: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="16">{t('main.createProject.pg16')}</option>
                      <option value="15">{t('main.createProject.pg15')}</option>
                      <option value="14">{t('main.createProject.pg14')}</option>
                      <option value="13">{t('main.createProject.pg13')}</option>
                    </select>

                    <div
                      style={{
                        background: 'rgba(0,0,0,0.2)',
                        padding: 16,
                        borderRadius: 8,
                        border: `1px solid ${vm.selectedProfile.accent}50`,
                        marginBottom: 32,
                      }}
                    >
                      <strong
                        style={{ display: 'block', marginBottom: 8, color: vm.selectedProfile.accent }}
                      >
                        {t('main.createProject.isolatedEnv')}
                      </strong>
                      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
                        {t('main.createProject.isolatedDesc')}
                      </p>
                    </div>
                  </div>
                )}
                {vm.createProjectStep === 3 && (
                  <div style={{ animation: 'fade-in 0.3s ease' }}>
                    <p
                      style={{
                        margin: '0 0 24px',
                        color: 'var(--text-muted)',
                        fontSize: 15,
                        lineHeight: 1.6,
                      }}
                    >
                      {t('main.createProject.step3')}
                    </p>

                    <div style={{ marginBottom: 20 }}>
                      <strong
                        style={{
                          display: 'block',
                          marginBottom: 12,
                          fontSize: 12,
                          textTransform: 'uppercase',
                          letterSpacing: 1,
                          color: 'var(--text-muted)',
                        }}
                      >
                        {t('main.createProject.scaffoldFiles')}
                      </strong>
                      {vm.isDataScience ? (
                        <>
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              marginBottom: 12,
                              cursor: 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={vm.createProjectNotebook}
                              onChange={(e) => vm.setCreateProjectNotebook(e.target.checked)}
                              style={{ width: 16, height: 16, accentColor: vm.selectedProfile.accent }}
                            />
                            <span style={{ fontSize: 14 }}>
                              {vm.dsNotebookLabel(vm.createProjectToolchain)}
                            </span>
                          </label>
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              marginBottom: 16,
                              cursor: 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={vm.createProjectMainPy}
                              onChange={(e) => vm.setCreateProjectMainPy(e.target.checked)}
                              style={{ width: 16, height: 16, accentColor: vm.selectedProfile.accent }}
                            />
                            <span style={{ fontSize: 14 }}>
                              {vm.dsMainScriptLabel(vm.createProjectToolchain)}
                            </span>
                          </label>
                        </>
                      ) : (
                        <>
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              marginBottom: 12,
                              cursor: 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={true}
                              readOnly
                              style={{ width: 16, height: 16, accentColor: vm.selectedProfile.accent }}
                            />
                            <span style={{ fontSize: 14 }}>
                              {t('main.createProject.viteReact')}
                            </span>
                          </label>
                        </>
                      )}
                    </div>

                    <div style={{ marginBottom: 20 }}>
                      {vm.isDataScience && vm.createProjectDepsMode === 'beginner' ? (
                        <div
                          style={{
                            padding: 16,
                            borderRadius: 8,
                            border: `1px solid ${vm.selectedProfile.accent}40`,
                            background: `${vm.selectedProfile.accent}12`,
                          }}
                        >
                          <strong
                            style={{
                              display: 'block',
                              marginBottom: 8,
                              fontSize: 13,
                              color: vm.selectedProfile.accent,
                            }}
                          >
                            {t('main.createProject.beginnerDepsTitle')}
                          </strong>
                          <p
                            style={{
                              margin: '0 0 12px',
                              fontSize: 14,
                              color: 'var(--text-muted)',
                              lineHeight: 1.55,
                            }}
                          >
                            {t(beginnerDepsSummaryKey(vm.createProjectToolchain))}
                          </p>
                          <p
                            style={{
                              margin: '0 0 12px',
                              fontSize: 12,
                              color: 'var(--text-muted)',
                              lineHeight: 1.5,
                            }}
                          >
                            {t('main.createProject.beginnerDepsNote')}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              vm.setCreateProjectDepsMode('expert')
                              vm.setCreateProjectDeps(
                                defaultExpertDataScienceDeps(vm.createProjectToolchain)
                              )
                            }}
                            style={{
                              padding: 0,
                              border: 'none',
                              background: 'transparent',
                              color: vm.selectedProfile.accent,
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: 'pointer',
                              textDecoration: 'underline',
                            }}
                          >
                            {t('main.createProject.showAdvancedPackages')}
                          </button>
                        </div>
                      ) : vm.isDataScience && vm.createProjectToolchain === 'both' ? (
                        <>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: 12,
                            }}
                          >
                            <strong
                              style={{
                                fontSize: 12,
                                textTransform: 'uppercase',
                                letterSpacing: 1,
                                color: 'var(--text-muted)',
                              }}
                            >
                              {t('main.createProject.corePythonLibs')}
                            </strong>
                            <button
                              type="button"
                              onClick={() => {
                                vm.setCreateProjectDepsMode('beginner')
                                vm.setCreateProjectDeps(
                                  defaultBeginnerDataScienceDeps(vm.createProjectToolchain)
                                )
                              }}
                              style={{
                                padding: 0,
                                border: 'none',
                                background: 'transparent',
                                color: 'var(--text-muted)',
                                fontSize: 12,
                                cursor: 'pointer',
                                textDecoration: 'underline',
                              }}
                            >
                              {t('main.createProject.useRecommendedSet')}
                            </button>
                          </div>
                          {vm.renderDataSciencePackageGrid(expertPythonPackages('both'))}
                          <strong
                            style={{
                              display: 'block',
                              marginTop: 20,
                              marginBottom: 12,
                              fontSize: 12,
                              textTransform: 'uppercase',
                              letterSpacing: 1,
                              color: 'var(--text-muted)',
                            }}
                          >
                            {t('main.createProject.coreBothR')}
                          </strong>
                          {vm.renderDataSciencePackageGrid(expertRPackages('both'))}
                        </>
                      ) : (
                        <>
                          {vm.isDataScience && (
                            <div style={{ marginBottom: 12 }}>
                              <button
                                type="button"
                                onClick={() => {
                                  vm.setCreateProjectDepsMode('beginner')
                                  vm.setCreateProjectDeps(
                                    defaultBeginnerDataScienceDeps(vm.createProjectToolchain)
                                  )
                                }}
                                style={{
                                  padding: 0,
                                  border: 'none',
                                  background: 'transparent',
                                  color: 'var(--text-muted)',
                                  fontSize: 12,
                                  cursor: 'pointer',
                                  textDecoration: 'underline',
                                }}
                              >
                                {t('main.createProject.useRecommendedSet')}
                              </button>
                            </div>
                          )}
                          <strong
                            style={{
                              display: 'block',
                              marginBottom: 12,
                              fontSize: 12,
                              textTransform: 'uppercase',
                              letterSpacing: 1,
                              color: 'var(--text-muted)',
                            }}
                          >
                            {vm.isDataScience
                              ? vm.createProjectToolchain === 'r'
                                ? t('main.createProject.coreRLibs')
                                : t('main.createProject.corePythonLibs')
                              : t('main.createProject.coreNPMLibs')}
                          </strong>
                          {vm.isDataScience ? (
                            vm.renderDataSciencePackageGrid(
                              vm.createProjectToolchain === 'r'
                                ? expertRPackages('r')
                                : expertPythonPackages(vm.createProjectToolchain)
                            )
                          ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                              {[
                                'tailwindcss',
                                'react-router-dom',
                                'axios',
                                'zod',
                                'framer-motion',
                                'lucide-react',
                                'zustand',
                                'react-query',
                              ].map((dep) => (
                                <div
                                  key={dep}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    background: Object.keys(vm.createProjectDeps).includes(dep)
                                      ? `${vm.selectedProfile.accent}20`
                                      : 'rgba(255,255,255,0.02)',
                                    padding: '6px 12px',
                                    borderRadius: 6,
                                    border: `1px solid ${Object.keys(vm.createProjectDeps).includes(dep) ? vm.selectedProfile.accent : 'rgba(255,255,255,0.05)'}`,
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={Object.keys(vm.createProjectDeps).includes(dep)}
                                    onChange={(e) => {
                                      if (e.target.checked)
                                        vm.setCreateProjectDeps({
                                          ...vm.createProjectDeps,
                                          [dep]: 'latest',
                                        })
                                      else {
                                        const newDeps = { ...vm.createProjectDeps }
                                        delete newDeps[dep]
                                        vm.setCreateProjectDeps(newDeps)
                                      }
                                    }}
                                    style={{
                                      width: 16,
                                      height: 16,
                                      accentColor: vm.selectedProfile.accent,
                                    }}
                                  />
                                  <span style={{ fontSize: 14 }}>{dep}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {vm.installedEditors.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <strong
                          style={{
                            display: 'block',
                            marginBottom: 8,
                            fontSize: 13,
                            color: 'var(--text-muted)',
                          }}
                        >
                          {t('main.createProject.preferredEditor')}
                        </strong>
                        <select
                          value={vm.selectedEditorCmd}
                          onChange={(e) => {
                            vm.setSelectedEditorCmd(e.target.value)
                            persistPreferredEditorCmd(e.target.value)
                          }}
                          style={{
                            width: '100%',
                            padding: '12px 16px',
                            borderRadius: 8,
                            border: '1px solid rgba(255,255,255,0.1)',
                            background: 'rgba(0,0,0,0.2)',
                            color: 'var(--text)',
                            fontSize: 16,
                            outline: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          {vm.installedEditors.map((ed) => (
                            <option key={ed.name} value={ed.cmd}>
                              {ed.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div
                      style={{
                        marginBottom: 8,
                        paddingTop: 16,
                        borderTop: '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={vm.createProjectAutoInstall}
                          onChange={(e) => vm.setCreateProjectAutoInstall(e.target.checked)}
                          style={{ width: 16, height: 16, accentColor: vm.selectedProfile.accent }}
                        />
                        <span style={{ fontWeight: 600, fontSize: 14, color: '#fff' }}>
                          {t('main.createProject.autoInstall')}
                        </span>
                      </label>
                      <p
                        style={{ margin: '6px 0 0 28px', fontSize: 12, color: 'var(--text-muted)' }}
                      >
                        {vm.isDataScience && vm.createProjectDepsMode === 'beginner'
                          ? t('main.createProject.autoInstallBeginner')
                          : t('main.createProject.autoInstallDesc', {
                              lockfile: vm.isDataScience
                                ? vm.createProjectToolchain === 'both'
                                  ? t('main.createProject.lockfileBoth')
                                  : vm.createProjectToolchain === 'r'
                                    ? t('main.createProject.installR')
                                    : t('main.createProject.requirementsTxt')
                                : t('main.createProject.packageJson'),
                            })}
                      </p>
                    </div>
                  </div>
                )}

                <div
                  style={{
                    display: 'flex',
                    gap: 12,
                    justifyContent: 'flex-end',
                    borderTop: '1px solid rgba(255,255,255,0.1)',
                    paddingTop: 20,
                    marginTop: 16,
                  }}
                >
                  <button
                    type="button"
                    onClick={vm.closeCreateProjectModal}
                    style={{
                      padding: '10px 20px',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: 14,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#fff'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--text-muted)'
                    }}
                  >
                    {t('main.createProject.cancel')}
                  </button>

                  {vm.createProjectStep > 1 && (
                    <button
                      type="button"
                      onClick={() => vm.setCreateProjectStep((s) => s - 1)}
                      style={{
                        padding: '10px 24px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 6,
                        background: 'rgba(255,255,255,0.05)',
                        color: 'var(--text)',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: 14,
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                      }}
                    >
                      {t('main.createProject.back')}
                    </button>
                  )}

                  {vm.createProjectStep < 3 ? (
                    <button
                      type="button"
                      onClick={() => vm.setCreateProjectStep((s) => s + 1)}
                      disabled={vm.createProjectStep === 1 && !vm.createProjectName.trim()}
                      style={{
                        padding: '10px 24px',
                        border: 'none',
                        borderRadius: 6,
                        background:
                          vm.createProjectStep === 1 && !vm.createProjectName.trim()
                            ? 'rgba(255,255,255,0.1)'
                            : vm.selectedProfile.accent,
                        color:
                          vm.createProjectStep === 1 && !vm.createProjectName.trim()
                            ? 'var(--text-muted)'
                            : '#fff',
                        cursor:
                          vm.createProjectStep === 1 && !vm.createProjectName.trim()
                            ? 'not-allowed'
                            : 'pointer',
                        fontWeight: 600,
                        fontSize: 14,
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {t('main.createProject.next')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={vm.submitCreateProject}
                      style={{
                        padding: '10px 24px',
                        border: 'none',
                        borderRadius: 6,
                        background: vm.selectedProfile.accent,
                        color: '#fff',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: 14,
                        boxShadow: `0 4px 12px ${vm.selectedProfile.accent}40`,
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-1px)'
                        e.currentTarget.style.boxShadow = `0 6px 16px ${vm.selectedProfile.accent}60`
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow = `0 4px 12px ${vm.selectedProfile.accent}40`
                      }}
                    >
                      {t('main.createProject.scaffoldProject')}
                    </button>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
  )
}
