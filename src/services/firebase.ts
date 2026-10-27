import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as fbSignOut, 
  onAuthStateChanged,
  User 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp,
  Firestore
} from 'firebase/firestore';
import { 
  getDatabase, 
  ref, 
  get, 
  set, 
  Database 
} from 'firebase/database';

export const firebaseConfig = {
  apiKey: "AIzaSyDeuNBGHcwU4rFyOcsfGxLHjmEdpADacmc",
  authDomain: "entertainment-71888.firebaseapp.com",
  databaseURL: "https://entertainment-71888-default-rtdb.firebaseio.com",
  projectId: "entertainment-71888",
  storageBucket: "entertainment-71888.firebasestorage.app",
  messagingSenderId: "660524340277",
  appId: "1:660524340277:web:ef8f4ed04fa985a4f88d7c",
  measurementId: "G-JDNSLD3GFE"
};

let app: any = null;
let auth: any = null;
let firestore: Firestore | null = null;
let database: Database | null = null;

try {
  app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  auth = getAuth(app);
  firestore = getFirestore(app);
  database = getDatabase(app);
} catch (err) {
  console.warn('[Firebase Initialization Warning]:', err);
}

export { app, auth, firestore, database };

export const googleProvider = new GoogleAuthProvider();

export async function loginWithGoogle(): Promise<User | null> {
  if (!auth) throw new Error('Firebase Auth is not initialized');
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function logoutUser(): Promise<void> {
  if (!auth) return;
  await fbSignOut(auth);
}

export function subscribeToAuth(callback: (user: User | null) => void) {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

export function getEmailKey(email: string | null | undefined): string {
  if (!email) return 'guest_user';
  return email.replace(/@/g, '_at_').replace(/\./g, '_');
}

// 1. Fetch User Profile from RTDB /users/{emailKey}
export interface UserRtdbProfile {
  avatar_url?: string;
  friend_code?: string;
  username?: string;
  psn_username?: string;
  psn_account_id?: string;
  psn_npsso_valid?: boolean;
  xbox_gamertag?: string;
  steam_friend_code?: string;
  steam_id?: string;
  twitch_username?: string;
  friends?: Record<string, {
    avatar_url?: string;
    friend_code: string;
    linked_at?: string;
    primary_platform?: string;
    username: string;
    email?: string;
  }>;
}

export async function fetchUserProfile(email: string): Promise<UserRtdbProfile | null> {
  if (!database) return null;
  try {
    const emailKey = getEmailKey(email);
    const snap = await get(ref(database, `/users/${emailKey}`));
    if (snap.exists()) {
      return snap.val() as UserRtdbProfile;
    }
  } catch (e) {
    console.warn('[Fetch User Profile Error]:', e);
  }
  return null;
}

// 2. Fetch utm_links from RTDB for centered top menu
export interface UtmMenuItem {
  group: string;
  image?: string;
  rowNumber: number;
  tag?: string;
  title: string;
  updatedAt?: string;
  url: string;
}

export interface UtmMenuGroup {
  title: string;
  isFolder: boolean;
  items: UtmMenuItem[];
  minRowNumber: number;
}

export async function fetchUtmNavigation(): Promise<{ homeItem: UtmMenuItem | null; menuGroups: UtmMenuGroup[] }> {
  try {
    const res = await fetch('https://entertainment-71888-default-rtdb.firebaseio.com/utm_links.json');
    if (!res.ok) throw new Error('Network response was not ok');
    const data = await res.json();
    if (!data) return { homeItem: null, menuGroups: [] };

    const flatItems: UtmMenuItem[] = [];

    const walk = (node: any) => {
      if (!node || typeof node !== 'object') return;
      if (node.url && typeof node.url === 'string') {
        flatItems.push({
          group: node.group ? String(node.group).trim() : 'Standalone',
          image: node.image || undefined,
          rowNumber: Number(node.rowNumber ?? 999),
          tag: node.tag || undefined,
          title: node.title || node.name || 'Link',
          updatedAt: node.updatedAt || undefined,
          url: node.url
        });
        return;
      }
      Object.values(node).forEach(child => walk(child));
    };

    walk(data);

    // Find Home page (rowNumber 1 or 2 with title Home)
    let homeItem: UtmMenuItem | null = flatItems.find(i => i.title.toLowerCase() === 'home') || null;
    if (!homeItem && flatItems.length > 0) {
      homeItem = flatItems[0];
    }

    // Group items
    const groupsMap: Record<string, UtmMenuItem[]> = {};
    const standaloneItems: UtmMenuItem[] = [];

    flatItems.forEach(item => {
      if (homeItem && item.url === homeItem.url) {
        // Exclude Home from regular centered menu list since it's pinned to the left
        return;
      }
      const grp = item.group;
      if (!grp || grp.toLowerCase() === 'standalone') {
        standaloneItems.push(item);
      } else {
        if (!groupsMap[grp]) groupsMap[grp] = [];
        groupsMap[grp].push(item);
      }
    });

    const menuGroups: UtmMenuGroup[] = [];

    // Add folder groups (sorted by rowNumber ascending inside the group)
    Object.entries(groupsMap).forEach(([gTitle, items]) => {
      items.sort((a, b) => a.rowNumber - b.rowNumber);
      menuGroups.push({
        title: gTitle,
        isFolder: items.length > 1,
        items: items,
        minRowNumber: Math.min(...items.map(i => i.rowNumber))
      });
    });

    // Add standalone items as single buttons
    standaloneItems.forEach(item => {
      menuGroups.push({
        title: item.title,
        isFolder: false,
        items: [item],
        minRowNumber: item.rowNumber
      });
    });

    // Sort all top-level groups by minRowNumber ascending
    menuGroups.sort((a, b) => a.minRowNumber - b.minRowNumber);

    return { homeItem, menuGroups };
  } catch (err) {
    console.warn('[Fetch UTM Navigation Error]:', err);
    return { homeItem: null, menuGroups: [] };
  }
}

// 3. Game Poster Art & Live PSN Trophy Progress from RTDB
export async function fetchGamePosterArt(commId: string): Promise<string | null> {
  if (!commId) return null;
  try {
    const res = await fetch(`https://entertainment-71888-default-rtdb.firebaseio.com/psn/games/${commId}/posterArt.json`);
    if (res.ok) {
      let url = await res.json();
      if (url && typeof url === 'string') {
        if (url.startsWith('//')) url = 'https:' + url;
        return url;
      }
    }
  } catch (e) {}
  return null;
}

export async function fetchLivePsnTrophies(gamertag: string, commId: string): Promise<Record<string, any> | null> {
  if (!gamertag || !commId) return null;
  try {
    const res = await fetch(`https://entertainment-71888-default-rtdb.firebaseio.com/psn/gamertags/${gamertag}/liveTrophyProgress/${commId}.json`);
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {}
  return null;
}

// 4. Firestore Exact Document Path:
// /users/{friend_code}/platform/{platform}/game/{game_name}
export async function saveGameProgressToFirestore(
  friendCode: string,
  platform: string,
  gameName: string,
  payload: any
): Promise<boolean> {
  if (!firestore || !friendCode) return false;
  try {
    const docRef = doc(firestore, "users", friendCode, "platform", platform, "game", gameName);
    await setDoc(docRef, {
      ...payload,
      updatedAt: serverTimestamp()
    }, { merge: true });
    return true;
  } catch (e) {
    console.warn('[Firestore Save Error]:', e);
    return false;
  }
}

export async function loadGameProgressFromFirestore(
  friendCode: string,
  platform: string,
  gameName: string
): Promise<any | null> {
  if (!firestore || !friendCode) return null;
  try {
    const docRef = doc(firestore, "users", friendCode, "platform", platform, "game", gameName);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data();
    }
  } catch (e) {
    console.warn('[Firestore Fetch Error]:', e);
  }
  return null;
}

// 5. One-Time Guest Migration on Sign In
export async function migrateGuestProgressToFirestore(friendCode: string): Promise<number> {
  if (!friendCode) return 0;
  let migratedCount = 0;

  try {
    const keysToMigrate: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('guest_progress_') || key.startsWith('game_companion_'))) {
        keysToMigrate.push(key);
      }
    }

    for (const key of keysToMigrate) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);

        const platform = parsed.platform || 'ps';
        const gameId = parsed.gameId || 'FarCry5';

        // Check if there is meaningful data to save
        const hasChecks = (parsed.ranks && parsed.ranks.rp > 0) ||
          Object.keys(parsed.stashes || {}).some(k => parsed.stashes[k]?.collected) ||
          Object.keys(parsed.missions || {}).some(k => parsed.missions[k]?.completed) ||
          Object.keys(parsed.collectibles || {}).length > 0;

        if (hasChecks) {
          await saveGameProgressToFirestore(friendCode, platform, gameId, parsed);
          migratedCount++;
        }
        localStorage.removeItem(key);
      } catch (err) {}
    }
  } catch (e) {
    console.warn('[Guest Migration Error]:', e);
  }

  return migratedCount;
}

