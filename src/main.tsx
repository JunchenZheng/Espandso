import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { I18nProvider } from "./i18n/I18nProvider";
import { installGlobalContextMenuBlocker } from "./logic/contextMenu";

if (import.meta.env.VITE_EXPANDSO_E2E === "1") {
  void import("@wdio/tauri-plugin");
}

installGlobalContextMenuBlocker();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>,
);
