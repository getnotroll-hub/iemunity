import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  dbIndex: () => ipcRenderer.invoke('db-index'),
  dbMeasurements: (name, rig, source) => ipcRenderer.invoke('db-measurements', name, rig, source),
  dbTargets: () => ipcRenderer.invoke('db-targets'),
  dbRefresh: () => ipcRenderer.invoke('db-refresh'),
  dbClearMeasurementCache: () => ipcRenderer.invoke('db-clear-measurement-cache'),
  dbCacheInfo: () => ipcRenderer.invoke('db-cache-info'),
  importFile: () => ipcRenderer.invoke('import-file'),
  importUrl: (url) => ipcRenderer.invoke('import-url', url),
  savePreset: (data) => ipcRenderer.invoke('save-preset', data),
  loadPreset: () => ipcRenderer.invoke('load-preset'),
  saveText: (defaultName, data) => ipcRenderer.invoke('save-text', defaultName, data),
  openAudioFile: () => ipcRenderer.invoke('open-audio-file'),
  updateCheck: () => ipcRenderer.invoke('update-check'),
  updateDownload: () => ipcRenderer.invoke('update-download'),
  updateInstall: () => ipcRenderer.invoke('update-install'),
  onUpdateProgress: (cb) => ipcRenderer.on('update-progress', (_e, data) => cb(data))
})
