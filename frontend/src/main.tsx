import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { useLang } from "./i18n";
import "./styles.css";
import "./features/decisions/decisions.css";
import "./features/arena/theatre.css";

// Remount on language change so every translated string re-renders.
function Root() {
  const lang = useLang();
  return <App key={lang} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  </React.StrictMode>,
);
