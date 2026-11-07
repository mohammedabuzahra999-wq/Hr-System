import { z } from 'zod'
import { idSchema, localizedSchema, roleSchema } from './primitives.js'

export const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  /**
   * Only a floor is enforced here. The strength rule lives on the server so it
   * can be tightened without shipping a new frontend.
   */
  password: z.string().min(8).max(200),
})
export type LoginInput = z.infer<typeof loginSchema>

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
})
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

/** The signed-in user as every screen sees them. Never carries a password hash. */
export const sessionUserSchema = z.object({
  id: idSchema,
  email: z.string(),
  fullName: localizedSchema,
  role: roleSchema,
  employeeNumber: z.string(),
  jobTitle: localizedSchema,
  department: localizedSchema,
  managerId: idSchema.nullable(),
  managerName: localizedSchema.nullable(),
  photoUrl: z.string().nullable(),
})
export type SessionUser = z.infer<typeof sessionUserSchema>
