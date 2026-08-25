import { Router } from 'express';
import { searchDocuments } from '../controllers/search.controller';
import { validate } from '../middleware/validate.middleware';
import { searchSchema } from '../utils/schemas';

const router = Router();

// `authenticate` is applied at the mount point in index.ts.
router.get('/', validate(searchSchema), searchDocuments);

export default router;
