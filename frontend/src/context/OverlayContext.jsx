import { createContext, useState, useContext } from 'react';

const OverlayContext = createContext();

// ======================================================
// OVERLAY CONTEXT
// Manages modals, toasts, and global UI overlays
// ======================================================

export const OverlayProvider = ({ children }) => {
  const [overlays, setOverlays] = useState([]);

  const addOverlay = (overlay) => {
    setOverlays(prev => [...prev, overlay]);
  };

  const removeOverlay = (id) => {
    setOverlays(prev => prev.filter(o => o.id !== id));
  };

  return (
    <OverlayContext.Provider value={{ overlays, addOverlay, removeOverlay }}>
      {children}
    </OverlayContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useOverlay = () => useContext(OverlayContext);
