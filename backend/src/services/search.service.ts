import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import type { Language } from './openfoodfacts/locales.js';

/**
 * Recent-search history for the demo user.
 *
 * Writes are fire-and-forget from the route's point of view: a failure to
 * record history must never turn a successful product search into an error.
 */

export const RECENT_SEARCH_LIMIT = 10;

/** Column is VARCHAR(191); truncate rather than let MySQL reject the insert. */
const MAX_TERM_LENGTH = 191;

export interface RecordSearchInput {
  userId: string;
  term: string;
  language: Language;
  resultCount: number;
}

export async function recordSearch(input: RecordSearchInput): Promise<void> {
  const term = input.term.trim().slice(0, MAX_TERM_LENGTH);
  if (term.length === 0) return;

  try {
    // Re-running the same search should move it to the top of the list rather
    // than filling the history with duplicates. Delete-then-insert is one
    // transaction and keeps `createdAt` meaning "last used".
    await prisma.$transaction([
      prisma.search.deleteMany({
        where: { userId: input.userId, term, language: input.language },
      }),
      prisma.search.create({
        data: {
          userId: input.userId,
          term,
          language: input.language,
          resultCount: input.resultCount,
        },
      }),
    ]);
  } catch (error) {
    logger.error('failed to record search', { term, error: String(error) });
  }
}

export interface RecentSearch {
  id: string;
  term: string;
  language: string;
  resultCount: number;
  createdAt: Date;
}

export async function getRecentSearches(
  userId: string,
  limit: number = RECENT_SEARCH_LIMIT,
): Promise<RecentSearch[]> {
  return prisma.search.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      term: true,
      language: true,
      resultCount: true,
      createdAt: true,
    },
  });
}

export async function clearRecentSearches(userId: string): Promise<number> {
  const { count } = await prisma.search.deleteMany({ where: { userId } });
  return count;
}
