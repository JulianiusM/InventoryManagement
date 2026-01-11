# Random Game Suggestion Feature

## Overview

The Random Game Suggestion feature helps users quickly decide what to play by suggesting games based on customizable criteria. It's designed for quick use, especially on touch devices, when a group of friends can't decide what to play next.

## User Flow

1. **Wizard Page** (`/games/suggest`)
   - Select player count with large touch-friendly buttons (1, 2, 3, 4, 5+)
   - Choose game mode preferences (Online, Local, Physical)
     - Each mode has 3 states: Any, Required, Excluded
   - Access advanced filters (collapsible):
     - Platform whitelist/blacklist
     - Game type selection
   - Submit to get suggestion

2. **Result Page**
   - Displays suggested game with full details
   - Shows game cover, description, player counts, platforms
   - Actions:
     - View game details
     - Get another suggestion (preserves criteria)
     - Change criteria
   - If no matches: Shows applied filters and option to adjust

## Architecture

### Backend

**Service Layer** (`GameSuggestionService.ts`)
```typescript
interface SuggestionCriteria {
    playerCount?: number;
    includePlatforms?: string[];
    excludePlatforms?: string[];
    includeOnline?: boolean;
    includeLocal?: boolean;
    includePhysical?: boolean;
    gameTypes?: string[];
    ownerId: number;
}

function getRandomGameSuggestion(criteria): Promise<GameTitle | null>
function getRandomGameSuggestions(criteria, count): Promise<GameTitle[]>
```

**Key Implementation Details:**
- Database-level filtering via TypeORM QueryBuilder
- Platform filtering done client-side (requires joining releases)
- Fisher-Yates shuffle for unbiased randomization
- Helper functions to eliminate code duplication

**Controller Layer** (`gameSuggestionController.ts`)
- `showSuggestionWizard()`: Loads wizard page with platforms and game types
- `getGameSuggestion()`: Parses form data and returns suggestion

### Frontend

**Views:**
- `suggestion-wizard.pug`: Wizard interface with button-based navigation
- `suggestion-result.pug`: Result display with suggestion or no-match message

**Client-Side Features:**
- Player count buttons with active state management
- 3-state mode toggles (Any → Required → Excluded)
- Select2 integration for multi-select dropdowns
- Form preservation when getting another suggestion

**Styling:**
- Bootstrap dark theme (`text-bg-dark`, `btn-outline-*`)
- Touch-friendly large buttons
- Responsive grid layout
- Icon integration with Bootstrap Icons

## Filtering Logic

### Player Count
Matches games where:
- `playerCount` is within `[overallMinPlayers, overallMaxPlayers]`
- Special case: Singleplayer games (no modes) match `playerCount = 1` even with null counts

### Game Modes
- `includeOnline: true` → Game must support online
- `includeOnline: false` → Game must NOT support online
- `includeOnline: undefined` → Don't care about online

Same logic for `includeLocal` and `includePhysical`.

### Platforms
- `includePlatforms`: Game must have at least one release on these platforms
- `excludePlatforms`: Game must NOT have any release on these platforms
- Empty arrays = no platform filtering

### Game Types
- Filters by `GameTitle.type` field
- Multiple types = OR logic
- Empty array = all types

## Testing

**Unit Tests** (`tests/unit/gameSuggestion.test.ts`)
- Controller input parsing (player count, platforms, modes, types)
- Invalid input handling
- Form data array/string conversion
- Result formatting

**Test Data** (`tests/data/unit/suggestionData.ts`)
- Sample game titles with various configurations
- Test criteria for different filtering scenarios

**Coverage:**
- 9 unit tests covering all controller logic
- All tests pass with existing 350 test suite

## Integration

**Navigation:**
- Added "Random Game" button to `/games` page (green success button)
- Route: `/games/suggest`

**Routes Structure:**
```
/games/suggest (GET)  → Show wizard
/games/suggest (POST) → Get suggestion
```

## Future Enhancements

Potential improvements for future iterations:
1. Save favorite criteria presets
2. Multiple suggestions at once
3. History of suggested games
4. Weight suggestions by:
   - Last played date (suggest games not played recently)
   - Playtime (suggest games with less playtime)
   - Installation status (prefer installed games)
5. Integration with scheduling/calendar
6. Group suggestion (combine criteria from multiple users)

## Maintenance

**Adding New Filters:**
1. Add field to `SuggestionCriteria` interface
2. Add database filter in `applyFiltersToQuery()`
3. Add form field to `suggestion-wizard.pug`
4. Add parsing logic in `getGameSuggestion()`
5. Add display to `suggestion-result.pug` (no-match section)
6. Add tests

**Common Issues:**
- **No suggestions**: Check database has games matching criteria
- **Slow queries**: Ensure indexes on frequently filtered columns
- **Platform filter not working**: Verify releases are loaded (`.leftJoinAndSelect()`)
