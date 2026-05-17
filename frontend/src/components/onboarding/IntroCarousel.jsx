
// ======================================================
// INTRO CAROUSEL
// Phase 2 implementation — animated onboarding intro
// ======================================================

const IntroCarousel = ({ onNext }) => (
  <div className="onboarding-intro">
    <h2>Welcome to Aura OS</h2>
    <p>Your behavioral evolution starts here.</p>
    <button onClick={onNext}>Begin</button>
  </div>
);

export default IntroCarousel;
