/**
 * Games Routes Index
 * 
 * Aggregates all game-related routes into a single router
 */
import express from 'express';
import {requireAuth} from '../../middleware/authMiddleware';

import titleRoutes from './titleRoutes';
import releaseRoutes from './releaseRoutes';
import copyRoutes from './copyRoutes';
import accountRoutes from './accountRoutes';
import mappingRoutes from './mappingRoutes';
import platformRoutes from './platformRoutes';
import jobRoutes from './jobRoutes';
import loanRoutes from './loanRoutes';

const router = express.Router();

// Apply auth middleware to all games routes
router.use(requireAuth);

// Mount sub-routers
// Note: Order matters - more specific routes first

// Title routes (includes main games list and title operations)
router.use('/', titleRoutes);

// Other entity routes
router.use('/releases', releaseRoutes);
router.use('/copies', copyRoutes);
router.use('/accounts', accountRoutes);
router.use('/mappings', mappingRoutes);
router.use('/platforms', platformRoutes);
router.use('/jobs', jobRoutes);
router.use('/loans', loanRoutes);

export default router;
