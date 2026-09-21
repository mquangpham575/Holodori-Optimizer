const CARD_ART_BASE = "/images/cards";

export const cardArtUrl = (assetId) =>
  assetId ? `${CARD_ART_BASE}/${assetId}.webp` : null;

// Full illustrations (1820x1024) and their grid-size thumbnails are mirrored by the
// backend from the art CDN; /images/cards/<id>.webp remains the bundled framed art.
const cardFullArtUrl = (assetId) => (assetId ? `/images/cards-full/${assetId}.webp` : null);
const cardThumbArtUrl = (assetId) => (assetId ? `/images/cards-thumb/${assetId}.webp` : null);

// 5-star cards also have a looping animation, a signature overlay and a voice line,
// loaded only when a visitor opens the card. The animation and signature are asked
// from our own backend (/images/cards-anim|cards-sign/<id>.mp4), which serves its
// mirrored copy (smaller, cached for good) or, until that exists, redirects to the CDN.
// The voice line always streams from the CDN. VITE_CARD_VIDEO_BASE at build time:
// unset = as above, "" = no media at all, a URL = everything straight from that host.
const RAW_MEDIA_BASE = import.meta.env?.VITE_CARD_VIDEO_BASE;
const MEDIA_BASE = (RAW_MEDIA_BASE ?? 'https://cdn.holodori.dev').replace(/\/+$/, '');
const MIRRORED = RAW_MEDIA_BASE === undefined;
const mediaOk = (assetId, rarityNum) =>
  Boolean(MEDIA_BASE && assetId && rarityNum === 5 && /^[A-Za-z0-9_-]+$/.test(assetId));
// Movies live at <name>.usm/<name>/<name>.<ext>; the audio at <name>.acb/<name>.mp3.
const movieUrl = (assetId, rarityNum, prefix, ext) => {
  if (!mediaOk(assetId, rarityNum)) return null;
  const name = `${prefix}${assetId}`;
  return `${MEDIA_BASE}/assets/resources/${name}.usm/${name}/${name}.${ext}`;
};
const cardVideoUrl = (assetId, rarityNum) =>
  MIRRORED && mediaOk(assetId, rarityNum)
    ? `/images/cards-anim/${assetId}.mp4`
    : movieUrl(assetId, rarityNum, 'mov_card_full_0_', 'mp4');
// Stacked-alpha H.264: colour in the top half of each frame, the matte in the bottom half.
const cardSignUrl = (assetId, rarityNum) =>
  MIRRORED && mediaOk(assetId, rarityNum)
    ? `/images/cards-sign/${assetId}.mp4`
    : movieUrl(assetId, rarityNum, 'mov_card_sign_', 'h264.mp4');
// The "situation" voice line, named after the member number (the asset id's first part).
const cardVoiceUrl = (assetId, rarityNum) => {
  if (!mediaOk(assetId, rarityNum)) return null;
  const name = `vo_card_cmn_${assetId.split('-')[0]}_${assetId}_situation`;
  return `${MEDIA_BASE}/assets/resources/${name}.acb/${name}.mp3`;
};

const rarityToLabel = (rarity) => {
  if (typeof rarity === "string") return rarity;
  if (Number.isInteger(rarity)) return `${rarity}-Star`;
  return "N-Star";
};

const rarityNumOf = (variant) => {
  if (Number.isInteger(variant.rarity)) return variant.rarity;
  const m = String(variant.rarity || "").match(/\d/);
  if (m) return parseInt(m[0], 10);
  const idMatch = String(variant.id || "").match(/-(\d)-/);
  return idMatch ? parseInt(idMatch[1], 10) : 0;
};

export const buildAllCards = (characters = []) => {
  const cards = [];
  for (const c of characters) {
    if (!c) continue;
    const variants = Array.isArray(c.cards) && c.cards.length > 0 ? c.cards : [c];
    variants.forEach((v) => {
      if (!v || !v.id) return;
      cards.push({
        id: v.id,
        characterId: c.characterId || c.id,
        charId: c.id,
        name: c.name,
        title: v.title,
        rarity: rarityToLabel(v.rarity),
        rarityNum: rarityNumOf(v),
        group: c.group,
        type: v.type || c.type,
        attribute: c.attribute,
        attributeId: c.attributeId,
        groupIds: c.groupIds,
        accentColor: c.accentColor,
        image: v.assetId ? cardArtUrl(v.assetId) : c.image || null,
        fullImage: cardFullArtUrl(v.assetId),
        thumbImage: cardThumbArtUrl(v.assetId),
        videoUrl: cardVideoUrl(v.assetId, rarityNumOf(v)),
        signUrl: cardSignUrl(v.assetId, rarityNumOf(v)),
        voiceUrl: cardVoiceUrl(v.assetId, rarityNumOf(v)),
        fallbackImage: c.fallbackImage,
        avatar: c.avatar,
        stats: v.stats,
        skills: v.skills,
        assetId: v.assetId,
        cardData: v.cardData,
        bloomStats: v.bloomStats,
      });
    });
  }
  cards.sort((a, b) => b.rarityNum - a.rarityNum || String(a.assetId).localeCompare(String(b.assetId)));
  return cards;
};