// 6. Squad Friends Roster Querying Firestore via friend_code
export async function fetchFriendsProgress(
  friendsMap: Record<string, any> | undefined,
  platform: string,
  gameId: string
): Promise<any[]> {
  if (!friendsMap || Object.keys(friendsMap).length === 0) return [];
  const results: any[] = [];

  for (const [friendKey, friendObj] of Object.entries(friendsMap)) {
    const friendCode = friendObj.friend_code || friendKey;
    const username = friendObj.username || friendKey;
    const avatarUrl = friendObj.avatar_url || '';
    const primaryPlatform = friendObj.primary_platform || platform;

    let progressData: any = null;
    if (firestore && friendCode) {
      try {
        const docRef = doc(firestore, "users", friendCode, "platform", platform, "game", gameId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          progressData = snap.data();
        }
      } catch (e) {}
    }

    results.push({
      friend_code: friendCode,
      username: username,
      avatar_url: avatarUrl,
      primary_platform: primaryPlatform,
      rp: progressData?.ranks?.rp || 0,
      stashes: progressData?.ranks?.stashes || 0,
      collectibles: progressData?.ranks?.collectibles || 0,
      trophies_percent: progressData?.trophies_percent || 0
    });
  }

  return results;
}

export async function linkFriendCodeToRtdb(myEmailKey: string, targetFriendCode: string): Promise<boolean> {
  if (!database || !myEmailKey || !targetFriendCode) return false;
  try {
    const code = targetFriendCode.trim().toUpperCase();
    const friendRef = ref(database, `/users/${myEmailKey}/friends/${code}`);
    await set(friendRef, {
      friend_code: code,
      username: `Squad_${code}`,
      primary_platform: 'PlayStation',
      linked_at: new Date().toISOString()
    });
    return true;
  } catch (e) {
    console.warn('[Link Friend Code Error]:', e);
    return false;
  }
}
