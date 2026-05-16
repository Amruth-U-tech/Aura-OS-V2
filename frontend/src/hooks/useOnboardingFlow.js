import { useState, useCallback } from 'react';

// ======================================================
// USE ONBOARDING FLOW HOOK
// Manages step transitions for the onboarding UI
// Must NOT: contain backend logic — delegates to APIs
// ======================================================

const STEPS = ['INTRO', 'PROFILE', 'DISCIPLINE_SETUP', 'COMPLETE'];

export const useOnboardingFlow = () => {
  const [currentStep, setCurrentStep] = useState('INTRO');
  const [profileData, setProfileData] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const currentIndex = STEPS.indexOf(currentStep);

  const goToNext = useCallback(() => {
    const next = STEPS[currentIndex + 1];
    if (next) setCurrentStep(next);
  }, [currentIndex]);

  const goToPrev = useCallback(() => {
    const prev = STEPS[currentIndex - 1];
    if (prev) setCurrentStep(prev);
  }, [currentIndex]);

  const updateProfileData = useCallback((partial) => {
    setProfileData(prev => ({ ...prev, ...partial }));
  }, []);

  return {
    currentStep,
    profileData,
    isSubmitting,
    setIsSubmitting,
    error,
    setError,
    goToNext,
    goToPrev,
    updateProfileData,
    isFirst: currentIndex === 0,
    isLast: currentIndex === STEPS.length - 1
  };
};
