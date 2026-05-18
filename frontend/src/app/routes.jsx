import { Routes, Route, Navigate } from 'react-router-dom';
import { ROUTES } from '@utils/constants';
import ProtectedRoute from '@components/auth/ProtectedRoute';
import AppLayout from '@components/layout/AppLayout';

// Pages
import DashboardPage from '@/pages/DashboardPage';
import FocusPage from '@/pages/FocusPage';
import DisciplinePage from '@/pages/DisciplinePage';
import ProfilePage from '@/pages/ProfilePage';
import AuthPage from '@/pages/AuthPage';
import DiscordCallbackPage from '@/pages/DiscordCallbackPage'; // Phase D1
import OnboardingPage from '@/pages/OnboardingPage';

// Phase 2.2 Pages
import ChallengesPage from '@/pages/ChallengesPage';
import HubsPage from '@/pages/HubsPage';
import HubDetailPage from '@/pages/HubDetailPage';
import RewardsPage from '@/pages/RewardsPage';
import LeaderboardPage from '@/pages/LeaderboardPage';
import FriendsPage from '@/pages/FriendsPage';

// Phase 2.4.2 Pages
import PlayerProfilePage from '@/pages/PlayerProfilePage';
import VouchersPage from '@/pages/VouchersPage';

// ======================================================
// ROUTING DEFINITION — Phase 2.4.2
// Protected routes gate ALL mission-system pages
// /auth is the only public entry point
// Phase 2.4.2: Added /player/:auraPlayerId, /vouchers
// ======================================================

const AppRoutes = () => {
  return (
    <Routes>
      {/* ── Public Routes ───────────────────────────── */}
      <Route path={ROUTES.AUTH} element={<AuthPage />} />
      <Route path={ROUTES.DISCORD_CALLBACK} element={<DiscordCallbackPage />} />

      {/* ── Redirect /login → /auth ──────────────────── */}
      <Route path={ROUTES.LOGIN} element={<Navigate to={ROUTES.AUTH} replace />} />

      {/* ── Protected Routes (wrapped in AppLayout) ──── */}
      <Route element={
        <ProtectedRoute>
          <AppLayout />
        </ProtectedRoute>
      }>
        <Route path={ROUTES.DASHBOARD} element={<DashboardPage />} />
        <Route path={ROUTES.FOCUS} element={<FocusPage />} />
        <Route path={ROUTES.DISCIPLINE} element={<DisciplinePage />} />
        <Route path={ROUTES.PROFILE} element={<ProfilePage />} />
        <Route path={ROUTES.ONBOARDING} element={<OnboardingPage />} />

        {/* Phase 2.2+ — Domain Routes */}
        <Route path={ROUTES.CHALLENGES} element={<ChallengesPage />} />
        <Route path={ROUTES.HUBS} element={<HubsPage />} />
        <Route path={ROUTES.HUB_DETAIL} element={<HubDetailPage />} />
        <Route path={ROUTES.REWARDS} element={<RewardsPage />} />
        <Route path={ROUTES.LEADERBOARD} element={<LeaderboardPage />} />
        <Route path={ROUTES.FRIENDS} element={<FriendsPage />} />

        {/* Phase 2.4.2 — Public Profile & Vouchers */}
        <Route path={ROUTES.PLAYER_PROFILE} element={<PlayerProfilePage />} />
        <Route path={ROUTES.VOUCHERS} element={<VouchersPage />} />
      </Route>

      {/* ── Catch-all → dashboard (will redirect to /auth if unauthed) ── */}
      <Route path="*" element={<Navigate to={ROUTES.DASHBOARD} replace />} />
    </Routes>
  );
};

export default AppRoutes;
