import React, { ReactNode } from 'react';
import { StaffUser } from '../api/authApi.js';
import { UserRole } from '@dfarm/shared-types';
export interface CenterOption {
    id: string;
    name: string;
    code: string;
}
export interface AuthContextValue {
    user: StaffUser | null;
    token: string | null;
    role: string | null;
    organizationId: string | null;
    isLoading: boolean;
    loading: boolean;
    isAuthenticated: boolean;
    selectedCenterId: string;
    currentCenterId: string;
    setSelectedCenterId: (id: string) => void;
    selectedShift: 'MORNING' | 'EVENING';
    setSelectedShift: (shift: 'MORNING' | 'EVENING') => void;
    selectedDate: string;
    businessDate: string;
    setSelectedDate: (date: string) => void;
    setBusinessDate: (date: string) => void;
    centers: CenterOption[];
    login: (username: string) => Promise<void>;
    logout: () => void;
    hasRole: (allowedRoles: (UserRole | string)[]) => boolean;
    isAdmin: boolean;
    isManager: boolean;
    isSupervisor: boolean;
    isAccountant: boolean;
}
export declare const AuthProvider: React.FC<{
    children: ReactNode;
}>;
export declare function useAuth(): AuthContextValue;
//# sourceMappingURL=AuthContext.d.ts.map