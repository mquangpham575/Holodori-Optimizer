import { useLanguage } from '../context/LanguageContext';
import React from 'react';
import { Gamepad2, Shield, Calendar, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { findChar, sameChar, getTypeIconUrl } from '../charUtils';
import './Home.css';

const typeColors = {
  PURE: '#10b981',
  CUTE: '#ef4444',
  HAPPY: '#fbbf24',
};


/**
 * Home - Displays landing info, editable personal showcase, and links to guides/characters.
 */
export default function Home({
  activeTeam = [],
  activeLeader,
  activeLevels = [],
  activeBloomLevels = [],
  activeSelectedCards = [],
  characters = [],
  guides = [],
}) {
  const getLangPath = (path) => {
    if (!currentLang) return path;
    if (path === '/') return '/' + currentLang;
    return path + '/' + currentLang;
  };
  const { t, currentLang } = useLanguage();
  const navigate = useNavigate();

  const getLocalizedValue = (val, lang) => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    return val[lang] || val['en'] || val[Object.keys(val)[0]] || '';
  };

  const displayCharacters = activeTeam
    .map((id, index) => {
      const char = findChar(id, characters);
      if (!char) return null;

      const selectedCardId = activeSelectedCards[index];
      const cardMatchesId = (card, cardId) =>
        cardId &&
        [card.id, card.assetId, card.cardData?.id, card.cardData?.cardId].includes(
          cardId,
        );
      const variant = char.cards?.find(
        (card) => cardMatchesId(card, selectedCardId) || cardMatchesId(card, id),
      );
      // The character's top-level card data is the primary/detail-calculation
      // card. Do not default to cards[0], whose order may start at 3★/4★.
      const card = variant || char;
      const type = card.type || char.type || card.attribute;
      const groups = Array.from(
        new Set(
          [
            char.group,
            ...(char.groupLabels || []),
            ...(char.cardData?.groupLabels || []),
            ...(card.groupLabels || []),
            ...(card.cardData?.groupLabels || []),
          ].filter(Boolean),
        ),
      );

      return {
        char,
        card,
        index,
        type,
        groups,
        level: activeLevels[index] || 70,
        bloom: activeBloomLevels[index] || 0,
      };
    })
    .filter(Boolean);

  return (
    <div className="home-page animate-fade-in">
      {/* Hero Banner */}
      <section className="hero-section glass glow-card">
        <div className="hero-content">
          <span className="hero-badge"><Gamepad2 size={14} /> {t('new_rpg_fan_game')}</span>
          <h1 className="hero-title">{t('hero_title')}</h1>
          <p className="hero-subtitle">
            {t('hero_subtitle')}
          </p>
          <div className="hero-actions">
            <button className="btn-primary" onClick={() => navigate(getLangPath('/characters'))}>
              {t('view_characters')}
            </button>
            <button className="btn-secondary" onClick={() => navigate(getLangPath('/guides'))}>
              {t('view_guides')} <ArrowRight size={16} />
            </button>
          </div>
        </div>
        <div className="hero-visual">
          <div className="floating-sphere sphere-1" />
          <div className="floating-sphere sphere-2" />
        </div>
      </section>

      <div className="showcase-container">
        {/* {t('active_presets_title')} Card */}
        <section className="showcase-card glass">
          <div className="card-header">
            <h2 className="section-title"><Shield className="title-icon" /> Active Party</h2>
          </div>

          <div className="profile-container">
            <div className="team-slots">
              {displayCharacters.length > 0 ? (
                <>
                  {displayCharacters.map(({ char, card, index, type, groups, level, bloom }) => (
                    <div 
                      key={char.id} 
                      className={`team-slot-card glass ${sameChar(activeLeader, char.id, characters) ? 'leader-card' : ''}`}
                      style={{ '--char-color': char.accentColor, '--type-color': typeColors[type] || 'var(--accent-color)' }}
                      onClick={() => navigate(getLangPath('/builder'))}
                    >
                      <span className="home-slot-number">{index + 1}</span>
                      {sameChar(activeLeader, char.id, characters) && <span className="home-leader-badge">L</span>}
                      <div className="home-card-art-wrap">
                        {card.image || card.assetId || char.image ? (
                          <img
                            src={card.image || (card.assetId ? `/images/cards/${card.assetId}.webp` : char.fallbackImage || char.image)}
                            alt={char.name}
                            className="home-team-char-img"
                          />
                        ) : (
                          <span className="char-emoji">{char.avatar}</span>
                        )}
                        <span className="home-group-badges">
                          {groups.map((group) => (
                            <span className="home-group-badge" key={group}>{group}</span>
                          ))}
                        </span>
                        <span className="home-type-badge" style={{ color: typeColors[type] || 'var(--accent-color)' }}>
                          {getTypeIconUrl(type) ? (
                            <img src={getTypeIconUrl(type)} alt={`${type} type`} />
                          ) : '•'}
                        </span>
                      </div>
                      <span className="char-name">{char.name}</span>
                      <span className="home-card-title">{card.title || card.name || char.title}</span>
                      <span className="home-card-meta" style={{ color: typeColors[type] || 'var(--text-muted)' }}>
                        {type || 'TYPE'} · Lv{level} · B{bloom}
                      </span>
                    </div>
                  ))}
                </>
              ) : (
                <div className="empty-team-placeholder" onClick={() => navigate(getLangPath('/builder'))}>
                  <p>{t('no_active_team')}</p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Guides highlight */}
      <section className="latest-articles glass">
        <div className="articles-header">
          <h2 className="section-title"><Calendar className="title-icon" /> {t('guides_title')}</h2>
          <button className="link-btn" onClick={() => navigate(getLangPath('/guides'))}>
            {t('view_all_articles')} <ArrowRight size={16} />
          </button>
        </div>
        <div className="articles-grid">
          {guides.slice(0, 2).map((guide) => (
            <div key={guide.id} className="article-preview-card glass" onClick={() => navigate(getLangPath('/guides'))}>
              <span className="article-category">{guide.category}</span>
              <h3 className="article-title">{getLocalizedValue(guide.title, currentLang)}</h3>
              <p className="article-summary">{getLocalizedValue(guide.summary, currentLang)}</p>
              <div className="article-meta">
                <span>{t('by_author', { author: guide.author })}</span>
                <span>•</span>
                <span>{t('read_time', { time: guide.readTime })}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
