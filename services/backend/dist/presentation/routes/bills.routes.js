import { Router } from 'express';
import { GetCustomerBillsUseCase } from '../../application/use-cases/index.js';
import { authenticate } from '../middleware/authenticate.js';
const router = Router();
const getBillsUseCase = new GetCustomerBillsUseCase();
router.get('/', authenticate, async (req, res, next) => {
    try {
        const customerId = req.query['customerId'] || req.user.userId;
        const limit = req.query['limit'] ? Number(req.query['limit']) : 12;
        const data = await getBillsUseCase.execute(customerId, limit);
        res.json({ success: true, count: data.length, data });
    }
    catch (err) {
        next(err);
    }
});
export const billsRoutes = router;
//# sourceMappingURL=bills.routes.js.map