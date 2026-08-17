import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    name: z.string().min(2, 'Name must be at least 2 characters'),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
});

export const chatSchema = z.object({
  body: z.object({
    message: z.string().min(1, 'Message cannot be empty').max(2000, 'Message is too long'),
  }),
});

export const searchSchema = z.object({
  query: z.object({
    q: z.string().min(1, 'Search query cannot be empty').max(100, 'Search query too long'),
  }),
});
