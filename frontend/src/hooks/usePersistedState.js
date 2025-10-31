import { useState } from 'react';

// Modified to NOT persist - gives clean slate on tab/mode switch
export const usePersistedState = (key, defaultValue) => {
  const [state, setState] = useState(defaultValue);
  return [state, setState];
};
