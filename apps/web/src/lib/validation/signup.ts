import { z } from 'zod'
import { loginSchema } from './login'

export const signupSchema = loginSchema.extend({
  displayName: z.string().trim()
    .min(1, 'Please enter a value')
    .max(80, 'Display name must contain at most 80 characters'),
})

export type SignupValues = z.infer<typeof signupSchema>
