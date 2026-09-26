import { z } from 'zod'

export const authSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z
    .string()
    .min(8, 'Use at least 8 characters')
    .max(72, 'Passwords are limited to 72 characters'),
})

export type AuthInput = z.infer<typeof authSchema>
