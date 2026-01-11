# Games Module User Guide

The Games module helps you manage your video game, board game, and physical game collection. Track your games across multiple platforms, organize by editions, sync with external services, and get smart suggestions for what to play next.

## Table of Contents

1. [Getting Started with Games](#getting-started-with-games)
2. [Managing Your Game Library](#managing-your-game-library)
3. [Game Organization](#game-organization)
4. [External Account Integration](#external-account-integration)
5. [Random Game Suggestion](#random-game-suggestion)
6. [Filtering and Search](#filtering-and-search)
7. [Managing Game Copies](#managing-game-copies)
8. [Advanced Features](#advanced-features)
9. [Tips & Best Practices](#tips--best-practices)

---

## Getting Started with Games

### What is the Games Module?

The Games module is designed to catalog and organize all your games in one place:
- **Video Games**: Digital licenses from Steam, Epic, GOG, etc.
- **Board Games**: Physical board games and card games
- **Card Games**: Trading card games, deck-building games
- **Tabletop RPGs**: Dungeons & Dragons, Pathfinder, etc.
- **Other Physical Games**: Any other physical gaming items

### Key Concepts

**Game Title**: The core game (e.g., "The Witcher 3")
- Contains shared information like description, player counts, and multiplayer modes
- One title can have multiple releases

**Game Release**: A platform-specific version (e.g., "The Witcher 3 - PC")
- Tied to a specific platform (PC, PS5, Switch, etc.)
- Can have different editions (Standard, GOTY, Deluxe)
- Can have regional variants (NA, EU, JP)

**Game Copy**: Your actual physical or digital copy
- Digital licenses linked to external accounts (Steam, Epic)
- Physical copies tracked as inventory items
- Records playtime, installation status, last played date

---

## Managing Your Game Library

### Adding a New Game Manually

1. Navigate to **Games** from the main menu
2. Click **Add Game** button
3. Fill in the game details:
   - **Name** (required): The game's title
   - **Type**: Video Game, Board Game, Card Game, Tabletop RPG, or Other Physical
   - **Description**: Brief summary of the game
   - **Cover Image URL**: Link to the game's cover art

4. **Player Profile** (optional but recommended):
   - **Overall Min/Max Players**: General player count range
   - **Multiplayer Support**: Check Online, Local Co-op, or Physical Play
   - **Mode-Specific Player Counts**: Set different ranges for each mode

5. Click **Create Game**

### Understanding Player Counts

The player count system has three levels:

**Overall Player Count**
- The general range of players (e.g., 1-4 players)
- Can be left blank if unknown
- For singleplayer-only games, you can leave this blank (implied 1 player)

**Multiplayer Mode Flags**
- **Online**: Game supports internet multiplayer
- **Local**: Game supports same-device co-op (split-screen, hot-seat)
- **Physical**: Game requires physical presence (board games, card games)

**Mode-Specific Player Counts**
- Override overall counts for specific modes
- Example: A game might support 1-4 players locally but 2-16 players online
- Falls back to overall count if not specified

### Editing Game Information

1. Click on a game title to view its details
2. Click the **Edit** button
3. Modify any fields (name, description, player counts, etc.)
4. Click **Save Changes**

### Adding Platform Releases

One game title can have multiple platform releases:

1. Open the game title detail page
2. Scroll to the **Releases** section
3. Click **Add Release**
4. Fill in:
   - **Platform**: PC, PS5, Xbox Series X, Switch, etc.
   - **Edition**: Standard, Deluxe, GOTY, etc.
   - **Region**: North America, Europe, Japan, etc.
   - **Release Date**: When it was released on this platform
5. Click **Create Release**

### Merging Duplicate Games

If you accidentally create duplicate entries:

1. Go to **Games** → **Metadata** → **Similar Names** tab
2. Find games with similar names
3. Click **Merge** and select which title to keep
4. All releases and copies are moved to the kept title

---

## Game Organization

### Platforms

Platforms are managed separately and can be customized:

1. Navigate to **Games** → **Platforms**
2. Add custom platforms not in the default list
3. Set **Aliases** for platform name variations
   - Example: "PS5" aliased to "PlayStation 5"
   - Helps with auto-normalization during syncs

### Game Types

Games are categorized by type:
- **Video Game**: Digital or disc-based video games
- **Board Game**: Physical board games
- **Card Game**: Card-based games
- **Tabletop RPG**: Role-playing game systems and supplements
- **Other Physical Game**: Anything else (miniatures games, etc.)

### Filtering Your Library

Use the filter bar at the top of the games list:

**Basic Filters:**
- **Search**: Find games by name (fuzzy search handles punctuation)
- **Type**: Filter by game type
- **Platform**: Show only games on specific platforms
- **Mode**: Filter by Online, Local, or Physical games
- **Players**: Enter a number to show games supporting that player count

**Advanced Filtering:**
- Combine multiple filters (e.g., "4-player local co-op games on PC")
- Player count filter respects mode-specific counts
- Games with unknown player counts only appear for "1 player" filter

**Results Per Page:**
- 24, 48, 100 per page, or "Show all"
- View toggle: Grid view or List view

---

## External Account Integration

### Supported Services

Connect your gaming accounts to automatically import your library:

**Fetch-Style Connectors** (app pulls data):
- **Steam**: Connects via Steam Web API
- Requires Steam Web API Key

**Push-Style Connectors** (external tool pushes data):
- **Playnite**: Import via Playnite Extension
- Supports aggregated libraries from Steam, Epic, GOG, etc.

### Connecting a Steam Account

1. Navigate to **Games** → **Accounts**
2. Click **Add Account**
3. Select **Steam** as the provider
4. Enter your **Steam User ID** (find it at steamidfinder.com)
5. Enter your **Steam Web API Key** (get from steamcommunity.com/dev/apikey)
6. Click **Save**
7. Click **Sync Now** to import your library

### Syncing Your Library

**Manual Sync:**
1. Go to **Games** → **Accounts**
2. Click **Sync** on the account
3. Wait for the sync to complete (shown in **Jobs** page)

**What Happens During Sync:**
- New games are automatically added as game titles
- Existing games are updated with latest playtime
- Metadata is fetched from providers (IGDB, etc.)
- Your copies are linked to the external account

**Smart Sync Features:**
- Only new games trigger metadata fetch (saves API calls)
- Existing games only update playtime and status
- Platform names are normalized using aliases
- Edition names are extracted and standardized

### Viewing Sync History

1. Navigate to **Games** → **Jobs**
2. See all sync operations with status:
   - **Pending**: Waiting to start
   - **In Progress**: Currently running
   - **Completed**: Finished successfully
   - **Failed**: Encountered an error

---

## Random Game Suggestion

### What is it?

The Random Game Suggestion feature helps you decide what to play when you can't make up your mind. Perfect for game nights with friends!

### Using the Suggestion Wizard

1. Navigate to **Games** and click **Random Game** (green button)
2. The wizard guides you through quick selections:

**Step 1: Player Count**
- Click a button for common player counts (1, 2, 3, 4, 5+)
- Or enter a custom number for larger groups

**Step 2: Game Modes**
- Click each mode to cycle through 3 states:
  - **Any**: Don't care about this mode
  - **Required**: Game MUST support this mode
  - **Excluded**: Game must NOT support this mode
- Modes: Online, Local Co-op, Physical Play

**Step 3: Advanced Options** (optional)
- **Platform Whitelist**: Only include games on selected platforms
- **Platform Blacklist**: Exclude games on selected platforms
- **Game Types**: Video Game, Board Game, Card Game, etc.

3. Click **Suggest a Game!**

### Understanding Suggestions

**How it Works:**
- The system filters your library based on all criteria
- A random game is selected from matching titles
- Mode-specific player counts are checked when modes are required
- Games with unknown player counts only match "1 player" requests

**Getting Results:**
- **Success**: Shows the suggested game with full details
  - Click **View Details** to see more information
  - Click **Suggest Another** to get a different game with same criteria
  - Click **Change Criteria** to adjust your filters
  
- **No Matches**: Shows which filters were applied
  - Adjust criteria to expand your options
  - Check that your library has games matching the filters

### Preserving Your Preferences

The wizard remembers your selections:
- **Suggest Another** keeps all your current filters
- **Change Criteria** returns to wizard with fields pre-filled
- Try different combinations until you find the perfect game

---

## Filtering and Search

### Search Functionality

**Basic Search:**
- Type game name in the search box
- Fuzzy matching handles variations:
  - Punctuation: "The Witcher 3" matches "The Witcher™ 3"
  - Spacing differences
  - Accent marks

**Combined Filters:**
- Search + Type: "mario" + "Video Game"
- Search + Platform: "zelda" + "Switch"
- Search + Players: "party" + "4" players

### Player Count Filtering

**How It Works:**
- Enter a number in the "Players" field
- System shows games supporting exactly that count
- Respects mode-specific counts if game has them

**Examples:**
- **1 player**: Shows singleplayer games
- **2 players**: Shows games supporting 2 players (min ≤ 2 ≤ max)
- **8 players**: Shows party games with large player counts

**Special Cases:**
- Games with unknown counts excluded (except singleplayer at count=1)
- Mode filters affect which player count is checked
- Respects mode-specific ranges over overall ranges

### Mode Filtering

**Online Games:**
- Select "Online" from Mode dropdown
- Shows games with online multiplayer

**Local Co-op Games:**
- Select "Local" from Mode dropdown
- Shows same-device multiplayer games

**Physical Games:**
- Select "Physical" from Mode dropdown
- Shows board games and tabletop games

**Combining with Player Count:**
- Mode + Players: "Local" + "4" = 4-player local co-op games
- Very powerful for game night planning

---

## Managing Game Copies

### Digital Copies

Digital copies are automatically created when you sync external accounts:

**What's Tracked:**
- **Platform**: Which service (Steam, Epic, etc.)
- **External Account**: Which account owns it
- **Playtime**: Hours played (synced from service)
- **Last Played**: When you last played
- **Installation Status**: Is it installed?

**Viewing Your Copies:**
1. Navigate to **Games** → **My Copies**
2. See all your digital licenses
3. Filter by platform or account
4. Click to view associated game title

### Physical Copies

Physical copies are tracked as inventory items:

1. Go to **Items** (main menu)
2. Click **Add Item**
3. Set Type to "Game" or "Game Digital"
4. Link to the appropriate Game Release
5. Track location, condition, and lending status

**Linking to Game:**
- Select the game title from dropdown
- Choose the specific platform release
- Item is now connected to game metadata

---

## Advanced Features

### Metadata Management

Navigate to **Games** → **Metadata** to manage game information:

**Similar Names Tab:**
- Find games with similar names (potential duplicates)
- Merge duplicates to consolidate your library
- Dismiss false positives

**Missing Metadata Tab:**
- Games without description or cover image
- Click **Fetch Metadata** to auto-fill from providers
- Search for the correct match if auto-fetch fails

**Invalid Players Tab:**
- Multiplayer games with unknown player counts
- Edit to add correct information
- Dismiss if player count truly unknown

**Pending Mappings Tab:**
- External games that couldn't be auto-matched
- Map to existing titles or create new ones
- Ignore if not relevant to your collection

### Fetching Metadata

**Automatic Fetch:**
- Happens during first sync of external accounts
- Uses IGDB and other metadata providers
- Fills in description, cover, player counts, etc.

**Manual Fetch:**
1. Open a game title detail page
2. Click **Fetch Metadata**
3. System searches providers automatically
4. Metadata is applied to the game

**Search and Select:**
1. Click **Fetch Metadata** on a game
2. If auto-fetch fails, you'll see search results
3. Select the correct match from the list
4. Click **Apply** to use that metadata

### Platform Management

**Adding Custom Platforms:**
1. Go to **Games** → **Platforms**
2. Click **Add Platform**
3. Enter the platform name
4. Optionally add aliases for normalization

**Merging Platforms:**
- If you have duplicate platforms
- Merge to consolidate all releases
- All games are preserved

**Platform Aliases:**
- Help normalize variations
- Example: "PS5, PlayStation 5, PS 5"
- Used during external account syncs

---

## Tips & Best Practices

### Organizing Your Game Library

1. **Connect External Accounts First**
   - Let automatic sync build your library
   - Manual entry for games not on services

2. **Set Up Platform Aliases Early**
   - Prevents duplicate platforms
   - Makes syncs cleaner

3. **Keep Metadata Updated**
   - Regularly check "Missing Metadata" tab
   - Fetch metadata for new games

4. **Use Consistent Naming**
   - Let the system normalize names
   - Merge duplicates when found

### Using the Suggestion Feature

1. **Start Simple**
   - Just select player count for quick suggestions
   - Add more filters as needed

2. **Mode Filters Are Powerful**
   - "Local + 4 players" perfect for game night
   - "Online + 2 players" for co-op with a friend

3. **Keep Platform Lists Updated**
   - Whitelist platforms you currently have access to
   - Blacklist platforms you don't own

4. **Try Multiple Suggestions**
   - "Suggest Another" gives different options
   - Keep clicking until something sounds fun

### Managing Player Counts

1. **Be Specific When Known**
   - Enter exact player counts for your games
   - Helps with accurate filtering

2. **Leave Unknown as Blank**
   - Don't guess at player counts
   - Blank is better than wrong

3. **Use Mode-Specific Counts**
   - Different modes often have different ranges
   - Example: 1-4 local, 2-16 online

4. **Update After Playing**
   - If you discover correct player counts
   - Edit the game to help future suggestions

### Syncing External Accounts

1. **Sync Regularly**
   - Keep playtime and library up to date
   - Weekly or monthly syncs recommended

2. **Check Sync Jobs**
   - Monitor for failures
   - Re-sync if errors occur

3. **Review New Games**
   - Check that metadata is correct
   - Merge any duplicates

4. **Map Unknown Games**
   - Process pending mappings periodically
   - Keeps your library organized

### Filtering and Search

1. **Use Fuzzy Search**
   - Don't worry about exact spelling
   - System handles variations

2. **Combine Filters**
   - Multiple filters narrow results
   - Great for finding specific types

3. **Save Common Searches**
   - Bookmark filtered URLs
   - Quick access to favorite lists

4. **Adjust Per Page Setting**
   - "Show all" for small filtered lists
   - Paginate for large libraries

---

## Common Questions

### Why isn't my game showing in suggestions?

Check these common issues:
- **Player Count**: Does the game support your requested player count?
- **Game Modes**: Are your mode filters too restrictive?
- **Platform Filters**: Is the game on an excluded platform?
- **Unknown Player Counts**: Games with unknown counts only match "1 player"

### How do I handle games with multiple editions?

The system automatically handles editions:
- Create one Game Title for the base game
- Add releases for each edition (Standard, GOTY, Deluxe)
- All editions share metadata (description, cover)
- Each release tracks platform-specific information

### What if metadata fetch gets the wrong game?

1. Click **Fetch Metadata** again
2. Use the **Search** option at the top
3. Enter more specific search terms
4. Select the correct match from results
5. Click **Apply Selected**

### Can I track games I don't own yet?

Yes! Add games manually:
- Create the game title
- Add platform releases
- Don't create copies (items) until you own them
- Mark as wishlist in notes field

### How do I clean up my library?

1. **Find Duplicates**: Games → Metadata → Similar Names
2. **Merge Titles**: Consolidate duplicate entries
3. **Update Metadata**: Fill in missing information
4. **Delete Unused**: Remove games you no longer own
5. **Review Mappings**: Process pending external games

### What's the difference between a copy and a release?

- **Release**: Platform-specific version (PS5 edition)
- **Copy**: Your actual digital license or physical disc
- One release can have multiple copies (digital + physical)
- One title can have multiple releases (PS5 + PC + Switch)

---

## Keyboard Shortcuts

While viewing the games list:
- **F**: Focus on the filter/search box
- **G**: Focus on Grid/List view toggle

While in the suggestion wizard:
- **1-5**: Quick select player count buttons
- **Enter**: Submit the form

---

## Need More Help?

- Check the main **Help** documentation for app-wide features
- Visit **Games** → **Jobs** to see sync operation details
- Review **Games** → **Metadata** tabs for data quality issues
- Consult the developer documentation for technical details

Happy gaming! 🎮🎲
