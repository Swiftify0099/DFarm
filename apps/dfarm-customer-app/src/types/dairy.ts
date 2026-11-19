import { z } from 'zod';

export const DairySchema = z.object({
  id: z.string(),
  name: z.string(),
  registrationNumber: z.string(),
  village: z.string(),
  district: z.string(),
  state: z.string().default('Maharashtra'),
  contactPhone: z.string(),
  associatedPerson: z.string().optional(),
  adminName: z.string().optional(),
  associatedPersonPhone: z.string().optional(),
  centerId: z.string().optional(),
  centerCode: z.string().optional(),
  centerName: z.string().optional(),
  formattedAddress: z.string().optional(),
  distanceKm: z.number().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  isActive: z.boolean().default(true),
  provisioningStatus: z.string().optional(),
  isOperational: z.boolean().optional(),
  discoveryStatus: z.string().optional(),
});
export type Dairy = z.infer<typeof DairySchema>;

export const NearbyDairiesQuerySchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusKm: z.number().min(1).max(25).default(5),
  searchQuery: z.string().optional(),
});
export type NearbyDairiesQuery = z.infer<typeof NearbyDairiesQuerySchema>;
