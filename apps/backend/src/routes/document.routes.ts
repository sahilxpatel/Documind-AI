import { Router } from 'express';
import multer from 'multer';
import { uploadDocument, getUserDocuments } from '../controllers/document.controller';
import { validate } from '../middleware/validate.middleware';
import { AppError } from '../middleware/error.middleware';
import { listDocumentsSchema } from '../utils/schemas';
import { config } from '../config/env';

const router = Router();

// memoryStorage keeps the container filesystem clean - App Service instances are
// ephemeral and /tmp is small. The size limit bounds per-request memory use.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.MAX_UPLOAD_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    // Reject early, before the body is buffered into memory. AppError carries a
    // 400 through to the error handler instead of surfacing as a generic 500.
    if (file.mimetype !== 'application/pdf') {
      return cb(new AppError(400, 'Only PDF files are supported'));
    }
    cb(null, true);
  },
});

// `authenticate` is applied at the mount point in index.ts.
router.post('/upload', upload.single('file'), uploadDocument);
router.get('/', validate(listDocumentsSchema), getUserDocuments);

export default router;
