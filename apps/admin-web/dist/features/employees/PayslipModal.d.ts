import React from 'react';
import { type EmployeePayslip } from '@dfarm/shared-types';
interface PayslipModalProps {
    payslip: EmployeePayslip | null;
    isOpen: boolean;
    onClose: () => void;
    onPaymentSuccess?: () => void;
}
export declare const PayslipModal: React.FC<PayslipModalProps>;
export {};
//# sourceMappingURL=PayslipModal.d.ts.map