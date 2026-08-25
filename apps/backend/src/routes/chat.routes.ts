import { Router } from 'express';
import { chatWithDocument, getConversationHistory } from '../controllers/chat.controller';
import { validate } from '../middleware/validate.middleware';
import { chatSchema, documentIdParamSchema } from '../utils/schemas';

const router = Router();

// `authenticate` is applied at the mount point in index.ts.
router.post('/:documentId', validate(chatSchema), chatWithDocument);
router.get('/:documentId', validate(documentIdParamSchema), getConversationHistory);

export default router;
