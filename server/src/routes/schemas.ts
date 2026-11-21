import { z } from "zod";

// Request-body schemas shared by more than one router.

export const addressSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required."),
  phone: z.string().trim().min(1, "Phone is required."),
  line1: z.string().trim().min(1, "Address line 1 is required."),
  line2: z.string().trim().nullish(),
  city: z.string().trim().min(1, "City is required."),
  state: z.string().trim().min(1, "State is required."),
  postalCode: z.string().trim().min(1, "Postal code is required."),
  country: z.string().trim().min(1).optional(),
});
