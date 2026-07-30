import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Home from './components/Home';
import CharacterDB from './components/CharacterDB';
import TeamBuilder from './components/TeamBuilder';
import Guides from './components/Guides';
import { DEFAULT_USER_SHOWCASE } from './data';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import './App.css';

// Helper function to parse hex to RGB
const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 195, b: 255 }; // fallback Gura Blue
};

function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [notification, setNotification] = useState(null);

  // Load player data from localStorage or default
  const [playerData, setPlayerData] = useState(() => {
    const saved = localStorage.getItem('holodreams_player_data');
    return saved ? JSON.parse(saved) : DEFAULT_USER_SHOWCASE;
  });

  // Load team selection state (5 slots)
  const [activeTeam, setActiveTeam] = useState(() => {
    const saved = localStorage.getItem('holodreams_player_data');
    if (saved) {
      const data = JSON.parse(saved);
      return data.favoriteTeam || DEFAULT_USER_SHOWCASE.favoriteTeam;
    }
    return DEFAULT_USER_SHOWCASE.favoriteTeam;
  });

  // Load active leader state
  const [activeLeader, setActiveLeader] = useState(() => {
    const saved = localStorage.getItem('holodreams_player_data');
    if (saved) {
      const data = JSON.parse(saved);
      return data.favoriteLeader || DEFAULT_USER_SHOWCASE.favoriteLeader;
    }
    return DEFAULT_USER_SHOWCASE.favoriteLeader;
  });

  // Load theme accent color from localStorage or default (Sora Blue)
  const [themeAccent, setThemeAccent] = useState(() => {
    return localStorage.getItem('holodreams_theme_accent') || '#3a86ff';
  });

  // Persist player data updates
  useEffect(() => {
    localStorage.setItem('holodreams_player_data', JSON.stringify(playerData));
  }, [playerData]);

  // Apply theme accent colors dynamically to CSS custom variables
  useEffect(() => {
    const rgb = hexToRgb(themeAccent);
    document.documentElement.style.setProperty('--accent-color', themeAccent);
    document.documentElement.style.setProperty('--accent-glow', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`);
    document.documentElement.style.setProperty('--accent-glow-strong', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5)`);
    localStorage.setItem('holodreams_theme_accent', themeAccent);
  }, [themeAccent]);

  const handleAccentChange = (hexColor) => {
    setThemeAccent(hexColor);
    showNotification('Theme Accent Synced!', 'success');
  };

  const handleSaveTeam = () => {
    const updatedData = { ...playerData, favoriteTeam: activeTeam, favoriteLeader: activeLeader };
    setPlayerData(updatedData);
    showNotification('Đội hình của bạn đã được cập nhật!', 'success');
  };

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 3000);
  };

  return (
    <div className="app-container">
      {/* Global Toast Notification */}
      {notification && (
        <div className={`toast-notification glass ${notification.type === 'success' ? 'toast-success' : 'toast-error'}`}>
          {notification.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{notification.message}</span>
        </div>
      )}

      <Navbar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        playerData={playerData} 
      />

      <main className="main-content-layout">
        {activeTab === 'home' && (
          <Home 
            activeTeam={activeTeam} 
            activeLeader={activeLeader}
            setActiveTab={setActiveTab} 
            playerData={playerData} 
            setPlayerData={setPlayerData} 
          />
        )}
        {activeTab === 'characters' && (
          <CharacterDB 
            onAccentChange={handleAccentChange} 
            currentAccent={themeAccent} 
          />
        )}
        {activeTab === 'teambuilder' && (
          <TeamBuilder 
            activeTeam={activeTeam} 
            setActiveTeam={setActiveTeam} 
            activeLeader={activeLeader}
            setActiveLeader={setActiveLeader}
            onSaveTeam={handleSaveTeam} 
          />
        )}
        {activeTab === 'guides' && (
          <Guides />
        )}
      </main>

      <footer className="footer glass">
        <p className="footer-copyright">
          © {new Date().getFullYear()} HoloDreams Showcase.
        </p>
        <p className="footer-disclaimer">
          This is a fan-made database and showcase site for the fan-game "Hololive Dreams". All Hololive production assets and characters belong to COVER Corp.
        </p>
      </footer>
    </div>
  );
}

export default App;
