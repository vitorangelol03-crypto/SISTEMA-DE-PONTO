import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { CompanyProvider } from './contexts/CompanyContext';
import './i18n'; // Sub-fase 17.5: inicializa i18next antes do React render
// Fonte do app (07/08/2026, escolha do Victor: Inter).
// EMBARCADA no projeto de propósito — nada de CDN: se a internet do galpão oscilar, a
// letra não muda no meio do expediente e a tela não "pisca" trocando de fonte ao carregar.
// O arquivo traz os 7 subsets com `unicode-range`, então o navegador baixa SÓ o latino
// (~48 KB, uma vez, e fica em cache) — o português inteiro cabe nele.
import '@fontsource-variable/inter';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CompanyProvider>
      <App />
    </CompanyProvider>
  </StrictMode>
);
