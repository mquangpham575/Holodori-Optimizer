import React, { useState, useEffect } from 'react';
import { Edit2, Save, Trophy, Award, Gamepad2, CheckCircle2, Shield, Calendar, ArrowRight } from 'lucide-react';
import { CHARACTERS, GUIDES } from '../data';
import './Home.css';

/**
 * Home - Displays landing info, editable personal showcase, and links to guides/characters.
 */
export default function Home({ activeTeam, activeLeader, setActiveTab, playerData, setPlayerData }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState({ ...playerData });

  // Update internal edit form state when props change
  useEffect(() => {
    setEditedData({ ...playerData });
  }, [playerData]);

  const handleSave = () => {
    setPlayerData(editedData);
    setIsEditing(false);
  };

  const handleAchievementToggle = (achievementId) => {
    const updatedAchievements = playerData.achievements.map(ach => 
      ach.id === achievementId ? { ...ach, unlocked: !ach.unlocked } : ach
    );
    setPlayerData({
      ...playerData,
      achievements: updatedAchievements
    });
  };

  const activeCharacters = activeTeam
    .map(id => CHARACTERS.find(c => c.id === id))
    .filter(Boolean);
  const leaderChar = CHARACTERS.find(c => c.id === activeLeader);

  return (
    <div className="home-page animate-fade-in">
      {/* Hero Banner */}
      <section className="hero-section glass glow-card">
        <div className="hero-content">
          <span className="hero-badge"><Gamepad2 size={14} /> NEW RPG FAN-GAME</span>
          <h1 className="hero-title">HOLOLIVE DREAMS</h1>
          <p className="hero-subtitle">
            Dấn thân vào thế giới giấc mơ đầy màu sắc cùng các VTubers tài năng. Khám phá các chỉ số, xây dựng đội hình tối thượng và ghi dấu ấn cá nhân của bạn.
          </p>
          <div className="hero-actions">
            <button className="btn-primary" onClick={() => setActiveTab('characters')}>
              Xem Nhân Vật
            </button>
            <button className="btn-secondary" onClick={() => setActiveTab('guides')}>
              Xem Hướng Dẫn <ArrowRight size={16} />
            </button>
          </div>
        </div>
        <div className="hero-visual">
          <div className="floating-sphere sphere-1" />
          <div className="floating-sphere sphere-2" />
        </div>
      </section>

      {/* Grid: Showcase & Achievements */}
      <div className="showcase-grid">
        {/* Profile Card */}
        <section className="showcase-card glass">
          <div className="card-header">
            <h2 className="section-title"><Shield className="title-icon" /> Player Showcase</h2>
            {!isEditing ? (
              <button className="btn-edit" onClick={() => setIsEditing(true)}>
                <Edit2 size={14} /> Edit
              </button>
            ) : (
              <button className="btn-save" onClick={handleSave}>
                <Save size={14} /> Save
              </button>
            )}
          </div>

          <div className="profile-container">
            {isEditing ? (
              <div className="edit-form">
                <div className="input-group">
                  <label>Tên Người Chơi</label>
                  <input
                    type="text"
                    value={editedData.playerName}
                    onChange={(e) => setEditedData({ ...editedData, playerName: e.target.value })}
                  />
                </div>
                <div className="input-group">
                  <label>Danh Hiệu (Title)</label>
                  <input
                    type="text"
                    value={editedData.title}
                    onChange={(e) => setEditedData({ ...editedData, title: e.target.value })}
                  />
                </div>
                <div className="input-row">
                  <div className="input-group">
                    <label>Level</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={editedData.level}
                      onChange={(e) => setEditedData({ ...editedData, level: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                  <div className="input-group">
                    <label>Server</label>
                    <input
                      type="text"
                      value={editedData.server}
                      onChange={(e) => setEditedData({ ...editedData, server: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="profile-display">
                <div className="profile-main">
                  <div className="avatar-large">
                    {playerData.playerName.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="profile-name">{playerData.playerName}</h3>
                    <p className="profile-title">{playerData.title}</p>
                  </div>
                </div>
                <div className="profile-stats">
                  <div className="stat-box">
                    <span className="stat-label">Level</span>
                    <span className="stat-value">{playerData.level}</span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Server</span>
                    <span className="stat-value">{playerData.server}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Favorite Team Showcase */}
            <div className="team-showcase">
              <h4 className="sub-title">Đội Hình Hoạt Động (Active Party)</h4>
              <div className="team-slots">
                {activeCharacters.length > 0 ? (
                  <>
                    {activeCharacters.map((char) => (
                      <div 
                        key={char.id} 
                        className={`team-slot-card glass ${activeLeader === char.id ? 'leader-card border-gold' : ''}`}
                        style={{ '--char-color': char.accentColor }}
                        onClick={() => setActiveTab('teambuilder')}
                      >
                        {activeLeader === char.id && <span className="home-leader-badge">LEADER</span>}
                        {char.image ? (
                          <img src={char.image} alt={char.name} className="home-team-char-img" />
                        ) : (
                          <span className="char-emoji">{char.avatar}</span>
                        )}
                        <span className="char-name">{char.name}</span>
                        <span className="char-role">{char.group}</span>
                      </div>
                    ))}
                    {!activeTeam.includes(activeLeader) && leaderChar && (
                      <div 
                        className="team-slot-card glass external-leader border-orange" 
                        style={{ '--char-color': leaderChar.accentColor }}
                        onClick={() => setActiveTab('teambuilder')}
                      >
                        <span className="home-leader-badge bg-orange">LEADER (OUT)</span>
                        {leaderChar.image ? (
                          <img src={leaderChar.image} alt={leaderChar.name} className="home-team-char-img" />
                        ) : (
                          <span className="char-emoji">{leaderChar.avatar}</span>
                        )}
                        <span className="char-name">{leaderChar.name}</span>
                        <span className="char-role">Chưa vào đội</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="empty-team-placeholder" onClick={() => setActiveTab('teambuilder')}>
                    <p>Chưa có đội hình. Click để lập đội!</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Achievement Card */}
        <section className="achievements-card glass">
          <div className="card-header">
            <h2 className="section-title"><Trophy className="title-icon text-yellow" /> Thành Tựu</h2>
            <span className="progress-badge">
              {playerData.achievements.filter(a => a.unlocked).length} / {playerData.achievements.length} Đã Mở
            </span>
          </div>

          <div className="achievements-list">
            {playerData.achievements.map((ach) => (
              <div 
                key={ach.id} 
                className={`achievement-item glass ${ach.unlocked ? 'unlocked' : 'locked'}`}
                onClick={() => handleAchievementToggle(ach.id)}
              >
                <div className="achievement-icon">
                  {ach.unlocked ? <Award className="icon-gold" /> : <Award className="icon-muted" />}
                </div>
                <div className="achievement-details">
                  <h4 className="achievement-title">{ach.title}</h4>
                  <p className="achievement-desc">{ach.desc}</p>
                </div>
                <div className="achievement-status">
                  <CheckCircle2 size={18} className={ach.unlocked ? 'text-green' : 'text-muted'} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Guides highlight */}
      <section className="latest-articles glass">
        <div className="articles-header">
          <h2 className="section-title"><Calendar className="title-icon" /> Bài viết & Hướng dẫn mới nhất</h2>
          <button className="link-btn" onClick={() => setActiveTab('guides')}>
            Xem tất cả bài viết <ArrowRight size={16} />
          </button>
        </div>
        <div className="articles-grid">
          {GUIDES.slice(0, 2).map((guide) => (
            <div key={guide.id} className="article-preview-card glass" onClick={() => setActiveTab('guides')}>
              <span className="article-category">{guide.category}</span>
              <h3 className="article-title">{guide.title}</h3>
              <p className="article-summary">{guide.summary}</p>
              <div className="article-meta">
                <span>By {guide.author}</span>
                <span>•</span>
                <span>{guide.readTime}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
