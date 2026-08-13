import { z } from "zod";

export const loginSchema = z.object({
  password: z.string().min(1),
});

export const presetSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  team: z.array(z.string().nullable()).length(5),
  leader: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const presetsBodySchema = z.array(presetSchema);

export const rosterBodySchema = z.array(z.string());

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

export const uploadSchema = z.object({
  fileName: z.string().min(1),
  base64Data: z.string().min(1),
});
