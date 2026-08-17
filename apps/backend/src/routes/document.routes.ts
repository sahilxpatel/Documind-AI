import { Router } from 'express';
import multer from 'multer';
import { uploadDocument, getUserDocuments } from '../controllers/document.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB limit
  }
});

router.post('/upload', authenticate, upload.single('file'), uploadDocument);
router.get('/', authenticate, getUserDocuments);

export default router;
