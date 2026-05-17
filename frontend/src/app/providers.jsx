import { ThemeProvider } from '@context/ThemeContext';
import { OverlayProvider } from '@context/OverlayContext';
import { UserProvider } from '@context/UserContext';
import { AuthProvider } from '@context/AuthContext';
import { TaskProvider } from '@context/TaskContext';
// Phase 3.0 — Realtime Transport
import { SocketProvider } from '@context/SocketContext';

// ======================================================
// PROVIDERS WRAPPER
// Keeps App.jsx clean by abstracting context wrapping
// Phase 3.0: SocketProvider INSIDE AuthProvider (needs token)
// ======================================================

const Providers = ({ children }) => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SocketProvider>
          <TaskProvider>
            <UserProvider>
              <OverlayProvider>
                {children}
              </OverlayProvider>
            </UserProvider>
          </TaskProvider>
        </SocketProvider>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default Providers;
