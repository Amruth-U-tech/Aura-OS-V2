import React from 'react';
import { useOnboardingFlow } from '@hooks/useOnboardingFlow';
import IntroCarousel from '@components/onboarding/IntroCarousel';
import PlayerProfileForm from '@components/onboarding/PlayerProfileForm';
import DisciplineTimeSetup from '@components/onboarding/DisciplineTimeSetup';

// ======================================================
// ONBOARDING PAGE
// Orchestrates multi-step onboarding flow
// Uses useOnboardingFlow for step state management
// ======================================================

const OnboardingPage = () => {
  const flow = useOnboardingFlow();

  const renderStep = () => {
    switch (flow.currentStep) {
      case 'INTRO':
        return <IntroCarousel onNext={flow.goToNext} />;
      case 'PROFILE':
        return (
          <PlayerProfileForm
            onNext={flow.goToNext}
            onBack={flow.goToPrev}
            updateData={flow.updateProfileData}
          />
        );
      case 'DISCIPLINE_SETUP':
        return (
          <DisciplineTimeSetup
            onNext={flow.goToNext}
            onBack={flow.goToPrev}
            updateData={flow.updateProfileData}
          />
        );
      case 'COMPLETE':
        return <div className="onboarding-complete"><h2>You're all set.</h2></div>;
      default:
        return null;
    }
  };

  return (
    <div className="page onboarding">
      {renderStep()}
    </div>
  );
};

export default OnboardingPage;
