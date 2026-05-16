import React, { createContext, useState, useContext } from 'react';

const ThemeContext = createContext();

// ======================================================
// THEME CONTEXT
// Manages global theme state (dark/light mode)
// ======================================================

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState('dark'); // Default dark mode

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <div className={`theme-${theme}`}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
