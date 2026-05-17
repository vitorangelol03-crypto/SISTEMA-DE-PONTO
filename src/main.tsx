import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { CompanyProvider } from './contexts/CompanyContext';
import './i18n'; // Sub-fase 17.5: inicializa i18next antes do React render
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CompanyProvider>
      <App />
    </CompanyProvider>
  </StrictMode>
);
