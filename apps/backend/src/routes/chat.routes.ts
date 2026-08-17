import { Router } from 'express';
import { chatWithDocument, getConversationHistory } from '../controllers/chat.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { chatSchema } from '../utils/schemas';

const router = Router();

router.post('/:documentId', authenticate, validate(chatSchema), chatWithDocument);
router.get('/:documentId', authenticate, getConversationHistory);

export default router;
