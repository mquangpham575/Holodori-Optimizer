import { z } from "zod";

export const loginSchema = z.object({
  password: z.string().min(1),
});

// The team builder stores per-slot Bloom stage / Level / chosen card variant on
// each preset. z.object() strips unknown keys, so these must be declared here or
// they are silently dropped on every save (and reset on the next page load).
const slotArray = <T extends z.ZodTypeAny>(item: T) => z.array(item).max(5);

export const presetSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().max(100),
  team: z.array(z.string().nullable()).length(5),
  leader: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  bloomLevels: slotArray(z.number().int().min(0).max(10).nullable()).optional(),
  cardLevels: slotArray(z.number().int().min(1).max(80).nullable()).optional(),
  selectedCards: slotArray(z.string().nullable()).optional(),
});

export const presetsBodySchema = z.array(presetSchema).max(20);

// A roster entry is either a bare id (legacy) or the {id, bloom, level} object
// the team builder writes.
export const rosterEntrySchema = z.union([
  z.string().min(1),
  z.object({
    id: z.string().min(1),
    bloom: z.number().int().min(0).max(10).optional(),
    level: z.number().int().min(1).max(80).optional(),
  }),
]);

export const rosterBodySchema = z.array(rosterEntrySchema).max(1000);

export const characterCreateSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    title: z.string().optional(),
    rarity: z.string().optional(),
    group: z.string().optional(),
    type: z.string().optional(),
    accentColor: z.string().optional(),
    image: z.string().optional(),
    avatar: z.string().optional(),
    stats: z.record(z.any()).optional(),
    skills: z.record(z.any()).optional(),
    cardData: z.any().optional(),
    cards: z.array(z.any()).optional(),
    characterId: z.string().nullable().optional(),
    attributeId: z.string().nullable().optional(),
    groupIds: z.array(z.string()).optional(),
    assetId: z.string().nullable().optional(),
  })
  .passthrough();

export const charactersBulkSchema = z.array(characterCreateSchema);

// Updates are partial and can never change the id (it comes from the URL).
export const characterUpdateSchema = characterCreateSchema.partial().omit({ id: true }).strip();

export const guideCreateSchema = z
  .object({
    id: z.string().min(1),
    title: z.any().refine((v) => v !== undefined && v !== null && v !== "", {
      message: "Title is required",
    }),
    summary: z.any().optional(),
    category: z.string().optional(),
    readTime: z.string().optional(),
    author: z.string().optional(),
    date: z.string().optional(),
    content: z.string().optional(),
    contentUrl: z.any().optional(),
  })
  .passthrough();

export const guideUpdateSchema = guideCreateSchema.partial().omit({ id: true }).strip();

export const cardArtSchema = z.object({
  assetId: z.string().regex(/^[A-Za-z0-9_-]{3,64}$/),
  base64Data: z.string().min(1),
});

export const uploadSchema = z.object({
  fileName: z.string().min(1),
  base64Data: z.string().min(1),
});
