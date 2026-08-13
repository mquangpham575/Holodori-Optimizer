import { getPresetsByDevice, upsertPresets, type Preset } from "../repositories/presetRepository.js";

export const getPresets = async (deviceId: string): Promise<Preset[]> =>
  getPresetsByDevice(deviceId);

export const savePresets = async (deviceId: string, presets: Preset[]): Promise<void> =>
  upsertPresets(deviceId, presets);
