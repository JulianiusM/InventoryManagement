/**
 * Games Routes
 * 
 * Main games router - re-exports from modular route files
 * 
 * Route structure:
 * - /games                    - Game titles list (titleRoutes)
 * - /games/suggest            - Random game suggestion (suggestionRoutes)
 * - /games/titles/:id         - Title operations (titleRoutes)
 * - /games/releases/:id       - Release operations (releaseRoutes)
 * - /games/copies/:id         - Copy operations (copyRoutes)
 * - /games/accounts/:id       - External accounts (accountRoutes)
 * - /games/mappings           - Mapping queue (mappingRoutes)
 * - /games/platforms          - Platform management (platformRoutes)
 * - /games/jobs               - Sync jobs (jobRoutes)
 * - /games/loans/:id          - Loan operations (loanRoutes)
 */
import gamesRouter from './games/index';

export default gamesRouter;
