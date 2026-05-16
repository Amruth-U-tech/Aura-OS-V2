import { ThemeProvider } from '@context/ThemeContext';
import { OverlayProvider } from '@context/OverlayContext';
import { UserProvider } from '@context/UserContext';
import { AuthProvider } from '@context/AuthContext';
import { TaskProvider } from '@context/TaskContext';

// ======================================================
// PROVIDERS WRAPPER
// Keeps App.jsx clean by abstracting context wrapping
// ======================================================

const Providers = ({ children }) => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <TaskProvider>
          <UserProvider>
            <OverlayProvider>
              {children}
            </OverlayProvider>
          </UserProvider>
        </TaskProvider>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default Providers;
