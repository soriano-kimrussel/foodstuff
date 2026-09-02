import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { attachDemoUser, requireUser } from '../middleware/demo-user.js';
import {
  clearRecentSearches,
  getRecentSearches,
  RECENT_SEARCH_LIMIT,
} from '../services/search.service.js';

export const searchesRouter = Router();

/** GET /api/searches/recent — the demo user's search history, newest first. */
searchesRouter.get(
  '/searches/recent',
  attachDemoUser,
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const searches = await getRecentSearches(user.id, RECENT_SEARCH_LIMIT);
    res.json({ searches });
  }),
);

/** DELETE /api/searches — clears the history. */
searchesRouter.delete(
  '/searches',
  attachDemoUser,
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const deleted = await clearRecentSearches(user.id);
    res.json({ deleted });
  }),
);
