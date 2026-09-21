import {
  listGuides as repoList,
  insertGuide,
  updateGuide,
  deleteGuide,
  type Guide,
} from "../repositories/guideRepository.js";
import { createTTLCache } from "../repositories/searchIndexRepository.js";

const guidesCache = createTTLCache<Guide[]>(30000);

export const listGuides = async (): Promise<Guide[]> => {
  const cached = guidesCache.get("all");
  if (cached) return cached;

  const result = await repoList();
  guidesCache.set("all", result);
  return result;
};

const invalidateGuidesCache = (): void => {
  guidesCache.delete("all");
};

export const createGuide = async (guide: Guide): Promise<void> => {
  await insertGuide(guide);
  invalidateGuidesCache();
};

export const updateGuideById = async (guideId: string, guide: Partial<Guide>): Promise<void> => {
  await updateGuide(guideId, guide);
  invalidateGuidesCache();
};

export const deleteGuideById = async (guideId: string): Promise<void> => {
  await deleteGuide(guideId);
  invalidateGuidesCache();
};
