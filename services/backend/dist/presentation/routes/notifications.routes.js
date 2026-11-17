import { Router } from 'express';
import { optionalAuthenticate } from '../middleware/authenticate.js';
const router = Router();
router.get('/', optionalAuthenticate, async (_req, res, next) => {
    try {
        const notifications = [
            {
                id: 'notif-01',
                title: 'Collection Session Synced',
                message: 'Shift intake data synchronized with central database.',
                type: 'INFO',
                read: true,
                createdAt: new Date().toISOString(),
            },
        ];
        res.json({ success: true, count: notifications.length, data: notifications });
    }
    catch (err) {
        next(err);
    }
});
router.post('/:id/read', optionalAuthenticate, async (_req, res, next) => {
    try {
        res.json({ success: true, message: 'Notification marked as read' });
    }
    catch (err) {
        next(err);
    }
});
export const notificationsRoutes = router;
//# sourceMappingURL=notifications.routes.js.map