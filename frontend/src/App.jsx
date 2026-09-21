import { Suspense, lazy, useState, useEffect, useMemo, useRef } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './components/Home';
import CharacterDB from './components/CharacterDB';
import Guides from './components/Guides';
import { CHARACTERS } from './data';
import { buildAllCards } from './allCards';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import './App.css';

// The team builder (scoring engine + search worker) and the admin dashboard are
// the bulk of the bundle and most visitors never open them.
const TeamBuilder = lazy(() => import('./components/TeamBuilder'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));

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

// localStorage can throw (Safari private mode, blocked site data) and can hold
// corrupt JSON. Neither should be able to blank the whole app on startup.
const storageGet = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const storageSet = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: keep working in memory */
  }
};
const safeJsonParse = (raw, fallback) => {
  if (raw == null) return fallback;
  try {
    const value = JSON.parse(raw);
    return value ?? fallback;
  } catch {
    return fallback;
  }
};

// The device id is the only "credential" guarding a device's presets/roster on
// the server, so it must be unguessable (Math.random is not).
let memoryDeviceId = null;
const generateDeviceId = () => {
  const c = globalThis.crypto;
  if (c?.randomUUID) return 'dev_' + c.randomUUID().replace(/-/g, '');
  const bytes = new Uint8Array(16);
  c?.getRandomValues?.(bytes);
  return 'dev_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};
const getOrCreateDeviceId = () => {
  let id = storageGet('holodreams_device_id') || memoryDeviceId;
  if (!id) {
    id = generateDeviceId();
    memoryDeviceId = id;
    storageSet('holodreams_device_id', id);
  }
  return id;
};

// Coerce roster entries into the {id, bloom, level} shape the API validates.
const sanitizeRoster = (roster) =>
  (Array.isArray(roster) ? roster : [])
    .map((item) => {
      if (typeof item === 'string') return item;
      if (!item || typeof item.id !== 'string') return null;
      const out = { id: item.id };
      if (Number.isInteger(item.bloom) && item.bloom >= 0 && item.bloom <= 10) out.bloom = item.bloom;
      if (Number.isInteger(item.level) && item.level >= 1 && item.level <= 80) out.level = item.level;
      return out;
    })
    .filter(Boolean);

function App() {
  const [notification, setNotification] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [presets, setPresets] = useState([]);
  const [selectedPresetId, setSelectedPresetId] = useState('preset_1');
  const [defaultRoster, setDefaultRoster] = useState([]);
  const [rosterByPreset, setRosterByPreset] = useState(() =>
    safeJsonParse(storageGet('holodreams_roster_by_preset'), {})
  );
  const rosterSyncTimer = useRef(null);
  const ownedRoster = rosterByPreset[selectedPresetId] ?? defaultRoster;
  const [guides, setGuides] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const API_BASE = import.meta.env.VITE_API_BASE_URL || (
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? ''
      : 'https://site--hololive-dream--mv2hgs5fgpjc.code.run'
  );

  const [deviceId] = useState(getOrCreateDeviceId);

  const allCards = useMemo(() => buildAllCards(characters), [characters]);

  // Load theme accent color from localStorage or default (Sora Blue)
  const [themeAccent] = useState(() => {
    return storageGet('holodreams_theme_accent') || '#3a86ff';
  });

  // Apply theme accent colors dynamically to CSS custom variables
  useEffect(() => {
    const rgb = hexToRgb(themeAccent);
    document.documentElement.style.setProperty('--accent-color', themeAccent);
    document.documentElement.style.setProperty('--accent-glow', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`);
    document.documentElement.style.setProperty('--accent-glow-strong', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5)`);
    storageSet('holodreams_theme_accent', themeAccent);
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
        setDefaultRoster(rosterData);
        setGuides(guidesData);
      } catch (err) {
        console.error("Backend fetch failed, loading fallback state:", err);
        // Load fallback presets from local storage
        const savedPresets = safeJsonParse(storageGet('holodreams_presets'), null);
        if (Array.isArray(savedPresets) && savedPresets.length > 0) {
          setPresets(savedPresets);
        } else {
          // Migration fallback
          const savedOld = storageGet('holodreams_player_data');
          let oldTeam = [null, null, null, null, null];
          let oldLeader = null;
          if (savedOld) {
            const parsed = safeJsonParse(savedOld, {});
            if (Array.isArray(parsed.favoriteTeam)) {
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
        const savedRoster = safeJsonParse(storageGet('holodreams_owned_roster'), null);
        if (Array.isArray(savedRoster)) {
          setDefaultRoster(savedRoster);
        } else {
          setDefaultRoster(CHARACTERS.map(c => c.id));
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
      storageSet('holodreams_presets', JSON.stringify(updatedPresets));
      const activePreset = updatedPresets.find(p => p.isActive) || updatedPresets[0];
      const oldData = { favoriteTeam: activePreset.team, favoriteLeader: activePreset.leader };
      storageSet('holodreams_player_data', JSON.stringify(oldData));
      showNotification('Presets saved locally (offline mode)', 'warning');
    }
  };

  const handleUpdateOwnedRoster = (newRoster) => {
    setRosterByPreset((prev) => {
      const next = { ...prev, [selectedPresetId]: newRoster };
      storageSet('holodreams_roster_by_preset', JSON.stringify(next));
      return next;
    });

    // The roster used to live only in localStorage: GET /api/roster was read on
    // load but nothing ever PUT it, so it never reached the database and was
    // lost on a new browser/device. Push it (debounced) as the device roster;
    // per-preset variants stay local and fall back to this one elsewhere.
    clearTimeout(rosterSyncTimer.current);
    rosterSyncTimer.current = setTimeout(() => {
      fetch(`${API_BASE}/api/roster`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
        body: JSON.stringify(sanitizeRoster(newRoster)),
      })
        .then((res) => {
          if (!res.ok) console.error('Roster sync rejected by server:', res.status);
        })
        .catch((err) => console.error('Roster sync failed (kept locally):', err));
    }, 800);
  };

  useEffect(() => () => clearTimeout(rosterSyncTimer.current), []);

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
        <Suspense fallback={<div className="route-loading" role="status" aria-live="polite">Loading…</div>}>
        <Routes>
          <Route 
            path="/" 
            element={
              <Home 
                activeTeam={activePreset.team} 
                activeLeader={activePreset.leader}
                activeLevels={activePreset.cardLevels}
                activeBloomLevels={activePreset.bloomLevels}
                activeSelectedCards={activePreset.selectedCards}
                characters={characters}
                guides={guides}
              />
            } 
          />
          <Route 
            path="/:lang" 
            element={
              <Home 
                activeTeam={activePreset.team} 
                activeLeader={activePreset.leader}
                activeLevels={activePreset.cardLevels}
                activeBloomLevels={activePreset.bloomLevels}
                activeSelectedCards={activePreset.selectedCards}
                characters={characters}
                guides={guides}
              />
            } 
          />
          <Route 
            path="/characters" 
            element={
              <CharacterDB 
                characters={characters}
                allCards={allCards}
                ownedRoster={ownedRoster}
              />
            } 
          />
          <Route 
            path="/characters/:lang" 
            element={
              <CharacterDB 
                characters={characters}
                allCards={allCards}
                ownedRoster={ownedRoster}
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
                onSavePresets={(updated) => handleSavePresets(updated)}
                ownedRoster={ownedRoster}
                onUpdateOwnedRoster={handleUpdateOwnedRoster}
                characters={characters}
                allCards={allCards}
              />
            } 
          />
          <Route 
            path="/builder/:lang" 
            element={
              <TeamBuilder 
                presets={presets}
                selectedPresetId={selectedPresetId}
                setSelectedPresetId={setSelectedPresetId}
                onUpdatePreset={handleUpdatePreset}
                onSavePresets={(updated) => handleSavePresets(updated)}
                ownedRoster={ownedRoster}
                onUpdateOwnedRoster={handleUpdateOwnedRoster}
                characters={characters}
                allCards={allCards}
              />
            } 
          />
          <Route path="/guides" element={<Guides guides={guides} />} />
          <Route path="/guides/:lang" element={<Guides guides={guides} />} />
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
          <Route 
            path="/admin/:lang" 
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
          <Route path="/home/:lang" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
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
