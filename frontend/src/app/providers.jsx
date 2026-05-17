import { ThemeProvider } from '@context/ThemeContext';
import { OverlayProvider } from '@context/OverlayContext';
import { UserProvider } from '@context/UserContext';
import { AuthProvider } from '@context/AuthContext';
import { TaskProvider } from '@context/TaskContext';
// Phase 3.0 — Realtime Transport
import { SocketProvider } from '@context/SocketContext';
// Phase 3.1.1 — Domain Contexts (realtime-reactive)
import { PlayerProvider } from '@context/PlayerContext';
import { SocialProvider } from '@context/SocialContext';
import { ChallengeProvider } from '@context/ChallengeContext';
import { HubProvider } from '@context/HubContext';

// ======================================================
// PROVIDERS WRAPPER — Phase 3.1.1
// Context dependency order:
//   Auth → Socket → Player → Social → Challenge → Hub → Task
// Socket MUST be inside Auth (needs token)
// Domain contexts MUST be inside Socket (need eventBus bridges)
// ======================================================

const Providers = ({ children }) => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SocketProvider>
          <PlayerProvider>
            <SocialProvider>
              <ChallengeProvider>
                <HubProvider>
                  <TaskProvider>
                    <UserProvider>
                      <OverlayProvider>
                        {children}
                      </OverlayProvider>
                    </UserProvider>
                  </TaskProvider>
                </HubProvider>
              </ChallengeProvider>
            </SocialProvider>
          </PlayerProvider>
        </SocketProvider>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default Providers;
