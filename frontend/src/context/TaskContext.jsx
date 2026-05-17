import { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import { eventBus } from '@systems/eventBus';
import { eventDedup } from '@utils/eventDedup';
import { safeArray, safeUpdate } from '@utils/stateNormalizers';
import { useAuth } from '@context/AuthContext';

const TaskContext = createContext();

// ======================================================
// TASK CONTEXT — Phase 3.1.1 (Hardened)
// Owns: frontend mission synchronization cache
// Listens to: player.notification (TASK_COMPLETED/FAILED/EXPIRED)
//             socket:reconnected
// Must NOT: define behavioral truth or lifecycle rules
// ======================================================

const initialState = {
  missions: [],    // ALWAYS an array
  loading: false,
  error: null
};

// Normalize a mission object
const normalizeMission = (m) => {
  if (!m || typeof m !== 'object') return null;
  return {
    _id: m._id || m.id || null,
    title: m.title || '',
    description: m.description || '',
    priority: m.priority || 'NORMAL',
    status: m.status || 'PENDING',
    deadline: m.deadline || null,
    completedAt: m.completedAt || null,
    failedAt: m.failedAt || null,
    cancelledAt: m.cancelledAt || null,
    expiredAt: m.expiredAt || null,
    createdAt: m.createdAt || null,
    userId: m.userId || null,
  };
};

const normalizeMissionArray = (payload) => {
  return safeArray(payload).map(normalizeMission).filter(Boolean);
};

const taskReducer = (state, action) => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload, error: null };

    case 'SET_MISSIONS':
      return { ...state, missions: normalizeMissionArray(action.payload), loading: false, error: null };

    case 'ADD_MISSION': {
      const normalized = normalizeMission(action.payload);
      if (!normalized || !normalized._id) return state;
      const exists = state.missions.some(m => m._id === normalized._id);
      if (exists) return state;
      return { ...state, missions: [normalized, ...state.missions] };
    }

    case 'UPDATE_MISSION': {
      const normalized = normalizeMission(action.payload);
      if (!normalized || !normalized._id) return state;
      return { ...state, missions: safeUpdate(state.missions, normalized, '_id') };
    }

    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };

    default:
      return state;
  }
};

export const TaskProvider = ({ children }) => {
  const [state, dispatch] = useReducer(taskReducer, initialState);
  const { authReady, isAuthenticated } = useAuth();
  const mountedRef = useRef(true);

  const setLoading = useCallback((val) => dispatch({ type: 'SET_LOADING', payload: val }), []);
  const setMissions = useCallback((data) => dispatch({ type: 'SET_MISSIONS', payload: data }), []);
  const addMission = useCallback((m) => dispatch({ type: 'ADD_MISSION', payload: m }), []);
  const updateMission = useCallback((m) => dispatch({ type: 'UPDATE_MISSION', payload: m }), []);
  const setError = useCallback((msg) => dispatch({ type: 'SET_ERROR', payload: msg }), []);

  // ── Socket event listeners ─────────────────────────
  useEffect(() => {
    if (!authReady || !isAuthenticated) return;

    const handleNotification = (data) => {
      if (!data?.type) return;
      const taskTypes = ['TASK_COMPLETED', 'TASK_FAILED', 'TASK_EXPIRED'];
      if (taskTypes.includes(data.type)) {
        if (eventDedup.isDuplicate(`task.notification.${data.type}`, data)) return;
        // Just update the status of the matching mission
        if (data.missionId) {
          const statusMap = {
            TASK_COMPLETED: 'COMPLETED',
            TASK_FAILED: 'FAILED',
            TASK_EXPIRED: 'EXPIRED',
          };
          dispatch({
            type: 'UPDATE_MISSION',
            payload: { _id: data.missionId, status: statusMap[data.type] }
          });
        }
      }
    };

    // Phase 3.1.4: Cross-tab task sync — when a task is created in another tab,
    // add it to the local mission list immediately
    const handleTaskCreated = (data) => {
      if (eventDedup.isDuplicate('player.task.created', data)) return;
      if (data?.taskId) {
        dispatch({
          type: 'ADD_MISSION',
          payload: {
            _id: data.taskId,
            title: data.title || '',
            priority: data.priority || 'NORMAL',
            status: data.status || 'PENDING',
            deadline: data.deadline || null,
            createdAt: new Date().toISOString(),
          }
        });
      }
    };

    const unsubs = [
      eventBus.on('player.notification', handleNotification),
      eventBus.on('player.task.created', handleTaskCreated),
    ];

    return () => {
      mountedRef.current = false;
      unsubs.forEach(fn => typeof fn === 'function' && fn());
    };
  }, [authReady, isAuthenticated]);

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

// eslint-disable-next-line react-refresh/only-export-components
export const useTaskContext = () => useContext(TaskContext);
