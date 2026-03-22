import { useEffect } from 'react';
import { useFeedStore } from '../store/feedStore';

/**
 * Hook for feed operations
 */
export function useFeed() {
  const {
    trending,
    latest,
    following,
    searchResults,
    currentTab,
    isLoading,
    hasMore,
    error,
    searchGames,
    setTab,
    loadMore,
    refresh,
    clearError
  } = useFeedStore();

  // Get current feed based on active tab
  const games = (() => {
    switch (currentTab) {
      case 'hot':
        return trending;
      case 'new':
        return latest;
      case 'casual':
      case 'puzzle':
      case 'education':
        return searchResults;
      default:
        return following;
    }
  })();

  // Fetch initial data on mount
  useEffect(() => {
    refresh();
  }, []);

  return {
    games,
    isLoading,
    hasMore,
    error,
    currentTab,
    setTab,
    loadMore,
    refresh,
    search: searchGames,
    clearError
  };
}

export default useFeed;
