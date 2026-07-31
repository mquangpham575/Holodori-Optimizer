import React from 'react';
import { Gamepad2, Shield, Calendar, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './Home.css';

/**
 * Home - Displays landing info, editable personal showcase, and links to guides/characters.
 */
export default function Home({ activeTeam, activeLeader, characters = [], guides = [] }) {
  const navigate = useNavigate();

  const leaderChar = characters.find(c => c.id === activeLeader);
  
  // Build character display list: Leader first, then remaining team units
  let displayCharacters = [];
  if (leaderChar) {
    displayCharacters.push(leaderChar);
  }
  
  activeTeam.forEach(id => {
    const char = characters.find(c => c.id === id);
    if (char && char.id !== activeLeader) {
      displayCharacters.push(char);
    }
  });

  return (
    <div className="home-page animate-fade-in">
      {/* Hero Banner */}
      <section className="hero-section glass glow-card">
        <div className="hero-content">
          <span className="hero-badge"><Gamepad2 size={14} /> NEW RPG FAN-GAME</span>
          <h1 className="hero-title">HOLOLIVE DREAMS</h1>
          <p className="hero-subtitle">
            Embark on a colorful dreamscape alongside your favorite VTubers. Explore detailed stats, build optimal teams, and customize your showcase profile.
          </p>
          <div className="hero-actions">
            <button className="btn-primary" onClick={() => navigate('/characters')}>
              View Characters
            </button>
            <button className="btn-secondary" onClick={() => navigate('/guides')}>
              View Guides <ArrowRight size={16} />
            </button>
          </div>
        </div>
        <div className="hero-visual">
          <div className="floating-sphere sphere-1" />
          <div className="floating-sphere sphere-2" />
        </div>
      </section>

      <div className="showcase-container">
        {/* Active Party Card */}
        <section className="showcase-card glass">
          <div className="card-header">
            <h2 className="section-title"><Shield className="title-icon" /> Active Party</h2>
          </div>

          <div className="profile-container">
            <div className="team-slots">
              {displayCharacters.length > 0 ? (
                <>
                  {displayCharacters.map((char) => (
                    <div 
                      key={char.id} 
                      className={`team-slot-card glass ${activeLeader === char.id ? 'leader-card border-gold' : ''}`}
                      style={{ '--char-color': char.accentColor }}
                      onClick={() => navigate('/builder')}
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
                </>
              ) : (
                <div className="empty-team-placeholder" onClick={() => navigate('/builder')}>
                  <p>No active team. Click to build your team!</p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Guides highlight */}
      <section className="latest-articles glass">
        <div className="articles-header">
          <h2 className="section-title"><Calendar className="title-icon" /> Latest Articles & Guides</h2>
          <button className="link-btn" onClick={() => navigate('/guides')}>
            View all articles <ArrowRight size={16} />
          </button>
        </div>
        <div className="articles-grid">
          {guides.slice(0, 2).map((guide) => (
            <div key={guide.id} className="article-preview-card glass" onClick={() => navigate('/guides')}>
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
