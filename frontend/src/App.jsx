import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './components/Home';
import CharacterDB from './components/CharacterDB';
import TeamBuilder from './components/TeamBuilder';
import Guides from './components/Guides';
import AdminDashboard from './components/AdminDashboard';
import { CHARACTERS } from './data';
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

const idMigrationMap = {
  "sora": "tokinosora",
  "suisei": "hoshimachisuisei",
  "pekora": "usadapekora",
  "marine": "houshoumarine",
  "calli": "calliopemori",
  "kobo": "kobokanaeru",
  "fubuki": "shirakamifubuki",
  "kanade": "otonosekanade"
};

const migrateIds = (id) => idMigrationMap[id] || id;

const getOrCreateDeviceId = () => {
  let id = localStorage.getItem('holodreams_device_id');
  if (!id) {
    id = 'dev_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('holodreams_device_id', id);
  }
  return id;
};

function App() {
  const [notification, setNotification] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [presets, setPresets] = useState([]);
  const [selectedPresetId, setSelectedPresetId] = useState('preset_1');
  const [ownedRoster, setOwnedRoster] = useState([]);
  const [guides, setGuides] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const API_BASE = import.meta.env.VITE_API_BASE_URL || (
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? ''
      : 'https://site--hololive-dream--mv2hgs5fgpjc.code.run'
  );

  const deviceId = getOrCreateDeviceId();

  // Load theme accent color from localStorage or default (Sora Blue)
  const [themeAccent, setThemeAccent] = useState(() => {
    return localStorage.getItem('holodreams_theme_accent') || '#3a86ff';
  });

  // Apply theme accent colors dynamically to CSS custom variables
  useEffect(() => {
    const rgb = hexToRgb(themeAccent);
    document.documentElement.style.setProperty('--accent-color', themeAccent);
    document.documentElement.style.setProperty('--accent-glow', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`);
    document.documentElement.style.setProperty('--accent-glow-strong', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5)`);
    localStorage.setItem('holodreams_theme_accent', themeAccent);
  }, [themeAccent]);

  // Fetch initial data from backend API with offline fallback
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [charsRes, presetsRes, rosterRes, guidesRes] = await Promise.all([
          fetch(`${API_BASE}/api/characters`),
          fetch(`${API_BASE}/api/presets`, { headers: { 'x-device-id': deviceId } }),
          fetch(`${API_BASE}/api/roster`, { headers: { 'x-device-id': deviceId } }),
          fetch(`${API_BASE}/api/guides`)
        ]);
        
        if (!charsRes.ok || !presetsRes.ok || !rosterRes.ok || !guidesRes.ok) {
          throw new Error("Failed to load databases from backend");
        }
        
        const chars = await charsRes.json();
        const presetsData = await presetsRes.json();
        const rosterData = await rosterRes.json();
        const guidesData = await guidesRes.json();
        
        // Sort characters in exact chronological game order defined in data.js
        const originalOrder = CHARACTERS.map(c => c.id);
        chars.sort((a, b) => {
          const idxA = originalOrder.indexOf(a.id);
          const idxB = originalOrder.indexOf(b.id);
          if (idxA === -1 && idxB === -1) return 0;
          if (idxA === -1) return 1;
          if (idxB === -1) return -1;
          return idxA - idxB;
        });
        
        setCharacters(chars);
        setPresets(presetsData);
        setOwnedRoster(rosterData);
        setGuides(guidesData);
      } catch (err) {
        console.error("Backend fetch failed, loading fallback state:", err);
        // Load fallback presets from local storage
        const savedPresets = localStorage.getItem('holodreams_presets');
        if (savedPresets) {
          setPresets(JSON.parse(savedPresets));
        } else {
          // Migration fallback
          const savedOld = localStorage.getItem('holodreams_player_data');
          let oldTeam = [null, null, null, null, null];
          let oldLeader = null;
          if (savedOld) {
            const parsed = JSON.parse(savedOld);
            if (parsed.favoriteTeam) {
              oldTeam = parsed.favoriteTeam.map(migrateIds);
            }
            if (parsed.favoriteLeader) {
              oldLeader = migrateIds(parsed.favoriteLeader);
            }
          }
          setPresets([
            { id: 'preset_1', name: 'Preset 1', team: oldTeam, leader: oldLeader, isActive: true },
            { id: 'preset_2', name: 'Preset 2', team: [null, null, null, null, null], leader: null, isActive: false },
            { id: 'preset_3', name: 'Preset 3', team: [null, null, null, null, null], leader: null, isActive: false },
            { id: 'preset_4', name: 'Preset 4', team: [null, null, null, null, null], leader: null, isActive: false },
            { id: 'preset_5', name: 'Preset 5', team: [null, null, null, null, null], leader: null, isActive: false }
          ]);
        }
        
        // Load fallback roster
        const savedRoster = localStorage.getItem('holodreams_owned_roster');
        if (savedRoster) {
          setOwnedRoster(JSON.parse(savedRoster));
        } else {
          setOwnedRoster(CHARACTERS.map(c => c.id));
        }
        
        setCharacters(CHARACTERS);
        try {
          const module = await import('./data');
          setGuides(module.GUIDES);
        } catch (e) {
          console.error("Failed to load fallback guides:", e);
        }
        showNotification("Loaded database in local offline mode", "error");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, [API_BASE, deviceId]);

  const handleAccentChange = (hexColor) => {
    setThemeAccent(hexColor);
    showNotification('Theme Accent Synced!', 'success');
  };

  const handleUpdatePreset = (presetId, updatedFields) => {
    setPresets(prev => prev.map(p => {
      if (p.id === presetId) {
        return { ...p, ...updatedFields };
      }
      // If we set a preset as active, deactivate all other presets
      if (updatedFields.isActive && p.id !== presetId) {
        return { ...p, isActive: false };
      }
      return p;
    }));
  };

  const handleSavePresets = async (updatedPresets = presets) => {
    try {
      const res = await fetch(`${API_BASE}/api/presets`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': deviceId
        },
        body: JSON.stringify(updatedPresets)
      });
      if (res.ok) {
        showNotification('Presets saved successfully to database!', 'success');
      } else {
        throw new Error("Server error");
      }
    } catch (err) {
      console.error("Error saving presets to backend, using local storage:", err);
      localStorage.setItem('holodreams_presets', JSON.stringify(updatedPresets));
      const activePreset = updatedPresets.find(p => p.isActive) || updatedPresets[0];
      const oldData = { favoriteTeam: activePreset.team, favoriteLeader: activePreset.leader };
      localStorage.setItem('holodreams_player_data', JSON.stringify(oldData));
      showNotification('Presets saved locally (offline mode)', 'warning');
    }
  };

  const handleUpdateOwnedRoster = async (newRoster) => {
    setOwnedRoster(newRoster);
    try {
      await fetch(`${API_BASE}/api/roster`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': deviceId
        },
        body: JSON.stringify(newRoster)
      });
    } catch (err) {
      console.error("Error saving roster to backend:", err);
      localStorage.setItem('holodreams_owned_roster', JSON.stringify(newRoster));
    }
  };

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 3000);
  };

  if (isLoading) {
    return (
      <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0a14', color: '#fff' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ border: '4px solid rgba(255,255,255,0.1)', borderLeftColor: 'var(--accent-color, #3a86ff)', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite', margin: '0 auto 1rem auto' }}></div>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Loading HoloDreams Database...</p>
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </div>
    );
  }

  const activePreset = presets.find(p => p.isActive) || presets[0];

  return (
    <div className="app-container">
      {/* Global Toast Notification */}
      {notification && (
        <div className={`toast-notification glass ${notification.type === 'success' ? 'toast-success' : 'toast-error'}`}>
          {notification.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{notification.message}</span>
        </div>
      )}

      <Navbar API_BASE={API_BASE} />

      <main className="main-content-layout">
        <Routes>
          <Route 
            path="/" 
            element={
              <Home 
                activeTeam={activePreset.team} 
                activeLeader={activePreset.leader}
                characters={characters}
                guides={guides}
              />
            } 
          />
          <Route 
            path="/characters" 
            element={
              <CharacterDB 
                onAccentChange={handleAccentChange} 
                currentAccent={themeAccent} 
                characters={characters}
              />
            } 
          />
          <Route 
            path="/builder" 
            element={
              <TeamBuilder 
                presets={presets}
                selectedPresetId={selectedPresetId}
                setSelectedPresetId={setSelectedPresetId}
                onUpdatePreset={handleUpdatePreset}
                onSavePresets={() => handleSavePresets(presets)}
                ownedRoster={ownedRoster}
                onUpdateOwnedRoster={handleUpdateOwnedRoster}
                characters={characters}
              />
            } 
          />
          <Route path="/guides" element={<Guides guides={guides} />} />
          <Route 
            path="/admin" 
            element={
              <AdminDashboard 
                characters={characters} 
                setCharacters={setCharacters} 
                guides={guides} 
                setGuides={setGuides} 
                API_BASE={API_BASE}
              />
            } 
          />
          <Route path="/home" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
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
