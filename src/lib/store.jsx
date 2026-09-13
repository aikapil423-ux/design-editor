import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const AppCtx = createContext(null);

export const useApp = () => useContext(AppCtx);

const LS = {
  projects: 'dm_projects',
  trash: 'dm_trash',
  settings: 'dm_settings',
  history: 'dm_history',
  profile: 'dm_profile',
};

export const loadJSON = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

export const saveJSON = (key, val) => {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* storage full — ignore */
  }
};

export const makeThumb = async (label, palette, w = 520, h = 320) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, w, h);
  palette.forEach((col, i) => g.addColorStop(i / Math.max(palette.length - 1, 1), col));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = `bold ${h / 5}px 'Segoe UI'`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (label.length > 8) {
    const first = label.slice(0, 1);
    ctx.font = `bold ${h / 3}px 'Segoe UI'`;
    ctx.fillText(first, w / 2, h / 2);
    if (label) {
      ctx.font = `${h / 22}px 'Segoe UI'`;
      ctx.fillText(label, w / 2, h - h / 10);
    }
  } else {
    ctx.fillText(label, w / 2, h / 2);
  }
  return c.toDataURL('image/jpeg', 0.82);
};

const seedProjects = () => {
  const now = Date.now();
  const mk = async (id, name, type, res, dur, pal, editedDaysAgo, fav) => ({
    id,
    name,
    type, // photo | video | collage | ai | template
    res,
    duration: dur,
    createdAt: now - 86400000 * 12,
    modifiedAt: now - 86400000 * editedDaysAgo,
    thumbnail: await makeThumb(name, pal),
    favorite: !!fav,
    inTrash: false,
  });
  return Promise.all([
    mk('p1', 'Sunset Reel', 'video', '1080x1920', '18s', ['#ff7a18', '#af002d', '#1a0210'], 0, true),
    mk('p2', 'Wedding Invite', 'template', '1080x1350', '', ['#f6d365', '#fda085', '#7b2c5f'], 1),
    mk('p3', 'Product Launch', 'photo', '1200x1200', '', ['#0f2027', '#2c5364', '#7d12ff'], 2),
    mk('p4', 'Travel Montage', 'video', '1080x1080', '42s', ['#11998e', '#38ef7d', '#0f3443'], 3),
    mk('p5', 'Neon Poster', 'ai', '1080x1080', '', ['#ee0979', '#ff6a00'], 4, true),
    mk('p6', 'Portrait Retouch', 'photo', '1536x2048', '', ['#3a1c71', '#d76d77', '#ffaf7b'], 5),
  ]);
};

export const SEARCH_TEMPLATES = [
  { id: 'ig', name: 'Instagram Post' },
  { id: 'igst', name: 'Instagram Story' },
  { id: 'fb', name: 'Facebook Cover' },
  { id: 'yt', name: 'YouTube Thumbnail' },
  { id: 'tt', name: 'TikTok Video' },
  { id: 'poster', name: 'Poster' },
];

export const AppProvider = ({ children }) => {
  const [view, setView] = useState({ name: 'home', params: {} });
  const [toasts, setToasts] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const toastId = useRef(0);
  const [projects, setProjects] = useState(() => loadJSON(LS.projects, null));
  const [trash, setTrash] = useState(() => loadJSON(LS.trash, []));
  const [settings, setSettings] = useState(() => loadJSON(LS.settings, { theme: 'duotone', autosave: true, exportFps: 30, exportQuality: 'high' }));
  const [aiHistory, setAiHistory] = useState(() => loadJSON(LS.history, []));
  const [profile, setProfile] = useState(() => loadJSON(LS.profile, { name: 'Creative Pro', email: 'creator@studio.pro', plan: 'Free', avatar: null }));

  useEffect(() => {
    if (projects === null) {
      seedProjects().then((arr) => {
        setProjects(arr);
        saveJSON(LS.projects, arr);
      });
    }
  }, [projects]);

  const notify = useCallback((msg, type = 'success') => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  const navigate = useCallback((name, params = {}) => {
    setView({ name, params });
    window.scrollTo(0, 0);
  }, []);

  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  const saveProjects = useCallback((list) => {
    setProjects(list);
    saveJSON(LS.projects, list);
  }, []);

  const upsertProject = useCallback((proj) => {
    setProjects((list) => {
      const next = list.some((p) => p.id === proj.id)
        ? list.map((p) => (p.id === proj.id ? { ...p, ...proj } : p))
        : [proj, ...list];
      saveJSON(LS.projects, next);
      return next;
    });
  }, []);

  const moveToTrash = useCallback((ids) => {
    setProjects((list) => {
      const doomed = list.filter((p) => ids.includes(p.id));
      const rest = list.filter((p) => !ids.includes(p.id));
      saveJSON(LS.projects, rest);
      setTrash((t) => {
        const next = [...t, ...doomed.map((d) => ({ ...d, inTrash: true, deletedAt: Date.now() }))];
        saveJSON(LS.trash, next);
        return next;
      });
      return rest;
    });
  }, []);

  const restoreFromTrash = useCallback((ids) => {
    setTrash((t) => {
      const back = t.filter((p) => ids.includes(p.id));
      const rest = t.filter((p) => !ids.includes(p.id));
      saveJSON(LS.trash, rest);
      setProjects((list) => {
        const next = [...back.map((b) => ({ ...b, inTrash: false })), ...list];
        saveJSON(LS.projects, next);
        return next;
      });
      return rest;
    });
  }, []);

  const purgeTrash = useCallback((ids) => {
    setTrash((t) => {
      const next = t.filter((p) => !ids.includes(p.id));
      saveJSON(LS.trash, next);
      return next;
    });
  }, []);

  const addAI = useCallback((entry) => {
    setAiHistory((h) => {
      const next = [{ ...entry, id: (entry.id || Math.random().toString(36).slice(2)), date: Date.now() }, ...h].slice(0, 60);
      saveJSON(LS.history, next);
      return next;
    });
  }, []);

  const removeAI = useCallback((id) => {
    setAiHistory((h) => {
      const next = h.filter((x) => x.id !== id);
      saveJSON(LS.history, next);
      return next;
    });
  }, []);

  const updateSettings = useCallback((patch) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      saveJSON(LS.settings, next);
      return next;
    });
  }, []);

  const updateProfile = useCallback((patch) => {
    setProfile((p) => {
      const next = { ...p, ...patch };
      saveJSON(LS.profile, next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      view,
      navigate,
      toasts,
      notify,
      searchOpen,
      openSearch,
      closeSearch,
      projects,
      trash,
      saveProjects,
      upsertProject,
      moveToTrash,
      restoreFromTrash,
      purgeTrash,
      settings,
      updateSettings,
      aiHistory,
      addAI,
      removeAI,
      profile,
      updateProfile,
    }),
    [view, toasts, projects, trash, settings, aiHistory, profile, notify, navigate, searchOpen, openSearch, closeSearch, saveProjects, upsertProject, moveToTrash, restoreFromTrash, purgeTrash, updateSettings, addAI, removeAI, updateProfile]
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
};

export { LS };