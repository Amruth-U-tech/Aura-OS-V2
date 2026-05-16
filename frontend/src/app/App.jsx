import { BrowserRouter } from 'react-router-dom';
import Providers from '@/app/providers';
import AppRoutes from '@/app/routes';
import '@styles/globals.css';

// ======================================================
// MAIN APP COMPONENT
// Root rendering and layout shell
// Contains NO business logic or direct API calls
// ======================================================

function App() {
  return (
    <BrowserRouter>
      <Providers>
        <div className="app-shell">
          <AppRoutes />
        </div>
      </Providers>
    </BrowserRouter>
  );
}

export default App;
