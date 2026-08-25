import { Response } from 'express';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { AuthRequest } from '../middleware/auth.middleware';
import { AppError } from '../middleware/error.middleware';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { uploadToBlob, deleteBlob } from '../services/blob.service';
import { publishDocumentEvent } from '../services/servicebus.service';

/**
 * Blob names come from user-supplied filenames, so strip any directory
 * components and characters that would create nested paths or break the
 * container. A UUID prefix keeps names unique per upload.
 */
function buildBlobName(originalName: string): string {
  const base = path
    .basename(originalName)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(-120);

  return `${randomUUID()}-${base || 'document.pdf'}`;
}

export const uploadDocument = async (req: AuthRequest, res: Response) => {
  const user = req.user!;

  if (!req.file) {
    throw new AppError(400, 'No file uploaded');
  }

  const { originalname, buffer, mimetype } = req.file;

  // multer's fileFilter already rejects non-PDFs; this guards against a filter
  // being removed and also catches an empty upload.
  if (mimetype !== 'application/pdf') {
    throw new AppError(400, 'Only PDF files are supported');
  }
  if (buffer.length === 0) {
    throw new AppError(400, 'Uploaded file is empty');
  }

  const blobName = buildBlobName(originalname);
  const { blobUrl } = await uploadToBlob(blobName, buffer, mimetype);

  let document;
  try {
    document = await prisma.document.create({
      data: {
        userId: user.id,
        title: path.basename(originalname).slice(0, 250),
        blobUrl,
        status: 'UPLOADED',
      },
    });
  } catch (error) {
    // Nothing references the blob yet, so remove it rather than leaving an
    // orphan that nobody can see or bill against.
    await deleteBlob(blobName).catch((cleanupError) =>
      logger.error('Failed to clean up orphaned blob', {
        blobName,
        error: (cleanupError as Error).message,
      }),
    );
    throw error;
  }

  try {
    await publishDocumentEvent({
      documentId: document.id,
      userId: user.id,
      blobName,
      blobUrl,
    });
  } catch (error) {
    // The document row exists but will never be picked up. Record that instead
    // of leaving it stuck in UPLOADED with no explanation, so it can be retried.
    await prisma.document
      .update({
        where: { id: document.id },
        data: {
          status: 'FAILED',
          errorMessage: 'Could not be queued for processing. Please retry the upload.',
        },
      })
      .catch(() => undefined);
    throw error;
  }

  res.status(202).json({
    message: 'Document uploaded and queued for processing',
    document,
  });
};

export const getUserDocuments = async (req: AuthRequest, res: Response) => {
  const user = req.user!;

  // Coerced and range-checked by validate(listDocumentsSchema).
  const page = (req.query.page as unknown as number) ?? 1;
  const limit = (req.query.limit as unknown as number) ?? 20;
  const skip = (page - 1) * limit;

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      // Chunk text can be megabytes; never return it from a list endpoint.
      select: {
        id: true,
        title: true,
        status: true,
        summary: true,
        errorMessage: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.document.count({ where: { userId: user.id } }),
  ]);

  res.status(200).json({
    documents,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
};
