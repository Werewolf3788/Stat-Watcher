import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Trophy, 
  Shield, 
  MapPin, 
  Users, 
  Crosshair, 
  BookOpen, 
  Package, 
  Search, 
  RefreshCw, 
  Check, 
  Plus, 
  Minus, 
  ExternalLink, 
  User as UserIcon, 
  LogOut, 
  Key, 
  Sparkles,
  ChevronDown,
  Flame,
  Gamepad2,
  Bookmark,
  Folder,
  Home as HomeIcon,
  Copy,
  CheckCircle2,
  Menu,
  X
} from 'lucide-react';
import { 
  loginWithGoogle, 
  logoutUser, 
  subscribeToAuth, 
  saveGameProgressToFirestore, 
  loadGameProgressFromFirestore,
  migrateGuestProgressToFirestore,
  fetchUserProfile,
  fetchUtmNavigation,
  fetchGamePosterArt,
  fetchLivePsnTrophies,
  fetchFriendsProgress,
  linkFriendCodeToRtdb,
  getEmailKey,
  UserRtdbProfile,
  UtmMenuGroup,
  UtmMenuItem
} from './services/firebase';
import { 
  fetchPsnData, 
  filterRecentTrophies, 
  scrapeFandomWikiGuide, 
  scanAvailableGames,
  GameGuideData 
} from './services/scraper';

interface GameCatalogItem {
  id: string;
  name: string;
  file: string;
  commId?: string;
}

// Default initial games catalog
const INITIAL_GAMES: GameCatalogItem[] = [
  { id: 'FarCry5', name: 'Far Cry 5', file: '/game/data/FarCry5.json', commId: 'NPWR12514_00' },
  { id: 'GhostOfTsushima', name: 'Ghost of Tsushima', file: '/game/data/GhostOfTsushima.json', commId: 'CUSA11456_00' }
];

