import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("viaDesktop", {
  loadDraftDefinition: () => ipcRenderer.invoke("load-draft-definition"),
});
