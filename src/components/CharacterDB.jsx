import React, { useState } from 'react';
import { X, Shield, Swords, Sparkles, Zap, Heart, Smile, Sparkle, Paintbrush, Users } from 'lucide-react';
import { CHARACTERS } from '../data';
import './CharacterDB.css';

export default function CharacterDB({ onAccentChange, currentAccent }) {
  const [selectedGroup, setSelectedGroup] = useState('All');
  const [selectedType, setSelectedType] = useState('All');
  const [activeCharacter, setActiveCharacter] = useState(null);

  const groups = ['All', 'Gen 0', 'Gen 1', 'Gen 3', 'Myth', 'ID Gen 3', 'ReGLOSS'];
  const types = ['All', 'PURE', 'CUTE', 'HAPPY'];

  const filteredCharacters = CHARACTERS.filter((char) => {
    const matchesGroup = selectedGroup === 'All' || char.group === selectedGroup;
    const matchesType = selectedType === 'All' || char.type === selectedType;
    return matchesGroup && matchesType;
  });

  const getTypeIcon = (type) => {
    switch (type) {
      case 'PURE': return <Sparkle className="elem-icon text-cyan" size={14} />;
      case 'CUTE': return <Heart className="elem-icon text-red" size={14} />;
      case 'HAPPY': return <Smile className="elem-icon text-orange" size={14} />;
      default: return null;
    }
  };

  const renderStatsChart = (stats) => {
    const maxVal = 100;
    const statLabels = [
      { key: 'sense', label: 'Sense', icon: Sparkles, color: '#a855f7' },
      { key: 'technique', label: 'Technique', icon: Zap, color: '#3b82f6' },
      { key: 'performance', label: 'Performance', icon: Swords, color: '#ef4444' },
      { key: 'support', label: 'Support', icon: Shield, color: '#10b981' }
    ];

    return (
      <div className="stats-visualizer">
        {statLabels.map((stat) => {
          const value = stats[stat.key];
          const percentage = (value / maxVal) * 100;
          const StatIcon = stat.icon;
          return (
            <div key={stat.key} className="stat-row">
              <div className="stat-info">
                <StatIcon size={14} style={{ color: stat.color }} />
                <span className="stat-name">{stat.label}</span>
                <span className="stat-num">{value}</span>
              </div>
              <div className="stat-bar-bg">
                <div 
                  className="stat-bar-fill" 
                  style={{ 
                    width: `${percentage}%`, 
                    backgroundColor: stat.color,
                    boxShadow: `0 0 10px ${stat.color}80`
                  }} 
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const skillTypes = [
    { key: 'outfit', label: 'Outfit Skill' },
    { key: 'special', label: 'Special Skill' },
    { key: 'active', label: 'Active Skill' },
    { key: 'passive', label: 'Passive Skill' }
  ];

  return (
    <div className="character-db-page animate-fade-in">
      <div className="db-header">
        <h1 className="page-title">HoloDreams Database</h1>
        <p className="page-subtitle">Xem thông tin chi tiết, chỉ số kỹ năng và lối xây dựng tối ưu cho từng nhân vật.</p>
      </div>

      {/* Filter bar */}
      <div className="filter-bar glass">
        <div className="filter-group">
          <span className="filter-label">Group</span>
          <div className="filter-options">
            {groups.map((group) => (
              <button
                key={group}
                className={`filter-btn ${selectedGroup === group ? 'active' : ''}`}
                onClick={() => setSelectedGroup(group)}
              >
                {group}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-group">
          <span className="filter-label">Type</span>
          <div className="filter-options">
            {types.map((type) => (
              <button
                key={type}
                className={`filter-btn ${selectedType === type ? 'active' : ''}`}
                onClick={() => setSelectedType(type)}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Character Grid */}
      <div className="character-grid">
        {filteredCharacters.map((char) => (
          <div
            key={char.id}
            className="char-card glass"
            style={{ '--hover-color': char.accentColor }}
            onClick={() => setActiveCharacter(char)}
          >
            <div className="rarity-badge">{char.rarity}</div>
            <div className="char-card-body">
              <div className="char-card-media-wrapper">
                {char.image ? (
                  <img src={char.image} alt={char.name} className="char-card-img" />
                ) : (
                  <div className="char-card-avatar-fallback">{char.avatar}</div>
                )}
              </div>
              <h3 className="char-card-name">{char.name}</h3>
              <p className="char-card-title">{char.title}</p>
              
              <div className="char-card-badges">
                <span className="badge-role">
                  <Users size={10} className="mr-1" />
                  {char.group}
                </span>
                <span className="badge-elem">
                  {getTypeIcon(char.type)}
                  {char.type}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Detail Modal Overlay */}
      {activeCharacter && (
        <div className="modal-overlay" onClick={() => setActiveCharacter(null)}>
          <div className="modal-content glass" onClick={(e) => e.stopPropagation()} style={{ '--char-accent': activeCharacter.accentColor }}>
            <button className="modal-close" onClick={() => setActiveCharacter(null)}>
              <X size={20} />
            </button>

            <div className="modal-body-layout">
              {/* Left Column: Avatar & General info */}
              <div className="modal-left">
                <div className="modal-img-wrapper" style={{ boxShadow: `0 0 30px ${activeCharacter.accentColor}40`, border: `2px solid ${activeCharacter.accentColor}` }}>
                  {activeCharacter.image ? (
                    <img src={activeCharacter.image} alt={activeCharacter.name} className="modal-char-img" />
                  ) : (
                    <span className="modal-avatar">{activeCharacter.avatar}</span>
                  )}
                </div>
                <h2 className="modal-name">{activeCharacter.name}</h2>
                <p className="modal-title-text" style={{ color: activeCharacter.accentColor }}>{activeCharacter.title}</p>
                <div className="char-card-badges justify-center mt-2">
                  <span className="badge-role">
                    <Users size={11} className="mr-1" />
                    {activeCharacter.group}
                  </span>
                  <span className="badge-elem">
                    {getTypeIcon(activeCharacter.type)}
                    {activeCharacter.type}
                  </span>
                </div>
                
                <button 
                  className="btn-sync-theme"
                  onClick={() => onAccentChange(activeCharacter.accentColor)}
                  style={{ 
                    borderColor: activeCharacter.accentColor, 
                    color: activeCharacter.accentColor,
                    boxShadow: currentAccent === activeCharacter.accentColor ? `0 0 12px ${activeCharacter.accentColor}` : 'none',
                    background: currentAccent === activeCharacter.accentColor ? `${activeCharacter.accentColor}1a` : 'transparent'
                  }}
                >
                  <Paintbrush size={14} /> Sync Site Theme
                </button>
              </div>

              {/* Right Column: Stats & Skills */}
              <div className="modal-right">
                <div className="modal-section-block">
                  <h3 className="section-subtitle">Chỉ Số Nhân Vật (Base Stats)</h3>
                  {renderStatsChart(activeCharacter.stats)}
                </div>

                <div className="modal-section-block">
                  <h3 className="section-subtitle">Kỹ Năng (Skills)</h3>
                  <div className="skills-container">
                    {skillTypes.map((skill) => (
                      <div key={skill.key} className="skill-item glass">
                        <div className="skill-header">
                          <span className="skill-name">{skill.label}</span>
                          <span className="skill-type" style={{ color: activeCharacter.accentColor, background: `${activeCharacter.accentColor}15` }}>ACTIVE</span>
                        </div>
                        <p className="skill-desc">{activeCharacter.skills[skill.key]}</p>
                      </div>
                    ))}
                  </div>
                </div>


              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
