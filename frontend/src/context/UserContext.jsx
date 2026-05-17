import { createContext, useState, useContext } from 'react';

const UserContext = createContext();

// ======================================================
// USER CONTEXT
// Manages authentication state and global user profile
// ======================================================

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  return (
    <UserContext.Provider value={{ user, setUser }}>
      {children}
    </UserContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useUser = () => useContext(UserContext);
