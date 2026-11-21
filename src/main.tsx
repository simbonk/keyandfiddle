import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { keepScreenAwake } from './ui/keepAwake';
import { trackAppHeight } from './ui/viewport';

keepScreenAwake();
trackAppHeight();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
