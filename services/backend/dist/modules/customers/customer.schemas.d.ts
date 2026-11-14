import { z } from 'zod';
import { CreateCustomerInputSchema, UpdateCustomerInputSchema, CustomerQuerySchema, CustomerDeleteSchema, CustomerRestoreSchema } from '@dfarm/shared-validation';
export declare const CustomerIdParamSchema: z.ZodObject<{
    customerId: z.ZodString;
}, z.core.$strip>;
export { CreateCustomerInputSchema, UpdateCustomerInputSchema, CustomerQuerySchema, CustomerDeleteSchema, CustomerRestoreSchema, };
//# sourceMappingURL=customer.schemas.d.ts.map