import { Router, Request, Response, NextFunction } from 'express';
import { GetCustomerBillsUseCase } from '../../application/use-cases/index.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();
const getBillsUseCase = new GetCustomerBillsUseCase();

router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customerId = (req.query['customerId'] as string) || req.user!.userId;
    const limit = req.query['limit'] ? Number(req.query['limit']) : 12;

    const data = await getBillsUseCase.execute(customerId, limit);
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    next(err);
  }
});

export const billsRoutes = router;
