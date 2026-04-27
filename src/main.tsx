import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// import './index.css'
import "./styles/base.css";
import "./styles/mitigation-planner.css";
import "./styles/mitigation-planner-light.css";
import App from './App.tsx'
import { I18nProvider } from "./i18n";

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
)
