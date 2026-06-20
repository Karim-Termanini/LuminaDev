import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SshSetupWizard } from './ssh/SshSetupWizard'
import { SshLeftColumn } from './ssh/SshLeftColumn'
import { SshModals } from './ssh/SshModals'
import { SshRightColumn } from './ssh/SshRightColumn'
import { useSshPage } from './ssh/useSshPage'
import './SshPage.css'

type WizardStore = { completed?: boolean }

export function SshPage(): ReactElement {
  const [searchParams] = useSearchParams()
  const forceWizard = searchParams.get('wizard') === '1'
  const forceAdvanced = searchParams.get('mode') === 'advanced'
  const parsedStep = Number.parseInt(searchParams.get('step') ?? '', 10)
  const wizardInitialStep =
    Number.isFinite(parsedStep) && parsedStep >= 1 && parsedStep <= 6 ? parsedStep : undefined
  const [mode, setMode] = useState<'loading' | 'wizard' | 'advanced'>('loading')

  useEffect(() => {
    if (forceAdvanced) {
      setMode('advanced')
      return
    }
    if (forceWizard) {
      setMode('wizard')
      return
    }
    void window.dh.storeGet({ key: 'ssh_setup_wizard' }).then((raw) => {
      const completed =
        raw.ok && raw.data && typeof raw.data === 'object'
          ? Boolean((raw.data as WizardStore).completed)
          : false
      setMode(completed ? 'advanced' : 'wizard')
    })
  }, [forceAdvanced, forceWizard])

  if (mode === 'loading') {
    return (
      <div className="ssh-page elevated-page">
        <p className="hp-muted">…</p>
      </div>
    )
  }

  if (mode === 'wizard') {
    return <SshSetupWizard onOpenAdvanced={() => setMode('advanced')} initialStep={wizardInitialStep} />
  }

  return <SshAdvancedPage onOpenWizard={() => setMode('wizard')} />
}

function SshAdvancedPage({ onOpenWizard }: { onOpenWizard: () => void }): ReactElement {
  const vm = useSshPage()

  return (
    <div className="ssh-page elevated-page">
      <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginBottom: -8 }}>
        <button type="button" className="hp-btn" onClick={onOpenWizard}>
          {vm.t('wizard.reopenSetup')}
        </button>
      </div>
      <SshLeftColumn
        t={vm.t}
        enableLocalLog={vm.enableLocalLog}
        enableLocalBusy={vm.enableLocalBusy}
        localSshEnabled={vm.localSshEnabled}
        onEnableLocalSsh={() => void vm.enableLocalSsh()}
        email={vm.email}
        setEmail={vm.setEmail}
        busy={vm.busy}
        onGenerate={() => void vm.generate()}
        pubKey={vm.pubKey}
        fingerprint={vm.fingerprint}
        testOk={vm.testOk}
        testResult={vm.testResult}
        status={vm.status}
        onLoadPubAndCopy={() => void vm.loadPub().then(() => vm.copyPub())}
        onTestGithub={() => void vm.testGithub()}
        newBmName={vm.newBmName}
        setNewBmName={vm.setNewBmName}
        newBmUser={vm.newBmUser}
        setNewBmUser={vm.setNewBmUser}
        newBmHost={vm.newBmHost}
        setNewBmHost={vm.setNewBmHost}
        newBmPort={vm.newBmPort}
        setNewBmPort={vm.setNewBmPort}
        onAddBookmark={vm.addBookmark}
        bookmarks={vm.bookmarks}
        editBmId={vm.editBmId}
        setEditBmId={vm.setEditBmId}
        editBmName={vm.editBmName}
        setEditBmName={vm.setEditBmName}
        editBmUser={vm.editBmUser}
        setEditBmUser={vm.setEditBmUser}
        editBmHost={vm.editBmHost}
        setEditBmHost={vm.setEditBmHost}
        editBmPort={vm.editBmPort}
        setEditBmPort={vm.setEditBmPort}
        onSaveEditBookmark={vm.saveEditBookmark}
        onConnect={(bm) => void vm.handleConnect(bm)}
        onStartEditBookmark={vm.startEditBookmark}
        onDeleteBookmark={(id) => vm.deleteBookmark(id)}
      />

      <SshRightColumn
        t={vm.t}
        connectedCount={vm.connectedCount}
        sessions={vm.sessions}
        showPrereqs={vm.showPrereqs}
        setShowPrereqs={vm.setShowPrereqs}
        onResetFtState={vm.resetFtState}
        onSetActiveTermSession={vm.setActiveTermSession}
        onSetupKeysOnServer={vm.setupKeysOnServer}
        onDisconnect={vm.handleDisconnect}
        onRemoveSession={(id) => vm.setSessions((prev) => prev.filter((s) => s.id !== id))}
      />

      <SshModals
        t={vm.t}
        ftSession={vm.ftSession}
        setFtSession={vm.setFtSession}
        ftDirection={vm.ftDirection}
        setFtDirection={vm.setFtDirection}
        ftTool={vm.ftTool}
        setFtTool={vm.setFtTool}
        ftLocalPaths={vm.ftLocalPaths}
        ftLocalDestDir={vm.ftLocalDestDir}
        ftRemotePath={vm.ftRemotePath}
        setFtRemotePath={vm.setFtRemotePath}
        ftStatus={vm.ftStatus}
        remoteEntries={vm.remoteEntries}
        remoteBrowsing={vm.remoteBrowsing}
        sessions={vm.sessions}
        onResetFtState={vm.resetFtState}
        onPickLocalFiles={() => void vm.pickLocalFiles()}
        onPickLocalDestDir={() => void vm.pickLocalDestDir()}
        onBrowseRemote={(path) => void vm.browseRemote(path)}
        onRunTransfer={vm.runTransfer}
        activeTermSession={vm.activeTermSession}
        setActiveTermSession={vm.setActiveTermSession}
        termWrapRef={vm.termWrapRef}
        passModalSess={vm.passModalSess}
        setPassModalSess={vm.setPassModalSess}
        passInput={vm.passInput}
        setPassInput={vm.setPassInput}
        onRunSetupWithPassword={() => void vm.runSetupWithPassword()}
        busy={vm.busy}
      />
    </div>
  )
}
