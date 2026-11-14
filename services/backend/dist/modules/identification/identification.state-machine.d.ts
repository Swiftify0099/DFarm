import { IdentificationState, IdentificationMethod, VerificationOutcome, type IdentificationSessionDTO } from '@dfarm/shared-types';
export declare class IdentificationStateMachine {
    private static readonly VALID_TRANSITIONS;
    /**
     * Validate state transition.
     */
    static canTransition(current: IdentificationState, next: IdentificationState): boolean;
    static assertTransition(current: IdentificationState, next: IdentificationState): void;
}
/**
 * In-memory identification session store for tracking multi-step intake sessions.
 */
export declare class IdentificationSessionStore {
    private static readonly sessions;
    static createSession(params: {
        sessionId?: string;
        organizationId: string;
        centerId: string;
        deviceId: string;
        initialState?: IdentificationState;
    }): IdentificationSessionDTO;
    static getSession(sessionId: string): IdentificationSessionDTO | null;
    static getOrCreateSession(params: {
        sessionId?: string;
        organizationId: string;
        centerId: string;
        deviceId: string;
    }): IdentificationSessionDTO;
    /**
     * Transition session state and update resolved identity.
     */
    static transition(params: {
        sessionId: string;
        nextState: IdentificationState;
        method?: IdentificationMethod;
        outcome: VerificationOutcome;
        resolvedCustomerUuid?: string | null;
        customerName?: string | null;
        farmerCode?: string | null;
        details?: Record<string, unknown>;
    }): IdentificationSessionDTO;
    static clear(): void;
}
//# sourceMappingURL=identification.state-machine.d.ts.map