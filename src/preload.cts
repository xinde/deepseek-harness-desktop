import { contextBridge, ipcRenderer } from 'electron'

interface LauncherStatus {
  phase: 'locating' | 'installing' | 'building' | 'starting' | 'ready' | 'error'
  message: string
  detail?: string
}

contextBridge.exposeInMainWorld('dshLauncher', {
  chooseRepository: (): Promise<void> => ipcRenderer.invoke('launcher:choose-repository'),
  retry: (): Promise<void> => ipcRenderer.invoke('launcher:retry'),
  openLog: (): Promise<void> => ipcRenderer.invoke('launcher:open-log'),
  onStatus: (listener: (status: LauncherStatus) => void): (() => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, status: LauncherStatus): void => listener(status)
    ipcRenderer.on('launcher:status', wrapped)
    return () => ipcRenderer.removeListener('launcher:status', wrapped)
  },
})
