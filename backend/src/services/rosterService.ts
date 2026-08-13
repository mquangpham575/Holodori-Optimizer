import { getRosterByDevice, upsertRoster } from "../repositories/rosterRepository.js";

export const getRoster = async (deviceId: string): Promise<string[]> =>
  getRosterByDevice(deviceId);

export const saveRoster = async (deviceId: string, ownedIds: string[]): Promise<void> =>
  upsertRoster(deviceId, ownedIds);
