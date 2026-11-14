import React from 'react';
import { type Employee } from '@dfarm/shared-types';
interface EmployeeRegistrationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (emp: Employee) => void;
}
export declare const EmployeeRegistrationModal: React.FC<EmployeeRegistrationModalProps>;
export {};
//# sourceMappingURL=EmployeeRegistrationModal.d.ts.map