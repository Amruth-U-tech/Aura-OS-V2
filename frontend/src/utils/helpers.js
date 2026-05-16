// ======================================================
// HELPER FUNCTIONS
// Pure functions for formatting, parsing, etc.
// ======================================================

export const formatTime = (date) => {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: 'numeric',
  }).format(new Date(date));
};
