# Universal In-Game Companion & Resistance Ledger

An interactive, multi-game companion ledger and progress tracker backed by Cloud Firestore and Firebase RTDB. It syncs the most recent PlayStation trophies earned by `wildhorse_spirit` (filtering trophies from August 1, 2026 to current), triggers an automated game guide scraper (`scrapeFandomWikiGuide`) for collectibles, missions, weapons, perks, and stashes, and presents a responsive tactical dashboard with game selector pills and squad friend co-op tracking.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The implementation unifies your Node.js synchronization engine (`scripts/sync_active_game.js`), the automated guide scraper (`scrapeFandomWikiGuide`), and the web tracking UI (`game/index.html` & `fc5.js` converted into a high-performance modern React application) while preserving full compatibility with your Firebase backend (`entertainment-71888`).

- **PSN Trophy Detection**: Inspects `Playstation/psn.json` for `wildhorse_spirit` trophies earned on or after **August 01, 2026**, identifying the current active game communication ID (`commId`) and trophy percentage.
- **Automated Guide Scraper (`scrapeFandomWikiGuide`)**: Runs as both a standalone script utility and an in-app server proxy action. It parses game wikis / fandom guides for categories (collectibles, prepper stashes, story missions, weapons, companions, perks, challenges, trophies) and outputs formatted `game/data/{gameId}.json` files matching your Far Cry 5 schema.
- **Universal Multi-Game Selector**: Interactive pill bar on the dashboard lets players toggle between synced and archived games (e.g., Far Cry 5, Ghost of Tsushima, and newly scraped games).
- **Dual Persistence Strategy**: Authenticated users sync progress to Cloud Firestore under `users/{emailKey}/platform/{platform}/progress/{gameId}`, while guest/offline visitors use LocalStorage with automated one-time migration upon login.
- **Squad Co-Op Cross-Tracking**: Real-time friend code generation and squad roster querying friends' progress and trophy completion via Firebase RTDB and Firestore.

---

## 1. Overview & Core Concept

### What It Does
1. **Active Game & Trophy Ingestion**: Reads PSN trophy records from `Playstation/psn.json` (with RTDB fallback) to detect the player's active title based on trophies earned from August 1, 2026 onwards.
2. **Guide Scraper & Enrichment Engine**: Generates comprehensive guide ledgers for detected titles (`game/data/{gameId}.json`) covering regional story walkthroughs, item-by-item collectible guides, prepper stashes, weapon stats, guns/fangs for hire, magazines, and challenge rewards.
3. **Interactive Companion Ledger Dashboard**: An interactive tactical web dashboard featuring:
   - Dynamic game pills for switching between tracked titles.
   - Live tactical counters (Resistance Points, Outposts, Cult Property, Stashes, Roster, Collectibles) with immediate `+` / `-` adjustments.
   - Interactive checklist accordions for walkthrough missions, prepper stashes, collectibles by region/set, hireable roster, and official trophies with status indicators.
   - Platform selector (PlayStation PSN, Xbox Network, PC Ubisoft/Windows, Steam).
   - Squad & Friends Co-Op Deck with friend code sharing and live completion comparisons.

### Target Audience & Persona
Gamers and co-op squads who want a seamless, second-screen field companion to track 100% completion (trophies, obscure collectibles, hidden bunkers, and side quests) with real-time squad synchronization.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Game Selection & Activation**:
   - The user opens the companion ledger; the dynamic game selector pill bar highlights the active game (e.g. `Far Cry 5`).
   - The user can click any game pill to load that title's companion guide and personal progress immediately.
2. **Interactive Checklist Tracking**:
   - The user expands an accordion (e.g., *Prepper Stashes — Holland Valley* or *Collectibles: Grand Slam Baseball Cards*).
   - Clicking a checkmark button toggles completion with a snappy visual state change, updates tactical metric counters, and triggers an auto-save to Firestore / LocalStorage.
3. **Triggering In-Game Guide Scraper**:
   - An intuitive "Sync Active Game / Scrape Guide" control allows refreshing from `psn.json` or scraping a new game guide on demand, displaying progress toast notifications.
4. **Squad Co-Op Sharing**:
   - The user signs in with Google to reveal their unique Squad Friend Code.
   - Squad members enter friend codes to display companion cards showing each friend's Resistance Points, stashes, collectibles, and trophy completion percentage.

### Visual Identity & Theme
- **Aesthetic Direction**: Tactical dark gaming telemetry terminal inspired by Far Cry 5 and military field ledgers.
- **Color Palette**:
  - Neutral Canvas: Deep dark slate (`#080c14` with radial gradient toward `#0f172a`).
  - Structural Surfaces: Translucent card surfaces (`rgba(15, 23, 42, 0.92)`) with subtle borders (`rgba(255, 85, 0, 0.25)`).
  - Primary Accent: Blaze orange (`#ff5500`) with soft atmospheric glow (`rgba(255, 85, 0, 0.35)`).
  - Trophy Badges: Platinum (`#0284c7`), Gold (`#d97706`), Silver (`#64748b`), Bronze (`#b45309`).
  - Success Indicator: Emerald green (`#10b981`).
