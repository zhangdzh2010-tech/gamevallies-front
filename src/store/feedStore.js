import { create } from 'zustand';

import * as feedService from '../services/feed';






















export const useFeedStore = create((set, get) => ({
  trending: [],
  latest: [],
  following: [],
  searchResults: [],
  currentTab: 'hot',
  isLoading: false,
  hasMore: true,
  page: 1,
  error: null,

  /**
   * Fetch trending games
   */
  fetchTrending: async (page = 1) => {
    set({ isLoading: true, error: null });

    try {
      const result = await feedService.getTrending(page, 10);

      set({
        trending: page === 1 ? result.items : [...get().trending, ...result.items],
        hasMore: result.hasMore,
        page,
        isLoading: false
      });
    } catch (error) {
      set({
        isLoading: false,
        error: error.message || 'Failed to fetch trending games'
      });
    }
  },

  /**
   * Fetch latest games
   */
  fetchLatest: async (page = 1) => {
    set({ isLoading: true, error: null });

    try {
      const result = await feedService.getLatest(page, 10);

      set({
        latest: page === 1 ? result.items : [...get().latest, ...result.items],
        hasMore: result.hasMore,
        page,
        isLoading: false
      });
    } catch (error) {
      set({
        isLoading: false,
        error: error.message || 'Failed to fetch latest games'
      });
    }
  },

  /**
   * Fetch following feed
   */
  fetchFollowing: async (page = 1) => {
    set({ isLoading: true, error: null });

    try {
      const result = await feedService.getFollowingFeed(page, 10);

      set({
        following: page === 1 ? result.items : [...get().following, ...result.items],
        hasMore: result.hasMore,
        page,
        isLoading: false
      });
    } catch (error) {
      set({
        isLoading: false,
        error: error.message || 'Failed to fetch following feed'
      });
    }
  },

  /**
   * Search games
   */
  searchGames: async (query, filters) => {
    set({ isLoading: true, error: null });

    try {
      const page = filters?.page || 1;
      const result = await feedService.searchGames(query, { ...filters, page, limit: 10 });

      set((state) => ({
        searchResults: page === 1 ? (result.items || []) : [...state.searchResults, ...(result.items || [])],
        hasMore: result.hasMore,
        page,
        isLoading: false
      }));
    } catch (error) {
      set({
        isLoading: false,
        error: error.message || 'Search failed'
      });
    }
  },

  /**
   * Set current tab
   */
  setTab: (tab) => {
    set({ currentTab: tab, page: 1, hasMore: true });

    // Fetch data for the tab
      switch (tab) {
        case 'hot':
          get().fetchTrending(1);
          break;
        case 'new':
          get().fetchLatest(1);
          break;
        case 'casual':
          get().searchGames('', { type: 'casual' });
          break;
        case 'puzzle':
          get().searchGames('', { type: 'puzzle' });
          break;
        case 'education':
          get().searchGames('', { type: 'education' });
          break;
      }
    },

  /**
   * Load more (infinite scroll)
   */
  loadMore: async () => {
    const { currentTab, page, isLoading } = get();

    if (isLoading) return;

    const nextPage = page + 1;

    try {
      switch (currentTab) {
        case 'hot':
          await get().fetchTrending(nextPage);
          break;
        case 'new':
          await get().fetchLatest(nextPage);
          break;
        case 'casual':
          await get().searchGames('', { type: 'casual', page: nextPage });
          break;
        case 'puzzle':
          await get().searchGames('', { type: 'puzzle', page: nextPage });
          break;
        case 'education':
          await get().searchGames('', { type: 'education', page: nextPage });
          break;
      }
    } catch (error) {
      set({ error: error.message || 'Failed to load more' });
    }
  },

  /**
   * Refresh feed
   */
  refresh: async () => {
    set({ page: 1, hasMore: true });

    const { currentTab } = get();

    try {
      switch (currentTab) {
        case 'hot':
          await get().fetchTrending(1);
          break;
        case 'new':
          await get().fetchLatest(1);
          break;
        case 'casual':
          await get().searchGames('', { type: 'casual' });
          break;
        case 'puzzle':
          await get().searchGames('', { type: 'puzzle' });
          break;
        case 'education':
          await get().searchGames('', { type: 'education' });
          break;
      }
    } catch (error) {
      set({ error: error.message || 'Refresh failed' });
    }
  },

  /**
   * Clear error
   */
  clearError: () => {
    set({ error: null });
  }
}));

export default useFeedStore;
