import React, { createContext, useContext, useReducer, useCallback } from 'react';

const TaskContext = createContext();

// ======================================================
// TASK CONTEXT
// Owns: frontend mission synchronization cache
// Must NOT: define behavioral truth or lifecycle rules
// ======================================================

const initialState = {
  missions: [],
  loading: false,
  error: null
};

const taskReducer = (state, action) => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload, error: null };
    case 'SET_MISSIONS':
      return { ...state, missions: action.payload, loading: false, error: null };
    case 'ADD_MISSION':
      return { ...state, missions: [action.payload, ...state.missions] };
    case 'UPDATE_MISSION':
      return {
        ...state,
        missions: state.missions.map(m =>
          m._id === action.payload._id ? action.payload : m
        )
      };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    default:
      return state;
  }
};

export const TaskProvider = ({ children }) => {
  const [state, dispatch] = useReducer(taskReducer, initialState);

  const setLoading = useCallback((val) => dispatch({ type: 'SET_LOADING', payload: val }), []);
  const setMissions = useCallback((data) => dispatch({ type: 'SET_MISSIONS', payload: data }), []);
  const addMission = useCallback((m) => dispatch({ type: 'ADD_MISSION', payload: m }), []);
  const updateMission = useCallback((m) => dispatch({ type: 'UPDATE_MISSION', payload: m }), []);
  const setError = useCallback((msg) => dispatch({ type: 'SET_ERROR', payload: msg }), []);

  return (
    <TaskContext.Provider value={{
      ...state,
      setLoading,
      setMissions,
      addMission,
      updateMission,
      setError
    }}>
      {children}
    </TaskContext.Provider>
  );
};

export const useTaskContext = () => useContext(TaskContext);