export default function App() {
  // Navigation & UTM Links State
  const [homeLink, setHomeLink] = useState<UtmMenuItem | null>(null);
  const [navMenuGroups, setNavMenuGroups] = useState<UtmMenuGroup[]>([]);
  const [activeOpenFolder, setActiveOpenFolder] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // Authentication & RTDB Profile State
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserRtdbProfile | null>(null);
  const [friendCode, setFriendCode] = useState<string>('TLWWTSNU');
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [platform, setPlatform] = useState<string>('ps'); // 'ps', 'xbox', 'pc', 'steam'
  const [friendsList, setFriendsList] = useState<any[]>([]);
  const [newFriendCodeInput, setNewFriendCodeInput] = useState<string>('');
  const [friendStatusMsg, setFriendStatusMsg] = useState<string>('');

  // Active Game State
  const [gameCatalog, setGameCatalog] = useState(INITIAL_GAMES);
  const [activeGameId, setActiveGameId] = useState<string>('FarCry5');
  const userHasPickedGameRef = useRef<boolean>(false);
  const [gameData, setGameData] = useState<GameGuideData | null>(null);
  const [posterArtUrl, setPosterArtUrl] = useState<string | null>(null);
  const [loadingGame, setLoadingGame] = useState<boolean>(true);
  const [statusMessage, setStatusMessage] = useState<string>('Initializing Resistance Terminal...');

  // Active Item Checklists State (Isolated per platform)
  const [stashesState, setStashesState] = useState<Record<string, { collected: boolean }>>({});
  const [rosterState, setRosterState] = useState<Record<string, { unlocked: boolean }>>({});
  const [collectiblesState, setCollectiblesState] = useState<Record<string, { collected: boolean; items: Record<string, { collected: boolean }> }>>({});
  const [missionsState, setMissionsState] = useState<Record<string, { completed: boolean }>>({});
  const [trophiesState, setTrophiesState] = useState<Record<string, { earned: boolean; psnSynced?: boolean }>>({});
  
  // Tactical Metrics Counters
  const [metricsRanks, setMetricsRanks] = useState<Record<string, number>>({
    rp: 0,
    outposts: 0,
    cultProperty: 0,
    stashes: 0,
    roster: 0,
    perks: 0,
    collectibles: 0
  });

  // Recent PSN Trophy info
  const [recentPsnTrophy, setRecentPsnTrophy] = useState<any | null>(null);

  // UI Navigation & Filters
  const [activeTab, setActiveTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    walkthroughs: true,
    stashes: true,
    collectibles: true,
    roster: true,
    trophies: true
  });

  // Scraper Modal
  const [isScrapeModalOpen, setIsScrapeModalOpen] = useState<boolean>(false);
  const [scrapeGameInput, setScrapeGameInput] = useState<string>('');
  const [isScraping, setIsScraping] = useState<boolean>(false);
  const [isRescanningFolder, setIsRescanningFolder] = useState<boolean>(false);

  // Dynamic Folder Scanner: checks game/data/ for any new JSON files
  const handleRescanFolder = useCallback(async () => {
    setIsRescanningFolder(true);
    setStatusMessage('Scanning game/data/ for JSON game ledgers...');
    try {
      const discovered = await scanAvailableGames();
      if (discovered && discovered.length > 0) {
        setGameCatalog(discovered);
        setStatusMessage(`[Folder Scanner] ${discovered.length} game ledger(s) active in game/data/`);
      }
    } catch (e: any) {
      console.warn('Folder scan error:', e);
      setStatusMessage(`Folder scan warning: ${e.message}`);
    } finally {
      setIsRescanningFolder(false);
    }
  }, []);

  // Run folder scanner on initial mount
  useEffect(() => {
    handleRescanFolder();
  }, [handleRescanFolder]);

  // Live New York Clock
  const [nyTime, setNyTime] = useState<string>('--:--:--');
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setNyTime(now.toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }));
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch centered top navigation from RTDB /utm_links
  useEffect(() => {
    fetchUtmNavigation().then(({ homeItem, menuGroups }) => {
      setHomeLink(homeItem);
      setNavMenuGroups(menuGroups);
    });
  }, []);

  // Subscribe to Firebase Auth and fetch RTDB User Profile
  useEffect(() => {
    const unsubscribe = subscribeToAuth(async (user) => {
      setCurrentUser(user);
      if (user && user.email) {
        setStatusMessage(`Loading profile from RTDB for ${user.email}...`);
        const profile = await fetchUserProfile(user.email);
        setUserProfile(profile);

        const currentFriendCode = profile?.friend_code || 'TLWWTSNU';
        setFriendCode(currentFriendCode);

        // Perform one-time migration of any guest checks into Firestore
        const migratedCount = await migrateGuestProgressToFirestore(currentFriendCode);
        if (migratedCount > 0) {
          setStatusMessage(`[Imported] Migrated ${migratedCount} local guest save(s) to Firestore.`);
        } else {
          setStatusMessage(`[Connected] Authenticated to Firestore under /users/${currentFriendCode}`);
        }
      } else {
        setUserProfile(null);
        setStatusMessage('[Guest Mode] Unauthenticated checks are cached locally on this device.');
      }
    });
    return () => unsubscribe();
  }, []);

  // Initial PSN telemetry check - runs ONCE on mount without resetting user choices
  useEffect(() => {
    fetchPsnData().then((psnData) => {
      if (psnData) {
        const result = filterRecentTrophies(psnData);
        if (result.trophy) {
          setRecentPsnTrophy(result.trophy);
          // Only auto-pick on initial mount if the user hasn't explicitly selected a game
          if (!userHasPickedGameRef.current) {
            const match = INITIAL_GAMES.find(g => g.name.toLowerCase() === result.activeGame.toLowerCase());
            if (match) {
              setActiveGameId(match.id);
            }
          }
        }
      }
    }).catch(console.warn);
  }, []);

  // Helper to dynamically update favicon and apple-touch-icon with game poster art
  const updateDynamicFavicon = useCallback((imageUrl: string | null) => {
    if (!imageUrl) return;
    try {
      let iconLink: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
      if (!iconLink) {
        iconLink = document.createElement('link');
        iconLink.rel = 'icon';
        document.head.appendChild(iconLink);
      }
      iconLink.href = imageUrl;

      let appleIcon: HTMLLinkElement | null = document.querySelector("link[rel='apple-touch-icon']");
      if (!appleIcon) {
        appleIcon = document.createElement('link');
        appleIcon.rel = 'apple-touch-icon';
        document.head.appendChild(appleIcon);
      }
      appleIcon.href = imageUrl;
    } catch (e) {}
  }, []);

  // Load Game Guide & hydrate platform progress
  const loadGameData = useCallback(async (gameId: string, currentPlatform: string) => {
    setLoadingGame(true);
    setStatusMessage(`Loading tactical guide for ${gameId} on [${currentPlatform.toUpperCase()}]...`);
    try {
      let data: GameGuideData | null = null;
      const catalogEntry = gameCatalog.find(g => g.id === gameId);
      const url = catalogEntry ? catalogEntry.file : `/game/data/${gameId}.json`;

      try {
        const res = await fetch(url);
        if (res.ok) data = await res.json();
      } catch (e) {}

      if (!data) {
        data = await scrapeFandomWikiGuide(catalogEntry?.name || gameId);
      }

      setGameData(data);

      // Fetch poster art from RTDB if commId available
      const commId = data.psn_communication_id || catalogEntry?.commId;
      if (commId) {
        const poster = await fetchGamePosterArt(commId);
        if (poster) {
          setPosterArtUrl(poster);
          updateDynamicFavicon(poster);
        }
      }

      // Initialize progress specifically for this platform
      await initializePlatformProgress(gameId, currentPlatform, data);
      setStatusMessage(`Guide ready for ${data.game} [${currentPlatform.toUpperCase()}].`);
    } catch (err: any) {
      console.error('Failed to load game data:', err);
      setStatusMessage(`Failed to load game guide: ${err.message}`);
    } finally {
      setLoadingGame(false);
    }
  }, [gameCatalog, updateDynamicFavicon]);

  // Initialize or restore progress for active platform (Guest Local vs Firestore)
  const initializePlatformProgress = async (gameId: string, targetPlatform: string, data: GameGuideData) => {
    // 1. Build blank schema
    const initialStashes: Record<string, { collected: boolean }> = {};
    if (data.prepper_stashes) {
      Object.entries(data.prepper_stashes).forEach(([key, val]) => {
        if (Array.isArray(val)) {
          val.forEach((s: any) => { if (s.id) initialStashes[s.id] = { collected: false }; });
        }
      });
    }

    const initialRoster: Record<string, { unlocked: boolean }> = {};
    if (Array.isArray(data.guns_and_fangs_for_hire)) {
      data.guns_and_fangs_for_hire.forEach((h: any) => { if (h.id) initialRoster[h.id] = { unlocked: false }; });
    }

    const initialCollectibles: Record<string, { collected: boolean; items: Record<string, { collected: boolean }> }> = {};
    if (data.collectibles) {
      Object.entries(data.collectibles).forEach(([cKey, group]: [string, any]) => {
        const itemsMap: Record<string, { collected: boolean }> = {};
        if (Array.isArray(group.items)) {
          group.items.forEach((item: any) => { if (item.id) itemsMap[item.id] = { collected: false }; });
        }
        initialCollectibles[cKey] = { collected: false, items: itemsMap };
      });
    }

    const initialMissions: Record<string, { completed: boolean }> = {};
    if (Array.isArray(data.walkthrough_missions)) {
      data.walkthrough_missions.forEach((m: any) => { if (m.id) initialMissions[m.id] = { completed: false }; });
    }

    const initialTrophies: Record<string, { earned: boolean; psnSynced?: boolean }> = {};
    if (Array.isArray(data.trophies_and_achievements)) {
      data.trophies_and_achievements.forEach((t: any, idx: number) => {
        const tId = t.trophyId !== undefined ? t.trophyId : idx;
        const key = `trophy_${gameId}_${tId}`;
        initialTrophies[key] = {
          earned: !!t.earned,
          psnSynced: !!t.earned
        };
      });
    }

    let initialRanks = {
      rp: 0,
      outposts: 0,
      cultProperty: 0,
      stashes: 0,
      roster: 0,
      perks: 0,
      collectibles: 0
    };

    // 2. Load stored progress
    let savedPayload: any = null;

    // Check Cloud Firestore if user is authenticated: /users/{friend_code}/platform/{platform}/game/{game_name}
    if (currentUser && friendCode) {
      savedPayload = await loadGameProgressFromFirestore(friendCode, targetPlatform, gameId);
    }

    // Fallback: check guest localStorage for this specific platform and game
    if (!savedPayload) {
      const localGuestKey = `guest_progress_${targetPlatform}_${gameId}`;
      try {
        const raw = localStorage.getItem(localGuestKey);
        if (raw) savedPayload = JSON.parse(raw);
      } catch (e) {}
    }

    if (savedPayload) {
      if (savedPayload.stashes) Object.assign(initialStashes, savedPayload.stashes);
      if (savedPayload.roster) Object.assign(initialRoster, savedPayload.roster);
      if (savedPayload.missions) Object.assign(initialMissions, savedPayload.missions);
      if (savedPayload.trophies) Object.assign(initialTrophies, savedPayload.trophies);
      if (savedPayload.collectibles) {
        Object.keys(savedPayload.collectibles).forEach((cKey) => {
          if (initialCollectibles[cKey]) {
            initialCollectibles[cKey].collected = !!savedPayload.collectibles[cKey].collected;
            if (savedPayload.collectibles[cKey].items) {
              Object.assign(initialCollectibles[cKey].items, savedPayload.collectibles[cKey].items);
            }
          }
        });
      }
      if (savedPayload.ranks) {
        initialRanks = { ...initialRanks, ...savedPayload.ranks };
      }
    }

    // 3. PSN Auto-marking: if logged in on PS platform and user has psn_username, query liveTrophyProgress
    if (currentUser && targetPlatform === 'ps' && userProfile?.psn_username) {
      const commId = data.psn_communication_id || 'NPWR12514_00';
      const liveTrophies = await fetchLivePsnTrophies(userProfile.psn_username, commId);
      if (liveTrophies && typeof liveTrophies === 'object') {
        let anyAutoMarked = false;
        Object.entries(liveTrophies).forEach(([tId, tObj]: [string, any]) => {
          if (tObj && tObj.earned === true) {
            const key = `trophy_${gameId}_${tId}`;
            if (initialTrophies[key]) {
              initialTrophies[key].earned = true;
              initialTrophies[key].psnSynced = true;
              anyAutoMarked = true;
            }
          }
        });
        if (anyAutoMarked) {
          setStatusMessage(`[PSN Live Sync] Automarked trophies from @${userProfile.psn_username}`);
        }
      }
    }

    setStashesState(initialStashes);
    setRosterState(initialRoster);
    setCollectiblesState(initialCollectibles);
    setMissionsState(initialMissions);
    setTrophiesState(initialTrophies);
    setMetricsRanks(initialRanks);
  };

  // Reload data when activeGameId OR platform changes
  useEffect(() => {
    loadGameData(activeGameId, platform);
  }, [activeGameId, platform, loadGameData]);

  // Recalculate metrics and save to Firestore or LocalStorage
  const recalculateAndSave = useCallback((
    newStashes = stashesState,
    newRoster = rosterState,
    newCollectibles = collectiblesState,
    newMissions = missionsState,
    newTrophies = trophiesState,
    customRanks = metricsRanks
  ) => {
    let stashesCount = 0;
    Object.values(newStashes).forEach(s => { if (s?.collected) stashesCount++; });

    let rosterCount = 0;
    Object.values(newRoster).forEach(r => { if (r?.unlocked) rosterCount++; });

    let missionsCount = 0;
    Object.values(newMissions).forEach(m => { if (m?.completed) missionsCount++; });

    let colCount = 0;
    Object.values(newCollectibles).forEach(group => {
      if (group?.items) {
        Object.values(group.items).forEach(item => {
          if (item?.collected) colCount++;
        });
      }
    });

    const earnedTrophiesCount = Object.values(newTrophies).filter(t => t?.earned).length;
    const totalTrophiesCount = Object.keys(newTrophies).length || 50;
    const trophyPercent = totalTrophiesCount > 0 ? Math.round((earnedTrophiesCount / totalTrophiesCount) * 100) : 0;

    const calculatedRP = (stashesCount * 400) + (rosterCount * 600) + (missionsCount * 600) + (colCount * 50);

    const updatedRanks = {
      ...customRanks,
      stashes: stashesCount,
      roster: rosterCount,
      collectibles: colCount,
      rp: Math.max(calculatedRP, customRanks.rp || 0)
    };
    setMetricsRanks(updatedRanks);

    // Build standard payload
    const payload = {
      gameId: activeGameId,
      gameName: gameData?.game || activeGameId,
      platform: platform,
      activeMission: gameData?.activeMission || 'Hope County Resistance',
      trophies_earned: earnedTrophiesCount,
      trophies_total: totalTrophiesCount,
      trophies_percent: trophyPercent,
      ranks: updatedRanks,
      stashes: newStashes,
      roster: newRoster,
      collectibles: newCollectibles,
      missions: newMissions,
      trophies: newTrophies
    };

    // 1. If user is logged in: write directly to Firestore: /users/{friend_code}/platform/{platform}/game/{game_name}
    if (currentUser && friendCode) {
      saveGameProgressToFirestore(friendCode, platform, activeGameId, payload).then(() => {
        setStatusMessage(`[Firestore Saved] /users/${friendCode}/platform/${platform}/game/${activeGameId}`);
      });
    } else {
      // 2. If guest: write strictly to device local storage
      const localGuestKey = `guest_progress_${platform}_${activeGameId}`;
      try {
        localStorage.setItem(localGuestKey, JSON.stringify(payload));
        setStatusMessage(`[Local Auto-Saved] ${activeGameId} [${platform.toUpperCase()}]`);
      } catch (e) {}
    }
  }, [stashesState, rosterState, collectiblesState, missionsState, trophiesState, metricsRanks, activeGameId, platform, gameData, currentUser, friendCode]);

  // Adjust Rank Manual Counter (+/-)
  const adjustRank = (key: string, delta: number) => {
    const current = metricsRanks[key] || 0;
    const nextVal = Math.max(0, current + delta);
    const updated = { ...metricsRanks, [key]: nextVal };
    setMetricsRanks(updated);
    recalculateAndSave(stashesState, rosterState, collectiblesState, missionsState, trophiesState, updated);
  };

  // Toggle Item Checklist Action
  const toggleItem = (id: string, type: 'stash' | 'roster' | 'collectible' | 'mission' | 'trophy', groupKey?: string) => {
    if (type === 'stash') {
      const next = { ...stashesState, [id]: { collected: !stashesState[id]?.collected } };
      setStashesState(next);
      recalculateAndSave(next, rosterState, collectiblesState, missionsState, trophiesState);
    } else if (type === 'roster') {
      const next = { ...rosterState, [id]: { unlocked: !rosterState[id]?.unlocked } };
      setRosterState(next);
      recalculateAndSave(stashesState, next, collectiblesState, missionsState, trophiesState);
    } else if (type === 'mission') {
      const next = { ...missionsState, [id]: { completed: !missionsState[id]?.completed } };
      setMissionsState(next);
      recalculateAndSave(stashesState, rosterState, collectiblesState, next, trophiesState);
    } else if (type === 'trophy') {
      const next = { ...trophiesState, [id]: { earned: !trophiesState[id]?.earned, psnSynced: false } };
      setTrophiesState(next);
      recalculateAndSave(stashesState, rosterState, collectiblesState, missionsState, next);
    } else if (type === 'collectible' && groupKey) {
      const currentGroup = collectiblesState[groupKey] || { collected: false, items: {} };
      const currentItem = currentGroup.items[id] || { collected: false };
      const nextItems = { ...currentGroup.items, [id]: { collected: !currentItem.collected } };
      const nextGroup = { ...currentGroup, items: nextItems };
      const nextCollectibles = { ...collectiblesState, [groupKey]: nextGroup };
      setCollectiblesState(nextCollectibles);
      recalculateAndSave(stashesState, rosterState, nextCollectibles, missionsState, trophiesState);
    }
  };

  // Switch Game Pill Selection Handler (Fixes reverting bug)
  const handleSelectGame = (gameId: string) => {
    userHasPickedGameRef.current = true;
    setActiveGameId(gameId);
  };

  // Sync Squad Friends Progress from Firestore
  const refreshSquad = useCallback(async () => {
    if (userProfile?.friends) {
      const roster = await fetchFriendsProgress(userProfile.friends, platform, activeGameId);
      setFriendsList(roster);
    }
  }, [userProfile, platform, activeGameId]);

  useEffect(() => {
    refreshSquad();
  }, [refreshSquad]);

  // Connect Friend by Code
  const handleConnectFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFriendCodeInput.trim() || !currentUser?.email) return;
    setFriendStatusMsg('Linking squad member...');
    const ok = await linkFriendCodeToRtdb(getEmailKey(currentUser.email), newFriendCodeInput.trim());
    if (ok) {
      setFriendStatusMsg(`Friend code ${newFriendCodeInput.toUpperCase()} linked!`);
      setNewFriendCodeInput('');
      const updatedProfile = await fetchUserProfile(currentUser.email);
      setUserProfile(updatedProfile);
      refreshSquad();
    } else {
      setFriendStatusMsg('Failed to link friend code.');
    }
  };

  // Copy Friend Code to Clipboard
  const handleCopyFriendCode = () => {
    if (navigator.clipboard && friendCode) {
      navigator.clipboard.writeText(friendCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  // Scrape New Game Handler
  const handleScrapeNewGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scrapeGameInput.trim()) return;
    setIsScraping(true);
    setStatusMessage(`Running scrapeFandomWikiGuide("${scrapeGameInput}")...`);

    try {
      const newGuide = await scrapeFandomWikiGuide(scrapeGameInput.trim());
      const newEntry = { id: newGuide.gameId, name: newGuide.game, file: `/game/data/${newGuide.gameId}.json`, commId: newGuide.psn_communication_id };
      
      if (!gameCatalog.find(g => g.id === newGuide.gameId)) {
        setGameCatalog(prev => [...prev, newEntry]);
      }
      userHasPickedGameRef.current = true;
      setActiveGameId(newGuide.gameId);
      setIsScrapeModalOpen(false);
      setScrapeGameInput('');
      setStatusMessage(`Successfully generated guide for ${newGuide.game}!`);
    } catch (err: any) {
      setStatusMessage(`Scrape failed: ${err.message}`);
    } finally {
      setIsScraping(false);
    }
  };

  // Filtered Items for Display
  const filteredMissions = useMemo(() => {
    if (!gameData?.walkthrough_missions) return [];
    if (!searchQuery) return gameData.walkthrough_missions;
    return gameData.walkthrough_missions.filter(m => 
      m.mission_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.region?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.guide?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [gameData, searchQuery]);

  const filteredStashes = useMemo(() => {
    if (!gameData?.prepper_stashes) return [];
    const list: any[] = [];
    Object.entries(gameData.prepper_stashes).forEach(([regKey, val]) => {
      if (Array.isArray(val)) {
        val.forEach(item => {
          if (!searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.location?.toLowerCase().includes(searchQuery.toLowerCase()) || item.guide?.toLowerCase().includes(searchQuery.toLowerCase())) {
            list.push({ ...item, regionKey: regKey });
          }
        });
      }
    });
    return list;
  }, [gameData, searchQuery]);

  const filteredCollectibles = useMemo(() => {
    if (!gameData?.collectibles) return {};
    const res: Record<string, any> = {};
    Object.entries(gameData.collectibles).forEach(([cKey, group]) => {
      if (Array.isArray(group.items)) {
        const matches = group.items.filter(item => 
          !searchQuery || 
          item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
          item.location?.toLowerCase().includes(searchQuery.toLowerCase()) || 
          item.guide?.toLowerCase().includes(searchQuery.toLowerCase())
        );
        if (matches.length > 0) {
          res[cKey] = { ...group, items: matches };
        }
      }
    });
    return res;
  }, [gameData, searchQuery]);

  const filteredTrophies = useMemo(() => {
    if (!gameData?.trophies_and_achievements) return [];
    if (!searchQuery) return gameData.trophies_and_achievements;
    return gameData.trophies_and_achievements.filter(t => 
      (t.trophyName || t.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.trophyDetail || t.description || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [gameData, searchQuery]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <div className="min-h-screen text-slate-100 bg-[#080c14] pb-24 selection:bg-[#ff5500] selection:text-white">
      {/* Background radial gradient overlay */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(30,41,59,0.5)_0%,rgba(8,12,20,0.98)_100%)] pointer-events-none -z-10" />

      {/* Top Header Navigation with Left-Pinned Home & Centered Dynamic RTDB Menu */}
      <header className="sticky top-0 z-40 bg-[#0a0e1a]/95 backdrop-blur-md border-b-2 border-[#ff5500]/30 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 h-15 flex items-center justify-between gap-4">
          
          {/* Left Zone: Home Page Button & Brand */}
          <div className="flex items-center gap-3 shrink-0">
            {homeLink && (
              <a
                href={homeLink.url}
                target="_blank"
                rel="noopener noreferrer"
                title="Go to Home"
                className="flex items-center gap-2 bg-[#1e293b] hover:bg-[#ff5500] text-white text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-700 hover:border-[#ff5500] transition-all"
              >
                {homeLink.image ? (
                  <img src={homeLink.image} alt="Home" className="w-4 h-4 object-contain" />
                ) : (
                  <HomeIcon className="w-4 h-4" />
                )}
                <span>Home</span>
              </a>
            )}

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#0f172a] border border-[#ff5500] flex items-center justify-center shadow-[0_0_10px_rgba(255,85,0,0.3)] overflow-hidden">
                {posterArtUrl ? (
                  <img src={posterArtUrl} alt="Poster" className="w-full h-full object-cover" />
                ) : (
                  <Shield className="w-4 h-4 text-[#ff5500]" />
                )}
              </div>
              <span className="font-black text-xs sm:text-sm tracking-wider text-white uppercase hidden md:inline">
                Companion
              </span>
            </div>
          </div>

          {/* Center Zone: Centered Dynamic RTDB Menu Folders & Buttons */}
          <nav className="hidden lg:flex items-center justify-center gap-2 flex-1 max-w-3xl overflow-visible">
            {navMenuGroups.map((group) => {
              if (group.isFolder) {
                const isOpen = activeOpenFolder === group.title;
                return (
                  <div key={group.title} className="relative group/folder">
                    <button
                      type="button"
                      onClick={() => setActiveOpenFolder(isOpen ? null : group.title)}
                      className="px-2.5 py-1.5 text-xs font-bold text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-800 border border-slate-700 hover:border-[#ff5500] rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <Folder className="w-3.5 h-3.5 text-amber-400" />
                      <span>{group.title}</span>
                      <ChevronDown className="w-3 h-3 text-slate-400" />
                    </button>

                    {/* Dropdown Folder Menu - Sorted by rowNumber ascending */}
                    <div className="hidden group-hover/folder:flex hover:flex flex-col absolute top-full left-0 mt-1 min-w-[200px] bg-[#0b1120] border border-[#ff5500]/40 rounded-xl p-1.5 shadow-2xl z-50">
                      {group.items.map((subItem) => (
                        <a
                          key={subItem.url + subItem.rowNumber}
                          href={subItem.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-200 hover:text-white hover:bg-[#ff5500]/20 rounded-lg transition-colors"
                        >
                          {subItem.image && (
                            <img src={subItem.image} alt="" className="w-4 h-4 rounded object-contain shrink-0" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                          )}
                          <span className="truncate">{subItem.title}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                );
              }

              // Standalone Single Button
              const singleItem = group.items[0];
              return (
                <a
                  key={singleItem.url}
                  href={singleItem.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 text-xs font-bold text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-800 border border-slate-700 hover:border-[#ff5500] rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
                >
                  {singleItem.image && (
                    <img src={singleItem.image} alt="" className="w-3.5 h-3.5 rounded object-contain" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                  )}
                  <span>{singleItem.title}</span>
                </a>
              );
            })}
          </nav>

          {/* Right Zone: Platform Switcher & User Profile Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Console / PC Platform Select */}
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="bg-[#0f172a] border border-slate-700 hover:border-[#ff5500] text-white text-xs font-bold px-2.5 py-1.5 rounded-lg focus:outline-none transition-colors cursor-pointer"
            >
              <option value="ps">🎮 PlayStation (PSN)</option>
              <option value="xbox">❎ Xbox Network</option>
              <option value="pc">💻 PC (Ubisoft / Windows)</option>
              <option value="steam">🚂 Steam Client</option>
            </select>

            {currentUser ? (
              <div className="flex items-center gap-2 bg-[#1e293b] border border-[#ff5500]/40 pl-2 pr-1.5 py-1 rounded-full">
                {userProfile?.avatar_url || currentUser.photoURL ? (
                  <img 
                    src={userProfile?.avatar_url || currentUser.photoURL} 
                    alt="Avatar" 
                    className="w-6 h-6 rounded-full object-cover border border-[#ff5500]" 
                  />
                ) : (
                  <UserIcon className="w-4 h-4 text-[#ff5500]" />
                )}
                <span className="text-xs font-extrabold text-white max-w-[90px] truncate hidden sm:inline">
                  {userProfile?.username || currentUser.displayName || 'Agent'}
                </span>
                <button
                  onClick={logoutUser}
                  title="Sign Out"
                  className="text-slate-400 hover:text-red-400 p-1 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={loginWithGoogle}
                className="inline-flex items-center gap-1.5 bg-[#0088ff] hover:bg-[#0077e6] text-white text-xs font-extrabold px-3 py-1.5 rounded-lg shadow-md transition-colors cursor-pointer"
              >
                <Key className="w-3.5 h-3.5" />
                <span>Log In</span>
              </button>
            )}

            {/* Mobile Menu Hamburger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-1.5 rounded-lg bg-slate-800 text-white"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-[#0b1120] border-t border-slate-800 p-4 space-y-2 max-h-[70vh] overflow-y-auto">
            {navMenuGroups.map((group) => (
              <div key={group.title} className="space-y-1">
                <div className="text-[11px] font-black uppercase text-slate-400 px-2">{group.title}</div>
                {group.items.map((subItem) => (
                  <a
                    key={subItem.url + subItem.rowNumber}
                    href={subItem.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-[#ff5500]/20 rounded-lg"
                  >
                    {subItem.image && <img src={subItem.image} alt="" className="w-4 h-4 rounded object-contain" />}
                    <span>{subItem.title}</span>
                  </a>
                ))}
              </div>
            ))}
          </div>
        )}
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 pt-6 space-y-6">
        
        {/* Dynamic Game Pills Selector Bar */}
        <section aria-label="Game Selector" className="overflow-x-auto pb-1 scrollbar-none">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
              Select Game:
            </span>
            {gameCatalog.map((g) => {
              const isActive = g.id === activeGameId;
              return (
                <button
                  key={g.id}
                  onClick={() => handleSelectGame(g.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wide transition-all whitespace-nowrap shrink-0 flex items-center gap-2 border cursor-pointer ${
                    isActive
                      ? 'bg-[#ff5500] text-white border-[#ff5500] shadow-[0_0_15px_rgba(255,85,0,0.4)] scale-102'
                      : 'bg-[#0f172a]/90 text-slate-300 border-slate-700/80 hover:border-[#ff5500]/60 hover:text-white'
                  }`}
                >
                  <Flame className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-[#ff5500]'}`} />
                  <span>{g.name}</span>
                </button>
              );
            })}

            <button
              onClick={() => setIsScrapeModalOpen(true)}
              className="px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wide bg-[#1e293b]/60 text-slate-400 border border-dashed border-slate-700 hover:border-[#ff5500] hover:text-[#ff5500] transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add / Scrape</span>
            </button>

            <button
              onClick={handleRescanFolder}
              disabled={isRescanningFolder}
              title="Rescan game/data for new JSON files"
              className="px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wide bg-[#1e293b]/60 text-slate-300 border border-slate-700 hover:border-[#ff5500] hover:text-white transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#ff5500] ${isRescanningFolder ? 'animate-spin' : ''}`} />
              <span>{isRescanningFolder ? 'Scanning...' : 'Rescan Folder'}</span>
            </button>
          </div>
        </section>

        {/* Master Console Card */}
        <section className="bg-slate-900/90 border-2 border-[#ff5500]/30 rounded-2xl p-5 shadow-[0_10px_30px_rgba(0,0,0,0.6),0_0_20px_rgba(255,85,0,0.15)] relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-700/60 pb-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
                <span>Resistance Telemetry & Ledger</span>
                <span>•</span>
                <span className="text-[#ff5500] font-mono font-black">{platform.toUpperCase()}</span>
                {gameData?.psn_communication_id && (
                  <>
                    <span>•</span>
                    <span className="font-mono text-slate-500">{gameData.psn_communication_id}</span>
                  </>
                )}
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-wide uppercase mt-1">
                {userProfile?.username || (currentUser?.displayName ? currentUser.displayName.toUpperCase() : 'GUEST')} [{gameData?.game || activeGameId}] [{platform.toUpperCase()}]
              </h1>
              <div className="text-xs text-slate-400 mt-0.5">
                Active Objective: <strong className="text-slate-200">{gameData?.activeMission || 'Hope County Resistance'}</strong>
              </div>
            </div>

            {/* Most Recent Trophy Badge (Earned Aug 01, 2026+) */}
            {recentPsnTrophy && (
              <div className="bg-[#0f172a] border border-[#ff5500]/40 rounded-xl p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#ff5500]/20 border border-[#ff5500] flex items-center justify-center shrink-0">
                  <Trophy className="w-5 h-5 text-[#ff5500]" />
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Recent PSN Trophy (Since Aug 1, 2026)
                  </div>
                  <div className="text-xs font-black text-white">
                    {recentPsnTrophy.trophyName || recentPsnTrophy.name}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {recentPsnTrophy.earnedDateTime ? new Date(recentPsnTrophy.earnedDateTime).toLocaleDateString() : 'Active'} • {recentPsnTrophy.gameTitle || gameData?.game}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Dynamic Tactical Metrics Counters */}
          <div className="mt-4">
            <div className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">
              Resistance Metrics [{platform.toUpperCase()}]
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
              {[
                { key: 'rp', icon: '⭐', label: 'Resistance Pts', step: 100 },
                { key: 'outposts', icon: '🏴', label: 'Outposts', step: 1 },
                { key: 'cultProperty', icon: '🔥', label: 'Cult Property', step: 1 },
                { key: 'stashes', icon: '📦', label: 'Prepper Stashes', step: 1 },
                { key: 'roster', icon: '🐾', label: 'Roster / Fangs', step: 1 },
                { key: 'perks', icon: '🎖️', label: 'Perk Magazines', step: 1 },
                { key: 'collectibles', icon: '🗂️', label: 'Collectibles', step: 1 }
              ].map(({ key, icon, label, step }) => {
                const val = metricsRanks[key] || 0;
                return (
                  <div key={key} className="bg-[#1e293b]/70 border border-slate-700/60 rounded-xl p-2.5 flex flex-col items-center justify-between gap-1 shadow-sm">
                    <span className="text-sm">{icon}</span>
                    <span className="text-[11px] font-bold text-slate-300 text-center leading-tight truncate w-full">
                      {label}
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                      <button
                        onClick={() => adjustRank(key, -step)}
                        aria-label={`Decrease ${label}`}
                        className="w-7 h-7 bg-[#0f172a] hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md flex items-center justify-center font-bold text-xs cursor-pointer active:scale-95 transition-all"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-sm font-black text-[#ff5500] font-mono tabular-nums min-w-[28px] text-center">
                        {val}
                      </span>
                      <button
                        onClick={() => adjustRank(key, step)}
                        aria-label={`Increase ${label}`}
                        className="w-7 h-7 bg-[#0f172a] hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md flex items-center justify-center font-bold text-xs cursor-pointer active:scale-95 transition-all"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Status Message Line */}
          <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span className="truncate">{statusMessage}</span>
            <span className="shrink-0 ml-2 text-slate-500">NY 24h: {nyTime}</span>
          </div>
        </section>

        {/* User Account Integrations Bar (when signed in) */}
        {userProfile && (
          <section className="bg-[#0f172a]/90 border border-slate-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-4">
              <span className="font-bold text-slate-400">Connected Accounts:</span>
              {userProfile.psn_username && (
                <div className="flex items-center gap-1.5 bg-[#1e293b] px-2.5 py-1 rounded-md text-white">
                  <span className="text-[10px] uppercase font-bold text-sky-400">PSN:</span>
                  <span className="font-mono font-bold">{userProfile.psn_username}</span>
                  {platform === 'ps' && <span className="text-[9px] bg-emerald-900/50 text-emerald-400 px-1 rounded">Auto-Mark Active</span>}
                </div>
              )}
              {userProfile.xbox_gamertag && (
                <div className="flex items-center gap-1.5 bg-[#1e293b] px-2.5 py-1 rounded-md text-white">
                  <span className="text-[10px] uppercase font-bold text-green-400">Xbox:</span>
                  <span className="font-mono font-bold">{userProfile.xbox_gamertag}</span>
                </div>
              )}
              {userProfile.steam_friend_code && (
                <div className="flex items-center gap-1.5 bg-[#1e293b] px-2.5 py-1 rounded-md text-white">
                  <span className="text-[10px] uppercase font-bold text-blue-400">Steam:</span>
                  <span className="font-mono font-bold">{userProfile.steam_friend_code}</span>
                </div>
              )}
            </div>
            <div className="text-[11px] text-slate-500 font-mono">
              Firestore Doc: /users/{friendCode}/platform/{platform}/game/{activeGameId}
            </div>
          </section>
        )}

        {/* Squad & Friends Co-Op Deck */}
        <section className="bg-[#0b1120] border border-[#ff5500]/30 rounded-2xl p-5 shadow-md">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4 text-[#ff5500]" />
                <span>Squad Co-Op Cross-Tracking (Cloud Firestore)</span>
              </h2>
              <p className="text-xs text-slate-400">
                Synchronized via Firestore: <code className="text-slate-300">/users/{'{friend_code}'}/platform/{'{platform}'}/game/{'{game}'}</code>
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-300 font-semibold">Your Friend Code:</span>
              <div className="flex items-center gap-1 bg-[#1e293b] border border-dashed border-[#ff5500] rounded-lg px-3 py-1">
                <span className="font-mono font-black text-sm text-[#ff5500]">
                  {friendCode}
                </span>
                <button
                  type="button"
                  onClick={handleCopyFriendCode}
                  title="Copy Friend Code"
                  className="text-slate-400 hover:text-white p-0.5 cursor-pointer"
                >
                  {copiedCode ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Add Friend Input Form */}
          <form onSubmit={handleConnectFriend} className="flex flex-wrap items-center gap-2 mb-4">
            <input
              type="text"
              placeholder="Enter Friend Code (e.g. GQGI0SWY)"
              value={newFriendCodeInput}
              onChange={(e) => setNewFriendCodeInput(e.target.value)}
              className="bg-[#0f172a] border border-slate-700 px-3 py-1.5 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#ff5500] min-w-[240px]"
            />
            <button
              type="submit"
              className="bg-[#ff5500] hover:bg-[#e04b00] text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              Link Squad Member
            </button>
            {friendStatusMsg && (
              <span className="text-xs text-slate-400 font-mono ml-2">{friendStatusMsg}</span>
            )}
          </form>

          {/* Squad Member Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {friendsList.length > 0 ? (
              friendsList.map((f) => (
                <div key={f.friend_code} className="bg-[#1e293b]/70 border border-slate-700 rounded-xl p-3 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {f.avatar_url && (
                        <img src={f.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover border border-slate-600" />
                      )}
                      <span className="font-bold text-white text-xs">{f.username}</span>
                    </div>
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-[#ff5500]/20 text-[#ff5500]">
                      {f.primary_platform || platform}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300 space-y-1">
                    <div>RP: <strong className="text-white">{f.rp}</strong> • Stashes: <strong className="text-white">{f.stashes}</strong></div>
                    <div>Collectibles: <strong className="text-white">{f.collectibles}</strong></div>
                    <div>Trophy Progress: <strong className="text-[#ff5500]">{f.trophies_percent}%</strong></div>
                  </div>
                  <div className="text-[9px] font-mono text-slate-500 mt-2">
                    Code: {f.friend_code}
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full py-4 text-center text-xs text-slate-500 bg-[#0f172a]/40 rounded-xl border border-dashed border-slate-800">
                {currentUser ? "No squad members linked yet. Enter a friend code above to start cross-tracking." : "Sign in with Google to view and sync your squad co-op roster."}
              </div>
            )}
          </div>
        </section>

        {/* Global Search and Filter Bar */}
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={`Search ${gameData?.game || 'game'} missions, stashes, collectibles, weapons...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0f172a] border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#ff5500]"
            />
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: 'all', label: 'All Categories' },
              { id: 'missions', label: 'Missions' },
              { id: 'stashes', label: 'Stashes' },
              { id: 'collectibles', label: 'Collectibles' },
              { id: 'roster', label: 'Roster' },
              { id: 'trophies', label: 'Trophies' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-[#ff5500] text-white'
                    : 'bg-[#1e293b] text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Interactive Tactical Guide Accordions */}
        <div className="space-y-4">
          
          {/* Section 1: Walkthrough Missions & Boss Encounters */}
          {(activeTab === 'all' || activeTab === 'missions') && filteredMissions.length > 0 && (
            <div className="bg-[#0f172a] border border-slate-700/80 border-l-4 border-l-[#ff5500] rounded-xl overflow-hidden shadow-md">
              <button
                onClick={() => toggleSection('walkthroughs')}
                className="w-full px-5 py-3.5 bg-slate-800/50 hover:bg-slate-800/80 flex items-center justify-between text-left cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-[#ff5500]" />
                  <h2 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">
                    Story Campaign & Boss Encounters ({filteredMissions.length})
                  </h2>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedSections.walkthroughs ? 'rotate-180' : ''}`} />
              </button>

              {expandedSections.walkthroughs && (
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredMissions.map((m) => {
                    const isDone = !!missionsState[m.id]?.completed;
                    return (
                      <div
                        key={m.id}
                        className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all ${
                          isDone 
                            ? 'bg-[#ff5500]/10 border-[#ff5500] shadow-[0_0_12px_rgba(255,85,0,0.25)]' 
                            : 'bg-[#1e293b]/60 border-slate-700/70'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
                                {m.region || 'Hope County'}
                              </span>
                              <h3 className="font-bold text-white text-sm mt-1">{m.mission_name}</h3>
                            </div>
                            <button
                              onClick={() => toggleItem(m.id, 'mission')}
                              className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold transition-all cursor-pointer ${
                                isDone 
                                  ? 'bg-[#10b981] text-white shadow-[0_0_10px_rgba(16,185,129,0.5)]' 
                                  : 'bg-[#0f172a] text-slate-400 border border-slate-700 hover:border-[#ff5500]'
                              }`}
                              aria-label={`Toggle ${m.mission_name}`}
                            >
                              {isDone ? <Check className="w-5 h-5 stroke-[3]" /> : null}
                            </button>
                          </div>
                          <p className="text-xs text-slate-300 leading-relaxed mb-2">
                            {m.guide}
                          </p>
                          {m.objectives && m.objectives.length > 0 && (
                            <ul className="text-[11px] text-slate-400 space-y-0.5 list-disc list-inside">
                              {m.objectives.slice(0, 3).map((obj, i) => (
                                <li key={i}>{obj}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Section 2: Prepper Stashes */}
          {(activeTab === 'all' || activeTab === 'stashes') && filteredStashes.length > 0 && (
            <div className="bg-[#0f172a] border border-slate-700/80 border-l-4 border-l-[#ff5500] rounded-xl overflow-hidden shadow-md">
              <button
                onClick={() => toggleSection('stashes')}
                className="w-full px-5 py-3.5 bg-slate-800/50 hover:bg-slate-800/80 flex items-center justify-between text-left cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-[#ff5500]" />
                  <h2 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">
                    Prepper Stashes & Secret Caches ({filteredStashes.length})
                  </h2>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedSections.stashes ? 'rotate-180' : ''}`} />
              </button>

              {expandedSections.stashes && (
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredStashes.map((s) => {
                    const isDone = !!stashesState[s.id]?.collected;
                    return (
                      <div
                        key={s.id}
                        className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all ${
                          isDone 
                            ? 'bg-[#ff5500]/10 border-[#ff5500] shadow-[0_0_12px_rgba(255,85,0,0.25)]' 
                            : 'bg-[#1e293b]/60 border-slate-700/70'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                                {s.required_gear || 'No Gear Required'}
                              </span>
                              <h3 className="font-bold text-white text-sm mt-1">{s.name}</h3>
                              <div className="text-[11px] text-[#ff5500] flex items-center gap-1 mt-0.5">
                                <MapPin className="w-3 h-3" />
                                <span>{s.location}</span>
                              </div>
                            </div>
                            <button
                              onClick={() => toggleItem(s.id, 'stash')}
                              className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold transition-all cursor-pointer ${
                                isDone 
                                  ? 'bg-[#10b981] text-white shadow-[0_0_10px_rgba(16,185,129,0.5)]' 
                                  : 'bg-[#0f172a] text-slate-400 border border-slate-700 hover:border-[#ff5500]'
                              }`}
                              aria-label={`Toggle ${s.name}`}
                            >
                              {isDone ? <Check className="w-5 h-5 stroke-[3]" /> : null}
                            </button>
                          </div>
                          <p className="text-xs text-slate-300 leading-relaxed">
                            {s.guide}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Section 3: Collectibles Sets */}
          {(activeTab === 'all' || activeTab === 'collectibles') && Object.keys(filteredCollectibles).length > 0 && (
            <div className="bg-[#0f172a] border border-slate-700/80 border-l-4 border-l-[#ff5500] rounded-xl overflow-hidden shadow-md">
              <button
                onClick={() => toggleSection('collectibles')}
                className="w-full px-5 py-3.5 bg-slate-800/50 hover:bg-slate-800/80 flex items-center justify-between text-left cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-[#ff5500]" />
                  <h2 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">
                    Collectibles & Field Records ({Object.keys(filteredCollectibles).length} Sets)
                  </h2>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedSections.collectibles ? 'rotate-180' : ''}`} />
              </button>

              {expandedSections.collectibles && (
                <div className="p-4 space-y-6">
                  {Object.entries(filteredCollectibles).map(([cKey, group]: [string, any]) => {
                    const groupTitle = group.quest_name || cKey.replace(/_/g, ' ').toUpperCase();
                    return (
                      <div key={cKey} className="bg-[#1e293b]/40 rounded-xl p-3 border border-slate-700/60">
                        <div className="flex items-center justify-between mb-3 border-b border-slate-700/50 pb-2">
                          <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                            <span>🗂️</span>
                            <span>{groupTitle}</span>
                            <span className="text-xs text-slate-400 font-mono">({group.items.length} items)</span>
                          </h3>
                          {group.quest_giver && (
                            <span className="text-[11px] text-slate-400">
                              Giver: <strong className="text-slate-200">{group.quest_giver}</strong>
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {group.items.map((item: any) => {
                            const isDone = !!collectiblesState[cKey]?.items?.[item.id]?.collected;
                            return (
                              <div
                                key={item.id}
                                className={`p-3 rounded-lg border flex flex-col justify-between transition-all ${
                                  isDone 
                                    ? 'bg-[#ff5500]/10 border-[#ff5500]' 
                                    : 'bg-[#0f172a]/70 border-slate-700/60'
                                }`}
                              >
                                <div>
                                  <div className="flex items-start justify-between gap-2 mb-1">
                                    <div>
                                      <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300">
                                        {item.region || group.region || 'World Map'}
                                      </span>
                                      <h4 className="font-bold text-white text-xs mt-1">{item.name}</h4>
                                      <div className="text-[10px] text-slate-400">{item.location}</div>
                                    </div>
                                    <button
                                      onClick={() => toggleItem(item.id, 'collectible', cKey)}
                                      className={`w-8 h-8 rounded-md flex items-center justify-center font-bold transition-all cursor-pointer ${
                                        isDone 
                                          ? 'bg-[#10b981] text-white shadow-[0_0_8px_rgba(16,185,129,0.5)]' 
                                          : 'bg-[#1e293b] text-slate-400 border border-slate-700 hover:border-[#ff5500]'
                                      }`}
                                      aria-label={`Toggle ${item.name}`}
                                    >
                                      {isDone ? <Check className="w-4 h-4 stroke-[3]" /> : null}
                                    </button>
                                  </div>
                                  <p className="text-[11px] text-slate-300 leading-normal mt-1">
                                    {item.guide}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Section 4: Guns & Fangs for Hire */}
          {(activeTab === 'all' || activeTab === 'roster') && gameData?.guns_and_fangs_for_hire && gameData.guns_and_fangs_for_hire.length > 0 && (
            <div className="bg-[#0f172a] border border-slate-700/80 border-l-4 border-l-[#ff5500] rounded-xl overflow-hidden shadow-md">
              <button
                onClick={() => toggleSection('roster')}
                className="w-full px-5 py-3.5 bg-slate-800/50 hover:bg-slate-800/80 flex items-center justify-between text-left cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Crosshair className="w-4 h-4 text-[#ff5500]" />
                  <h2 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">
                    Guns & Fangs for Hire / Specialists ({gameData.guns_and_fangs_for_hire.length})
                  </h2>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedSections.roster ? 'rotate-180' : ''}`} />
              </button>

              {expandedSections.roster && (
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {gameData.guns_and_fangs_for_hire.map((h) => {
                    const isDone = !!rosterState[h.id]?.unlocked;
                    return (
                      <div
                        key={h.id}
                        className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all ${
                          isDone 
                            ? 'bg-[#ff5500]/10 border-[#ff5500]' 
                            : 'bg-[#1e293b]/60 border-slate-700/70'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-sky-900/40 text-sky-300">
                                {h.type}
                              </span>
                              <h3 className="font-black text-white text-sm mt-1">{h.name}</h3>
                              <div className="text-xs text-[#ff5500] font-bold">{h.title}</div>
                            </div>
                            <button
                              onClick={() => toggleItem(h.id, 'roster')}
                              className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold transition-all cursor-pointer ${
                                isDone 
                                  ? 'bg-[#10b981] text-white shadow-[0_0_10px_rgba(16,185,129,0.5)]' 
                                  : 'bg-[#0f172a] text-slate-400 border border-slate-700 hover:border-[#ff5500]'
                              }`}
                              aria-label={`Unlock ${h.name}`}
                            >
                              {isDone ? <Check className="w-5 h-5 stroke-[3]" /> : null}
                            </button>
                          </div>
                          {h.unlock_mission && (
                            <div className="text-[11px] text-slate-300 mb-2">
                              <strong>Unlock Mission:</strong> {h.unlock_mission}
                            </div>
                          )}
                          {h.skills && (
                            <div className="space-y-1">
                              {h.skills.map((s, idx) => (
                                <div key={idx} className="text-[10px] text-slate-400">
                                  <strong className="text-slate-300">{s.name}:</strong> {s.description}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Section 5: Official Trophies & Achievements */}
          {(activeTab === 'all' || activeTab === 'trophies') && filteredTrophies.length > 0 && (
            <div className="bg-[#0f172a] border border-slate-700/80 border-l-4 border-l-[#ff5500] rounded-xl overflow-hidden shadow-md">
              <button
                onClick={() => toggleSection('trophies')}
                className="w-full px-5 py-3.5 bg-slate-800/50 hover:bg-slate-800/80 flex items-center justify-between text-left cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-[#ff5500]" />
                  <h2 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">
                    Official Trophies & Milestones ({filteredTrophies.length})
                  </h2>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedSections.trophies ? 'rotate-180' : ''}`} />
              </button>

              {expandedSections.trophies && (
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredTrophies.map((t, idx) => {
                    const tId = t.trophyId !== undefined ? t.trophyId : idx;
                    const key = `trophy_${activeGameId}_${tId}`;
                    const trophyObj = trophiesState[key];
                    const isDone = !!trophyObj?.earned;
                    const isSynced = !!trophyObj?.psnSynced;
                    const tType = (t.trophyType || t.type || 'Bronze').toUpperCase();

                    let badgeColor = 'bg-amber-900/40 text-amber-300';
                    if (tType.includes('PLATINUM')) badgeColor = 'bg-sky-600 text-white';
                    else if (tType.includes('GOLD')) badgeColor = 'bg-yellow-600 text-white';
                    else if (tType.includes('SILVER')) badgeColor = 'bg-slate-500 text-white';

                    return (
                      <div
                        key={key}
                        className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all ${
                          isDone 
                            ? 'bg-[#ff5500]/10 border-[#ff5500] shadow-[0_0_12px_rgba(255,85,0,0.25)]' 
                            : 'bg-[#1e293b]/60 border-slate-700/70'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${badgeColor}`}>
                                  {tType}
                                </span>
                                {isSynced && (
                                  <span className="text-[9px] bg-emerald-900/40 text-emerald-400 font-bold px-1.5 py-0.5 rounded border border-emerald-700/50">
                                    PSN Synced ✓
                                  </span>
                                )}
                              </div>
                              <h3 className="font-bold text-white text-sm mt-1">{t.trophyName || t.name}</h3>
                            </div>
                            <button
                              onClick={() => toggleItem(key, 'trophy')}
                              className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold transition-all cursor-pointer ${
                                isDone 
                                  ? 'bg-[#10b981] text-white shadow-[0_0_10px_rgba(16,185,129,0.5)]' 
                                  : 'bg-[#0f172a] text-slate-400 border border-slate-700 hover:border-[#ff5500]'
                              }`}
                              aria-label={`Toggle trophy ${t.trophyName || t.name}`}
                            >
                              {isDone ? <Check className="w-5 h-5 stroke-[3]" /> : null}
                            </button>
                          </div>
                          <p className="text-xs text-slate-300 leading-relaxed">
                            {t.trophyDetail || t.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>

      </main>

      {/* Scrape / Add Game Modal */}
      {isScrapeModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-[#0f172a] border border-[#ff5500]/40 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-base font-black text-white uppercase tracking-wider mb-2 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#ff5500]" />
              <span>Scrape / Add In-Game Guide</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Enter any game title to automatically scrape or generate collectibles, quests, weapons, and trophy checklists via <code className="text-[#ff5500] font-mono">scrapeFandomWikiGuide()</code>.
            </p>

            <form onSubmit={handleScrapeNewGame} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  Game Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Far Cry 6, Cyberpunk 2077, Elden Ring"
                  value={scrapeGameInput}
                  onChange={(e) => setScrapeGameInput(e.target.value)}
                  className="w-full bg-[#1e293b] border border-slate-700 focus:border-[#ff5500] text-white text-xs px-3 py-2 rounded-xl focus:outline-none"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsScrapeModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isScraping || !scrapeGameInput.trim()}
                  className="px-4 py-2 bg-[#ff5500] hover:bg-[#e04b00] disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {isScraping ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Scraping...</span>
                    </>
                  ) : (
                    <span>Scrape & Track</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Persistent Tactical Footer with New York Clock */}
      <footer className="fixed bottom-0 left-0 w-full h-11 bg-[#080c14]/98 border-t-2 border-[#ff5500]/30 z-30 px-4 flex items-center justify-between text-[11px] font-mono text-slate-400">
        <div className="flex items-center gap-3">
          <span className="font-bold text-slate-300">Werewolf Companion Engine v10.0</span>
          <span className="hidden sm:inline">•</span>
          <span className="hidden sm:inline text-slate-500">Firestore: users/{friendCode}/platform/{platform}/game/{activeGameId}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[#ff5500] font-bold">{userProfile?.psn_username || 'wildhorse_spirit'}</span>
          <span>•</span>
          <span className="text-slate-300 font-bold">New York Time (24h): {nyTime}</span>
        </div>
      </footer>
    </div>
  );
}
