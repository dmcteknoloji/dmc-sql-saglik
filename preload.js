const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  testConnection: (c) => ipcRenderer.invoke("test-connection", c),
  install: (c) => ipcRenderer.invoke("install", c),
  openPath: (p) => ipcRenderer.invoke("open-path", p),
  openUrl: (u) => ipcRenderer.invoke("open-url", u),
});
