import React, { createContext, useContext, useState, useEffect } from 'react';

const AppStateContext = createContext();

export const useAppState = () => {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used within AppStateProvider');
  }
  return context;
};

const loadState = (key, defaultValue) => {
  try {
    const saved = localStorage.getItem(`bankiq_${key}`);
    return saved ? JSON.parse(saved) : defaultValue;
  } catch {
    return defaultValue;
  }
};

const saveState = (key, value) => {
  try {
    localStorage.setItem(`bankiq_${key}`, JSON.stringify(value));
  } catch (e) {
    console.warn('Failed to save state:', e);
  }
};

export const AppStateProvider = ({ children }) => {
  const [peerState, setPeerState] = useState(() => loadState('peer', {
    selectedBanks: [],
    comparisonData: null,
    chartData: null,
    loading: false
  }));

  const [reportsState, setReportsState] = useState(() => loadState('reports', {
    selectedBank: '',
    selectedBankCik: null,
    chatHistory: [],
    reports: { '10-K': [], '10-Q': [] },
    fullReport: '',
    mode: 'live',
    uploadedFiles: [],
    analyzedDocs: []
  }));

  const [complianceState, setComplianceState] = useState(() => loadState('compliance', {
    selectedBank: '',
    selectedBankCik: null,
    complianceData: null,
    aiAnalysis: '',
    alerts: []
  }));

  useEffect(() => {
    saveState('peer', peerState);
  }, [peerState]);

  useEffect(() => {
    saveState('reports', reportsState);
  }, [reportsState]);

  useEffect(() => {
    saveState('compliance', complianceState);
  }, [complianceState]);

  const value = {
    peerState,
    setPeerState,
    reportsState,
    setReportsState,
    complianceState,
    setComplianceState
  };

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
};
