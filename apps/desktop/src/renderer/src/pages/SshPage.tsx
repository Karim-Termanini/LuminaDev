import type { ReactElement } from 'react'
import { SshLeftColumn } from './ssh/SshLeftColumn'
import { SshModals } from './ssh/SshModals'
import { SshRightColumn } from './ssh/SshRightColumn'
import { useSshPage } from './ssh/useSshPage'
import './SshPage.css'

export function SshPage(): ReactElement {
  const vm = useSshPage()

  return (
    <div className="ssh-page elevated-page">
      <SshLeftColumn
        t={vm.t}
        enableLocalLog={vm.enableLocalLog}
        enableLocalBusy={vm.enableLocalBusy}
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
