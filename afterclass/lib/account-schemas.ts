import { z } from "zod/v4";
import { profileSchema } from "./schemas";

export const loginIdSchema = z.string().trim().toLowerCase().min(3).max(32)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, "Use 3–32 letters, numbers, underscores or hyphens for your Login ID.");
const password = z.string().min(1, "Enter your password.").max(128, "Password must be at most 128 characters.");
export const accountInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("register"), loginId: loginIdSchema,
    password: password.min(12, "Choose a password of at least 12 characters."),
    displayName: z.string().trim().max(60).default("") }).strict(),
  z.object({ action: z.literal("login"), loginId: loginIdSchema, password }).strict(),
  z.object({ action: z.literal("sign_out") }).strict(),
  z.object({ action: z.literal("profile"), displayName: z.string().trim().max(60) }).strict(),
]);
export const accountResponseSchema = z.object({
  authenticated: z.boolean(), loginId: z.string().nullable(), profile: profileSchema,
  retentionDays: z.number(), storage: z.literal("local"),
});