const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    saveUrl: (url) => ipcRenderer.send('save-url', url),
    getConfig: () => ipcRenderer.invoke('get-config'),
    closeApp: () => ipcRenderer.send('close-app'),
    onLoadUrl: (callback) => ipcRenderer.on('load-url', (_event, value) => callback(value))
});
