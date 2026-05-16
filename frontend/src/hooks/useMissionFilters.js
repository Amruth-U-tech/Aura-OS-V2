import { useState, useCallback } from 'react';

const STATUS_OPTIONS = ['ALL', 'PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED'];
const PRIORITY_OPTIONS = ['ALL', 'LOW', 'NORMAL', 'HIGH', 'ELITE'];

// ======================================================
// USE MISSION FILTERS HOOK
// Owns: frontend filter state management
// Produces filter params consumed by useTasks
// ======================================================

export const useMissionFilters = () => {
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');

  const activeFilters = {};
  if (statusFilter !== 'ALL') activeFilters.status = statusFilter;
  if (priorityFilter !== 'ALL') activeFilters.priority = priorityFilter;

  const resetFilters = useCallback(() => {
    setStatusFilter('ALL');
    setPriorityFilter('ALL');
  }, []);

  return {
    statusFilter,
    priorityFilter,
    setStatusFilter,
    setPriorityFilter,
    activeFilters,
    resetFilters,
    STATUS_OPTIONS,
    PRIORITY_OPTIONS
  };
};
