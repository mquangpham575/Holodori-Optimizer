import fs from "node:fs";
import path from "node:path";
import config from "../config.js";
import { postgresMediaStore } from "../db/postgres.js";
import {
  ffmpegAvailable,
  MediaMirror,
  transcodeAnimation,
  type MediaKind,
  type MediaStore,
} from "../etl/card-media.js";
import { logger } from "../logger.js";

const DIRS: Record<MediaKind, string> = { anim: "cards-anim", sign: "cards-sign" };

/** Dev store: plain files under frontend/public/images (git-ignored), served by express.static. */
const devMediaStore = (): MediaStore => {
  const file = (kind: MediaKind, assetId: string) => path.join(config.imagesDir, DIRS[kind], `${assetId}.mp4`);
  const walk = (): number => {
    let total = 0;
    for (const dir of Object.values(DIRS)) {
      const full = path.join(config.imagesDir, dir);
      if (!fs.existsSync(full)) continue;
      for (const name of fs.readdirSync(full)) total += fs.statSync(path.join(full, name)).size;
    }
    return total;
  };
  return {
    async has(kind, assetId) {
      return fs.existsSync(file(kind, assetId));
    },
    async save(kind, assetId, data) {
      fs.mkdirSync(path.join(config.imagesDir, DIRS[kind]), { recursive: true });
      const target = file(kind, assetId);
      const tmp = `${target}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, data);
      fs.renameSync(tmp, target);
    },
    async totalBytes() {
      return walk();
    },
  };
};

/** Prod store reads: the video bytes for /images/cards-anim|cards-sign. */
export const loadMirroredMedia = (kind: MediaKind, assetId: string): Promise<Buffer | null> =>
  postgresMediaStore().load(kind, assetId);

let mirror: MediaMirror | null | undefined;

/** The mirror, or null when it is switched off (CARD_MEDIA_MIRROR=false or no CDN configured). */
export const getMediaMirror = (): MediaMirror | null => {
  if (mirror !== undefined) return mirror;
  if (!config.mediaMirrorEnabled || !config.cardArtCdnBase) {
    mirror = null;
    return mirror;
  }
  // ffmpeg is looked up once, on the first request; until it answers, animations are
  // simply not mirrored (signatures are, they need no encoding).
  let canEncode = false;
  const created = new MediaMirror({
    store: config.isProd ? postgresMediaStore() : devMediaStore(),
    base: config.cardArtCdnBase,
    maxBytes: config.mediaMaxBytes,
    get transcode() {
      return canEncode ? (input: Buffer) => transcodeAnimation(input, config.ffmpegPath) : null;
    },
  });
  ffmpegAvailable(config.ffmpegPath).then((ok) => {
    canEncode = ok;
    if (!ok) logger.warn(`ffmpeg not found (${config.ffmpegPath}): card animations are streamed from the CDN, not mirrored.`);
  });
  mirror = created;
  return mirror;
};

/** Tests swap in their own mirror (or null). */
export const setMediaMirrorForTests = (m: MediaMirror | null | undefined): void => {
  mirror = m;
};
