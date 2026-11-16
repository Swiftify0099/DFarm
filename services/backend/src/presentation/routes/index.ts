import { Router } from 'express';
import { authRoutes } from './auth.routes.js';
import { collectionRoutes } from './collections.routes.js';
import { customerRoutes } from './customers.routes.js';
import { rfidRoutes } from './rfid.routes.js';
import { identityRoutes } from './identity.routes.js';
import { ledgerRoutes } from './ledger.routes.js';
import { billsRoutes } from './bills.routes.js';
import { devicesRoutes } from './devices.routes.js';
import { syncRoutes } from './sync.routes.js';
import { dairiesRoutes } from './dairies.routes.js';

export const cleanApiRouter = Router();

cleanApiRouter.use('/auth', authRoutes);
cleanApiRouter.use('/collections', collectionRoutes);
cleanApiRouter.use('/collection', collectionRoutes); // Aliased for Customer App contract (/api/v1/collection/history)
cleanApiRouter.use('/customers', customerRoutes);
cleanApiRouter.use('/rfid', rfidRoutes);
cleanApiRouter.use('/identity', identityRoutes);
cleanApiRouter.use('/ledger', ledgerRoutes);
cleanApiRouter.use('/bills', billsRoutes);
cleanApiRouter.use('/devices', devicesRoutes);
cleanApiRouter.use('/sync', syncRoutes);
cleanApiRouter.use('/dairies', dairiesRoutes);

export * from './auth.routes.js';
export * from './collections.routes.js';
export * from './customers.routes.js';
export * from './rfid.routes.js';
export * from './identity.routes.js';
export * from './ledger.routes.js';
export * from './bills.routes.js';
export * from './devices.routes.js';
export * from './sync.routes.js';
export * from './dairies.routes.js';
