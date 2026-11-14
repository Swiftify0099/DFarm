import { z } from 'zod';
import { CreateCustomerInputSchema, UpdateCustomerInputSchema, CustomerQuerySchema, CustomerDeleteSchema, CustomerRestoreSchema, } from '@dfarm/shared-validation';
export const CustomerIdParamSchema = z.object({
    customerId: z.string().uuid('Customer ID must be a valid UUID'),
});
export { CreateCustomerInputSchema, UpdateCustomerInputSchema, CustomerQuerySchema, CustomerDeleteSchema, CustomerRestoreSchema, };
//# sourceMappingURL=customer.schemas.js.map