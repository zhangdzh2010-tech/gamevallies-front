import { useState, useEffect, useCallback } from 'react';
















/**
 * Generic infinite scroll hook
 */
export function useInfiniteScroll(
fetchFn,
options = {})
{
  void options;
  const [data, setData] = useState([]);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(null);

  /**
   * Load more items
   */
  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await fetchFn(page);
      setData((prev) => [...prev, ...result.items]);
      setPage((prev) => prev + 1);
      setHasMore(result.hasMore);
    } catch (err) {
      setError(err.message || 'Failed to load more items');
    } finally {
      setIsLoading(false);
    }
  }, [fetchFn, page, isLoading, hasMore]);

  /**
   * Refresh data
   */
  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setPage(1);

    try {
      const result = await fetchFn(1);
      setData(result.items);
      setHasMore(result.hasMore);
    } catch (err) {
      setError(err.message || 'Failed to refresh');
    } finally {
      setIsLoading(false);
    }
  }, [fetchFn]);

  /**
   * Initial load
   */
  useEffect(() => {
    refresh();
  }, []);

  return {
    data,
    isLoading,
    hasMore,
    error,
    loadMore,
    refresh,
    setData
  };
}

export default useInfiniteScroll;
