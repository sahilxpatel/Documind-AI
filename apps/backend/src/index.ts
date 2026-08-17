import 'express-async-errors';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { logger } from './utils/logger';
import rateLimit from 'express-rate-limit';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

import authRoutes from './routes/auth.routes';
import documentRoutes from './routes/document.routes';
import chatRoutes from './routes/chat.routes';
import searchRoutes from './routes/search.routes';

app.use(helmet());
app.use(cors());
app.use(express.json());

// General Rate Limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  message: 'Too many requests from this IP, please try again after 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict Rate Limiter for AI endpoints (chat, search, upload)
const strictLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // Limit each IP to 20 requests per minute
  message: 'Too many AI requests, please slow down',
});

app.use('/api', limiter);

app.use('/api/auth', authRoutes);
app.use('/api/documents', strictLimiter, documentRoutes);
app.use('/api/chat', strictLimiter, chatRoutes);
app.use('/api/search', strictLimiter, searchRoutes);

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', service: 'documind-api' });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error(err.message);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(port, () => {
  logger.info(`Server listening on port ${port}`);
});
