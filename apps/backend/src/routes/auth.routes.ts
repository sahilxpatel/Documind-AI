import { Router } from 'express';
import { register, login, getProfile } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { authLimiter } from '../middleware/rate-limit.middleware';
import { registerSchema, loginSchema } from '../utils/schemas';

const router = Router();

// authLimiter runs before validation so malformed brute-force traffic is also
// counted against the attacker's budget.
router.post('/register', authLimiter, validate(registerSchema), register);
router.post('/login', authLimiter, validate(loginSchema), login);
router.get('/profile', authenticate, getProfile);

export default router;
