import React from 'react';
import { Home, Users, Layers, BookOpen, Sparkles } from 'lucide-react';
import './Navbar.css';

/**
 * Navbar - Premium navigation header for the application.
 */
export default function Navbar({ activeTab, setActiveTab, playerData }) {
  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'characters', label: 'Characters', icon: Users },
    { id: 'teambuilder', label: 'Team Builder', icon: Layers },
    { id: 'guides', label: 'Guides', icon: BookOpen }
  ];

  return (
    <header className="navbar glass">
      <div className="nav-container">
        <div className="brand" onClick={() => setActiveTab('home')}>
          <Sparkles className="brand-icon" />
          <span className="brand-title">HoloDreams <span className="title-glow">Showcase</span></span>
        </div>

        <nav className="nav-links">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setActiveTab(item.id)}
              >
                <Icon size={18} className="nav-icon" />
                <span className="nav-label">{item.label}</span>
                {isActive && <span className="active-indicator" />}
              </button>
            );
          })}
        </nav>

        <div className="player-badge" onClick={() => setActiveTab('home')}>
          <div className="player-info">
            <span className="player-name">{playerData.playerName}</span>
            <span className="player-level">LV.{playerData.level}</span>
          </div>
          <div className="player-avatar">
            {playerData.playerName.substring(0, 2).toUpperCase()}
          </div>
        </div>
      </div>
    </header>
  );
}