- **Typography**:
  - Display & Headings: Heavy modern sans (`Plus Jakarta Sans` / `Outfit`, font-weight 800–900).
  - Body & Guides: Legible high-contrast sans (`Public Sans` / `DM Sans`, 13px–15px).
  - Counters & Telemetry: Monospace tabular numbers (`font-mono tabular-nums`).
- **Interactive Feedback**:
  - Checkbox toggles trigger immediate green check transitions with subtle glow (`box-shadow: 0 0 10px rgba(16, 185, 129, 0.5)`).
  - Counter adjustments update live without layout shifts.
  - Live New York 24-hour clock in the footer.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Hybrid Node.js CLI Script + In-App Sync Engine
- **Chosen Approach**: Maintain `scripts/sync_active_game.js` as an executable Node.js script while exposing the same synchronization and scraping logic in the web application.
- **Why**: Allows you to run automated background syncs via cron/CLI while also providing full interactive control directly in the web browser.
- **Alternatives Considered**: CLI-only would require switching to a terminal to refresh data; web-only would prevent automated GitHub Actions or cron updates.

### Decision 2: Fandom Wiki Scraper Strategy (`scrapeFandomWikiGuide`)
- **Chosen Approach**: Build a multi-tier guide extractor:
  1. Searches and fetches public wiki/walkthrough pages for game collectibles, missions, and perks.
  2. Uses structured parsing and Gemini API semantic normalization into the standard schema.
  3. Falls back to verified offline guide datasets (such as the Far Cry 5 guide) so the app works instantaneously without waiting for network crawls.
- **Why**: Delivers instant offline readiness for core games while enabling dynamic scraping for new titles.

### Decision 3: Firestore Document Structure & Guest Isolation
- **Chosen Approach**:
  - Guest users write strictly to device `localStorage` under `fc5_guest_progress_{platform}`.
  - Authenticated users write to Firestore path `users/{emailKey}/platform/{platform}/progress/{gameId}`.
  - Upon sign-in, an automated migration imports any uncommitted guest checks into the cloud account.
- **Why**: Matches your existing `fc5.js` architecture exactly, ensuring zero data loss and seamless squad sharing.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PSN & Guide Data Sources                        │
├───────────────────────────────────┬────────────────────────────────────┤
│  Playstation/psn.json             │  Fandom Wiki / Game Guide Scraper  │
│  (wildhorse_spirit trophies)      │  (scrapeFandomWikiGuide)           │
└─────────────────┬─────────────────┴──────────────────┬─────────────────┘
                  │                                    │
                  ▼                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               Node.js Engine: scripts/sync_active_game.js              │
│       Filters trophies ≥ 2026-08-01 ➔ Detects active game commId       │
│       Enriches schema ➔ Writes game/data/{gameId}.json & game.json     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               Web Companion App (Universal React / Tailwind)           │
├────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Top Navigation: Brand, Live NY Clock, Google Auth, Platform Menu │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Game Pill Selector Bar: [Far Cry 5] [Ghost of Tsushima] [...]    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Tactical Console: Rank Counters (RP, Outposts, Stashes, Collect) │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Squad Co-Op Deck: Friend Code & Friends Progress Cards           │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Accordion Guides: Missions | Prepper Stashes | Collectibles |    │  │
│  │                   Roster | Official PSN Trophies                 │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────┬───────────────────────────────────┬──────────────────┘
                  │                                   │
                  ▼                                   ▼
┌───────────────────────────────────┐ ┌──────────────────────────────────┐
│         Firebase RTDB             │ │         Cloud Firestore          │
│  • /psn/gamertags/{user}/commId   │ │  • users/{emailKey}/platform/    │
│  • /users/{emailKey}/friend_code  │ │    {platform}/progress/{gameId}  │
│  • /users/{emailKey}/friends      │ │  • Automatic guest migration     │
└───────────────────────────────────┘ └──────────────────────────────────┘
```

### Component & State Mapping
- `GamePillsBar`: Renders available game guides from `game/data/` as selectable pills; sets `activeGameId`.
- `TacticalConsole`: Displays live counter badges for Resistance Points, Outposts, Cult Property, Stashes, Roster, Magazines, and Collectibles with reactive adjusters.
- `SquadDeck`: Displays user's friend code and live co-op progress cards for linked squad members.
- `GuideAccordions`: Collapsible tactical sections containing individual interactive cards (`fc5-item-card`) with check buttons, location guides, and difficulty/rank badges.
- `SyncModal / SyncBar`: Lets user trigger live synchronization or scrape guides for newly played games.

---

## 5. Execution Plan
1. **Data Seed & Script Setup**:
   - Save the comprehensive Far Cry 5 dataset into `game/data/FarCry5.json` and `game/data/game.json`.
   - Update `scripts/sync_active_game.js` with PSN trophy date filtering (August 1, 2026 to current) and `scrapeFandomWikiGuide` extraction logic.
2. **Build Interactive Companion Application**:
   - Implement the full React application in `src/App.tsx` and modular components.
   - Configure Firebase Auth, Firestore, and RTDB bindings (`entertainment-71888`) with fallback guest localStorage.
   - Implement dynamic game selector pills, tactical metric counters, checklist accordions, and friend roster.
3. **Verification**:
   - Verify script execution with `run_command` (`node scripts/sync_active_game.js`).
   - Verify application compilation with `compile_applet`.
