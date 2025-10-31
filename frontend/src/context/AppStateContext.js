import React, { createContext, useContext, useState } from 'react';

const AppStateContext = createContext();

export const useAppState = () => {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used within AppStateProvider');
  }
  return context;
};

export const AppStateProvider = ({ children }) => {
  // Clean slate - no persistence
  const [peerState, setPeerState] = useState({
    selectedBanks: [],
    comparisonData: null,
    chartData: null,
    loading: false
  });

  const [reportsState, setReportsState] = useState({
    selectedBank: '',
    selectedBankCik: null,
    chatHistory: [],
    reports: { '10-K': [], '10-Q': [] },
    fullReport: '',
    mode: 'live',
    uploadedFiles: [],
    analyzedDocs: []
  });

  const [complianceState, setComplianceState] = useState({
    selectedBank: '',
    selectedBankCik: null,
    complianceData: null,
    aiAnalysis: '',
    alerts: []
  });

  // Reset functions for clean slate
  const resetPeerState = () => {
    setPeerState({
      selectedBanks: [],
      comparisonData: null,
      chartData: null,
      loading: false
    });
  };

  const resetReportsState = () => {
    setReportsState({
      selectedBank: '',
      selectedBankCik: null,
      chatHistory: [],
      reports: { '10-K': [], '10-Q': [] },
      fullReport: '',
      mode: 'live',
      uploadedFiles: [],
      analyzedDocs: []
    });
  };

  const resetComplianceState = () => {
    setComplianceState({
      selectedBank: '',
      selectedBankCik: null,
      complianceData: null,
      aiAnalysis: '',
      alerts: []
    });
  };

  const resetAllState = () => {
    resetPeerState();
    resetReportsState();
    resetComplianceState();
  };

  const value = {
    peerState,
    setPeerState,
    resetPeerState,
    reportsState,
    setReportsState,
    resetReportsState,
    complianceState,
    setComplianceState,
    resetComplianceState,
    resetAllState
  };

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
};
