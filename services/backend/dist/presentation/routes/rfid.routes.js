import { Router } from 'express';
import { LookupRfidCustomerUseCase } from '../../application/use-cases/index.js';
import { PostgresCustomerRepository } from '../../infrastructure/index.js';
import { optionalAuthenticate } from '../middleware/authenticate.js';
const router = Router();
const customerRepo = new PostgresCustomerRepository();
const lookupRfid = new LookupRfidCustomerUseCase(customerRepo);
router.get('/lookup', optionalAuthenticate, async (req, res, next) => {
    try {
        const cardUid = (req.query['uid'] || req.query['cardUid'] || req.query['tag']);
        const organizationId = req.user?.organizationId || req.query['organizationId'];
        const customer = await lookupRfid.execute(cardUid, organizationId);
        res.json({ success: true, data: customer });
    }
    catch (err) {
        next(err);
    }
});
router.get('/lookup/:uid', optionalAuthenticate, async (req, res, next) => {
    try {
        const uid = req.params.uid;
        const cardUid = (Array.isArray(uid) ? uid[0] : uid) || '';
        const organizationId = req.user?.organizationId || req.query['organizationId'];
        const customer = await lookupRfid.execute(cardUid, organizationId);
        res.json({ success: true, data: customer });
    }
    catch (err) {
        next(err);
    }
});
export const rfidRoutes = router;
//# sourceMappingURL=rfid.routes.js.map