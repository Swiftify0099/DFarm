import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../api/authApi.js';
const AuthContext = createContext(undefined);
export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('dfarm_auth_token');
        }
        return null;
    });
    const [isLoading, setIsLoading] = useState(true);
    const [selectedCenterId, setSelectedCenterId] = useState('');
    const [selectedShift, setSelectedShift] = useState(() => {
        const hours = new Date().getHours();
        return hours >= 15 ? 'EVENING' : 'MORNING';
    });
    const [selectedDate, setSelectedDate] = useState(() => {
        return new Date().toISOString().split('T')[0];
    });
    const [centers, setCenters] = useState([]);
    const logout = useCallback(() => {
        if (typeof window !== 'undefined') {
            localStorage.removeItem('dfarm_auth_token');
            localStorage.removeItem('dfarm_user');
        }
        setUser(null);
        setToken(null);
    }, []);
    const initAuth = useCallback(async () => {
        const savedToken = localStorage.getItem('dfarm_auth_token');
        if (!savedToken) {
            setIsLoading(false);
            return;
        }
        try {
            const me = await authApi.getMe();
            const cachedUserStr = localStorage.getItem('dfarm_user');
            const cachedUser = cachedUserStr ? JSON.parse(cachedUserStr) : null;
            const fullUser = {
                id: me.internalId,
                organizationId: me.organizationId,
                role: me.role,
                primaryCenterId: me.primaryCenterId,
                fullName: cachedUser?.fullName || 'Staff User',
                username: cachedUser?.username || 'staff',
                email: cachedUser?.email,
                phoneNumber: cachedUser?.phoneNumber,
            };
            setUser(fullUser);
            setToken(savedToken);
            if (me.primaryCenterId && !selectedCenterId) {
                setSelectedCenterId(me.primaryCenterId);
            }
        }
        catch {
            logout();
        }
        finally {
            setIsLoading(false);
        }
    }, [logout, selectedCenterId]);
    useEffect(() => {
        initAuth();
        const handleUnauthorized = () => {
            logout();
        };
        window.addEventListener('dfarm:unauthorized', handleUnauthorized);
        return () => {
            window.removeEventListener('dfarm:unauthorized', handleUnauthorized);
        };
    }, [initAuth, logout]);
    // Load Centers for Organization
    useEffect(() => {
        async function loadCenters() {
            if (!token)
                return;
            let centerList = [];
            try {
                const loadedCenters = await authApi.getCenters();
                if (loadedCenters && loadedCenters.length > 0) {
                    centerList = loadedCenters;
                }
            }
            catch {
                // Fallback centers
            }
            if (centerList.length === 0) {
                centerList = [
                    { id: '84997d76-5a80-4935-81d6-433119b5a882', code: 'C101', name: 'Tasgaon Intake Center' },
                    { id: '98a80860-0c1b-47c0-936c-528a262490bd', code: 'C102', name: 'Miraj Intake Center' },
                    { id: '96afbfae-2b1a-42ef-8bb0-779c70950fc5', code: 'C201', name: 'Karveer Intake Center' },
                    { id: '11111111-1111-4111-a111-111111111111', code: 'P11_C1', name: 'P11 Primary Center' },
                ];
            }
            setCenters(centerList);
            setSelectedCenterId((prev) => prev || user?.primaryCenterId || (centerList[0]?.id ?? ''));
        }
        loadCenters();
    }, [token, user?.primaryCenterId]);
    const login = async (username) => {
        setIsLoading(true);
        try {
            const resp = await authApi.login(username);
            localStorage.setItem('dfarm_auth_token', resp.token);
            localStorage.setItem('dfarm_user', JSON.stringify(resp.user));
            setToken(resp.token);
            setUser(resp.user);
            if (resp.user.primaryCenterId) {
                setSelectedCenterId(resp.user.primaryCenterId);
            }
        }
        finally {
            setIsLoading(false);
        }
    };
    const hasRole = (allowedRoles) => {
        if (!user || !user.role)
            return false;
        const r = user.role.toUpperCase();
        if (r === 'SUPER_ADMIN')
            return true;
        return allowedRoles.some((ar) => ar.toUpperCase() === r);
    };
    const isAdmin = Boolean(user && (user.role === 'SUPER_ADMIN' || user.role === 'DAIRY_OWNER' || user.role === 'DAIRY_ADMIN'));
    const isManager = Boolean(user && user.role === 'CENTER_MANAGER');
    const isSupervisor = Boolean(user && user.role === 'SUPERVISOR');
    const isAccountant = Boolean(user && user.role === 'ACCOUNTANT');
    return (_jsx(AuthContext.Provider, { value: {
            user,
            token,
            role: user?.role || null,
            organizationId: user?.organizationId || null,
            isLoading,
            loading: isLoading,
            isAuthenticated: Boolean(user && token),
            selectedCenterId,
            currentCenterId: selectedCenterId || user?.primaryCenterId || (centers.length > 0 ? centers[0].id : ''),
            setSelectedCenterId,
            selectedShift,
            setSelectedShift,
            selectedDate,
            businessDate: selectedDate,
            setSelectedDate,
            setBusinessDate: setSelectedDate,
            centers,
            login,
            logout,
            hasRole,
            isAdmin,
            isManager,
            isSupervisor,
            isAccountant,
        }, children: children }));
};
export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return ctx;
}
//# sourceMappingURL=AuthContext.js.map