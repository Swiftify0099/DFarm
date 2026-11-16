import { Router } from 'express';
import { GetCustomerKhataSummaryUseCase, GetCustomerLedgerEntriesUseCase, } from '../../application/use-cases/index.js';
import { PostgresLedgerRepository } from '../../infrastructure/index.js';
import { authenticate } from '../middleware/authenticate.js';
const router = Router();
const ledgerRepo = new PostgresLedgerRepository();
const getKhataSummary = new GetCustomerKhataSummaryUseCase(ledgerRepo);
const getLedgerEntries = new GetCustomerLedgerEntriesUseCase(ledgerRepo);
router.get('/summary', authenticate, async (req, res, next) => {
    try {
        const customerId = req.query['customerId'] || req.user.userId;
        const data = await getKhataSummary.execute(customerId);
        res.json({ success: true, data });
    }
    catch (err) {
        next(err);
    }
});
router.get('/entries', authenticate, async (req, res, next) => {
    try {
        const customerId = req.query['customerId'] || req.user.userId;
        const limit = req.query['limit'] ? Number(req.query['limit']) : 50;
        const offset = req.query['offset'] ? Number(req.query['offset']) : 0;
        const data = await getLedgerEntries.execute(customerId, limit, offset);
        res.json({ success: true, count: data.length, data });
    }
    catch (err) {
        next(err);
    }
});
export const ledgerRoutes = router;
//# sourceMappingURL=ledger.routes.js.map