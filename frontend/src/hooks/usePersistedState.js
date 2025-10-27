import { useState, useEffect } from 'react';

export const usePersistedState = (key, defaultValue) => {
  const [state, setState] = useState(() => {
    try {
      const saved = sessionStorage.getItem(`bankiq_${key}`);
      return saved ? JSON.parse(saved) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(`bankiq_${key}`, JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to persist state:', e);
    }
  }, [key, state]);

  return [state, setState];
};
