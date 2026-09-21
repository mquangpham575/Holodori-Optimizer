import { ALL_CARDS } from "./data";

// Attribute (type) icons — hosted locally under frontend/public/images/types/.
// The upstream Holodori API serves these with Cross-Origin-Resource-Policy:
// same-origin + a Cloudflare challenge, so they must be self-hosted.
const TYPE_ICON_PATHS = {
  PURE: "/images/types/attr-pure.webp",
  CUTE: "/images/types/attr-cute.webp",
  HAPPY: "/images/types/attr-happy.webp",
};

export const getTypeIconUrl = (type) => TYPE_ICON_PATHS[type] || null;

// Intent: Robust character/card resolver across ALL_CARDS and characters database
export const findChar = (idOrObj, characters = []) => {
  if (!idOrObj) return null;
  if (typeof idOrObj === "object") return idOrObj;
  const idStr = String(idOrObj);

  // 1. Search in characters prop
  if (Array.isArray(characters) && characters.length > 0) {
    const match = characters.find(
      (c) =>
        c.id === idStr ||
        c.charId === idStr ||
        c.assetId === idStr ||
        c.cardData?.id === idStr ||
        c.cardData?.cardId === idStr ||
        c.characterId === idStr ||
        c.name === idStr ||
        c.member === idStr ||
        (c.assetId && idStr.includes(c.assetId)) ||
        (c.cardData?.id && idStr.includes(c.cardData.id)),
    );
    if (match) return match;

    // 1b. Match a card id/asset id to the CHARACTER that owns it, so callers
    //     always receive a character-like object (name, avatar, image).
    //     Non-primary variants must resolve to their parent character too.
    for (const c of characters) {
      if (!Array.isArray(c.cards)) continue;
      const hit = c.cards.find(
        (card) =>
          card.id === idStr ||
          card.assetId === idStr ||
          card.cardData?.id === idStr ||
          card.cardData?.cardId === idStr ||
          (card.assetId && idStr.includes(card.assetId)),
      );
      if (hit) return c;
    }
  }

  // 2. Search in ALL_CARDS
  if (
    typeof ALL_CARDS !== "undefined" &&
    Array.isArray(ALL_CARDS) &&
    ALL_CARDS.length > 0
  ) {
    const match = ALL_CARDS.find(
      (c) =>
        c.id === idStr ||
        c.charId === idStr ||
        c.assetId === idStr ||
        c.cardData?.id === idStr ||
        c.cardData?.cardId === idStr ||
        c.characterId === idStr ||
        c.name === idStr ||
        c.member === idStr ||
        (c.assetId && idStr.includes(c.assetId)) ||
        (c.cardData?.id && idStr.includes(c.cardData.id)),
    );
    if (match) return match;
  }

  return null;
};

// Compare two stored ids (character ids OR card-variant ids) as representing
// the same character. Presets can hold either format (recommendation applies
// store card ids), so every equality check on team/leader entries must resolve
// both sides through findChar to avoid misses.
export const sameChar = (a, b, characters) => {
  if (!a || !b) return a === b;
  if (a === b) return true;
  const ca = findChar(a, characters);
  const cb = findChar(b, characters);
  return !!(ca && cb && ca.id === cb.id);
};
