import React, { createContext, useContext, useState, useEffect } from 'react';

export interface NetworkContextType {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  setOnlineStatus: (status: boolean) => void;
  setSyncingStatus: (status: boolean) => void;
  updateSyncTimestamp: () => void;
}

const NetworkContext = createContext<NetworkContextType>({
  isOnline: true,
  isSyncing: false,
  lastSyncedAt: null,
  setOnlineStatus: () => {},
  setSyncingStatus: () => {},
  updateSyncTimestamp: () => {},
});

export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(new Date().toISOString());

  const setOnlineStatus = (status: boolean) => {
    setIsOnline(status);
  };

  const setSyncingStatus = (status: boolean) => {
    setIsSyncing(status);
  };

  const updateSyncTimestamp = () => {
    setLastSyncedAt(new Date().toISOString());
  };

  return (
    <NetworkContext.Provider
      value={{
        isOnline,
        isSyncing,
        lastSyncedAt,
        setOnlineStatus,
        setSyncingStatus,
        updateSyncTimestamp,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetwork = () => useContext(NetworkContext);
