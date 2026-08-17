import { Router } from 'express';
import { searchDocuments } from '../controllers/search.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { searchSchema } from '../utils/schemas';

const router = Router();

router.get('/', authenticate, validate(searchSchema), searchDocuments);

export default router;
