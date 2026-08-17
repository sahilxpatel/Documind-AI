import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../utils/prisma';
import { uploadToBlob } from '../services/blob.service';
import { publishDocumentEvent } from '../services/servicebus.service';
import { v4 as uuidv4 } from 'uuid';

export const uploadDocument = async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { originalname, buffer, mimetype } = req.file;
  
  // Ensure it's a PDF
  if (mimetype !== 'application/pdf') {
    return res.status(400).json({ error: 'Only PDF files are supported' });
  }

  const uniqueFileName = `${uuidv4()}-${originalname}`;

  try {
    // 1. Upload to Blob Storage
    const blobUrl = await uploadToBlob(uniqueFileName, buffer, mimetype);

    // 2. Save metadata to Database
    const document = await prisma.document.create({
      data: {
        userId: req.user.id,
        title: originalname,
        blobUrl: blobUrl,
        status: 'UPLOADED',
      },
    });

    // 3. Publish to Service Bus
    await publishDocumentEvent(document.id, document.blobUrl);

    res.status(202).json({ 
      message: 'Document uploaded and queued for processing successfully', 
      document 
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error during upload' });
  }
};

export const getUserDocuments = async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const skip = (page - 1) * limit;

  try {
    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.document.count({ where: { userId: req.user.id } })
    ]);

    res.status(200).json({ 
      documents,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
};
