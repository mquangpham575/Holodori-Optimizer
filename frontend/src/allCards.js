const CARD_ART_BASE = "/images/cards";

export const cardArtUrl = (assetId) =>
  assetId ? `${CARD_ART_BASE}/${assetId}.webp` : null;

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
