import { z } from 'zod'

// Match the existing SpacetimeDB login reducer without changing passwords.
export const loginSchema = z.object({
  username: z.string().trim().toLowerCase()
    .min(1, 'Please enter a value')
    .min(3, 'Username must contain 3 to 32 characters')
    .max(32, 'Username must contain 3 to 32 characters')
    .regex(/^[a-z0-9_]+$/, 'Use only letters, numbers, or underscores'),
  password: z.string().min(1, 'Please enter a value')
    .max(128, 'Password must contain at most 128 characters'),
})

export type LoginValues = z.infer<typeof loginSchema>
