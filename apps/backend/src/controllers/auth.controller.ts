import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { prisma } from '../utils/prisma';
import { signAccessToken } from '../utils/jwt';
import { AuthRequest } from '../middleware/auth.middleware';
import { AppError } from '../middleware/error.middleware';

// Cost 12 is the current practical floor for bcrypt. Raising it from 10 roughly
// quadruples the work an offline cracker has to do per guess.
const BCRYPT_ROUNDS = 12;

// Timing-safe placeholder, hashed once at startup so it is guaranteed to be a
// well-formed bcrypt digest. Comparing against it on the "user not found" path
// keeps login latency constant, so response time does not reveal which email
// addresses are registered.
const DUMMY_HASH = bcrypt.hashSync(randomBytes(24).toString('hex'), BCRYPT_ROUNDS);

type PublicUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

const toPublicUser = (user: PublicUser) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
});

// Request bodies are validated and normalised by validate(registerSchema) /
// validate(loginSchema) before reaching these handlers.
export const register = async (req: Request, res: Response) => {
  const { email, password, name } = req.body as {
    email: string;
    password: string;
    name?: string;
  };

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new AppError(409, 'An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: { email, passwordHash, name },
  });

  const token = signAccessToken({ id: user.id, role: user.role });

  res.status(201).json({ user: toPublicUser(user), token });
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };

  const user = await prisma.user.findUnique({ where: { email } });

  const isPasswordValid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !isPasswordValid) {
    throw new AppError(401, 'Invalid credentials');
  }

  const token = signAccessToken({ id: user.id, role: user.role });

  res.status(200).json({ user: toPublicUser(user), token });
};

export const getProfile = async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  if (!user) {
    throw new AppError(404, 'User not found');
  }

  res.json({ user });
};
