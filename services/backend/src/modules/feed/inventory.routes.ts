import { Router } from 'express';
import { InventoryController } from './inventory.controller.js';
import { authenticate } from '../../middleware/authenticate.js';

export const inventoryRouter = Router();

// All inventory routes require authentication
inventoryRouter.use(authenticate);

// Inventory
inventoryRouter.get('/', InventoryController.getInventory);
inventoryRouter.get('/movements', InventoryController.getMovements);
inventoryRouter.post('/adjustments', InventoryController.adjustStock);
inventoryRouter.post('/transfers', InventoryController.transferStock);
inventoryRouter.get('/reports', InventoryController.getReports);

