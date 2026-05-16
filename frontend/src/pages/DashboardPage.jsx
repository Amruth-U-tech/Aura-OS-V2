import React, { useState } from 'react';
import { useTasks } from '@hooks/useTasks';
import { useMissionFilters } from '@hooks/useMissionFilters';
import { useBackendStatus } from '@hooks/useBackendStatus';
import TaskForm from '@components/tasks/TaskForm';
import TaskList from '@components/tasks/TaskList';
import TaskFilters from '@components/tasks/TaskFilters';

// ======================================================
// DASHBOARD PAGE
// Assembles the mission lifecycle UI
// Coordinates useTasks, useMissionFilters, TaskForm, TaskList
// ======================================================

const DashboardPage = () => {
  const {
    statusFilter, priorityFilter,
    setStatusFilter, setPriorityFilter,
    activeFilters, STATUS_OPTIONS, PRIORITY_OPTIONS
  } = useMissionFilters();

  const {
    missions, loading, error,
    createMission, completeMission, cancelMission, failMission
  } = useTasks(activeFilters);

  const { isOnline } = useBackendStatus();
  const [formError, setFormError] = useState(null);
  const [creating, setCreating] = useState(false);

  const handleCreate = async (formData) => {
    setFormError(null);
    setCreating(true);
    try {
      await createMission(formData);
    } catch (err) {
      setFormError(err.response?.data?.message || err.message || 'Failed to create mission');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '720px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800 }}>Mission Control</h1>
        {!isOnline && (
          <p style={{ color: '#f87171', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            ⚠ Backend offline — actions unavailable
          </p>
        )}
      </div>

      {/* Mission Creation Form */}
      <section style={{ marginBottom: '2rem' }}>
        <TaskForm
          onSubmit={handleCreate}
          loading={creating}
          error={formError}
        />
      </section>

      {/* Filters */}
      <TaskFilters
        statusFilter={statusFilter}
        priorityFilter={priorityFilter}
        onStatusChange={setStatusFilter}
        onPriorityChange={setPriorityFilter}
        STATUS_OPTIONS={STATUS_OPTIONS}
        PRIORITY_OPTIONS={PRIORITY_OPTIONS}
      />

      {/* Mission List */}
      {loading ? (
        <p style={{ opacity: 0.6, textAlign: 'center' }}>Loading missions...</p>
      ) : (
        <TaskList
          missions={missions}
          statusFilter={statusFilter}
          onComplete={completeMission}
          onCancel={cancelMission}
          onFail={failMission}
        />
      )}
    </div>
  );
};

export default DashboardPage;
