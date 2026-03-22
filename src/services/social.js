import { post, get, del } from './api';


/**
 * Toggle like for a game or comment
 * Sends a toggle request that will like if not liked, unlike if already liked
 */
export async function likeGame(targetType, targetId)


{
  return post(`/api/v1/social/like`, {
    targetType,
    targetId
  });
}

/**
 * Follow user
 */
export async function followUser(userId)


{
  return post(`/api/v1/social/follow`, {
    targetId: userId
  });
}

/**
 * Unfollow user
 */
export async function unfollowUser(userId) {
  await del(`/api/v1/social/follow/${userId}`);
}

/**
 * Get user followers
 */
export async function getFollowers(
userId,
page = 1,
limit = 10)
{
  return get(`/api/v1/social/followers/${userId}`, {
    data: { page, limit }
  });
}

/**
 * Get user following
 */
export async function getFollowing(
userId,
page = 1,
limit = 10)
{
  return get(`/api/v1/social/following/${userId}`, {
    data: { page, limit }
  });
}

/**
 * Toggle like on a comment
 */
export async function likeComment(commentId) {
  return post(`/api/v1/comments/${commentId}/like`, {});
}

/**
 * Create comment
 */
export async function createComment(
gameId,
content,
parentId)
{
  return post(`/api/v1/comments`, {
    gameId,
    content,
    parentId
  });
}

/**
 * Get comments for game
 */
export async function getComments(
gameId,
page = 1,
limit = 10)
{
  return get(`/api/v1/comments/games/${gameId}`, {
    data: { page, limit }
  });
}

/**
 * Delete comment
 */
export async function deleteComment(commentId) {
  await del(`/api/v1/comments/${commentId}`);
}

/**
 * Get comment replies
 */
export async function getCommentReplies(
commentId,
page = 1,
limit = 10)
{
  return get(`/api/v1/comments/${commentId}/replies`, {
    data: { page, limit }
  });
}

/**
 * Get share data for game (for social sharing)
 */
export async function getShareData(gameId)





{
  return get(`/api/v1/games/${gameId}/share-data`);
}

/**
 * Record share
 */
export async function recordShare(gameId, platform) {
  await post(`/api/v1/games/${gameId}/share`, {
    platform
  });
}

/**
 * Get notifications
 */
export async function getNotifications(page = 1, limit = 10)









{
  return get(`/api/v1/notifications`, {
    data: { page, limit }
  });
}

/**
 * Mark notifications as read
 */
export async function markNotificationsAsRead(ids) {
  await post(`/api/v1/notifications/mark-read`, {
    ids
  });
}

/**
 * Mark all notifications as read
 */
export async function markAllNotificationsAsRead() {
  await post(`/api/v1/notifications/mark-all-read`, {});
}

/**
 * Get unread notification count
 */
export async function getUnreadCount() {
  const result = await get(`/api/v1/notifications/unread-count`);
  return result.count;
}

/**
 * Delete notification
 */
export async function deleteNotification(id) {
  await del(`/api/v1/notifications/${id}`);
}

/**
 * Get trending creators
 */
export async function getTrendingCreators(limit = 10) {
  return get(`/api/v1/creators/trending`, {
    data: { limit }
  });
}

/**
 * Check if following user
 */
export async function checkFollowStatus(userId) {
  const result = await get(`/api/v1/social/follow-status/${userId}`);
  return result?.isFollowing ?? result?.following ?? false;
}

/**
 * Check if liked
 */
export async function checkLikeStatus(targetType, targetId) {
  const result = await get(`/api/v1/social/like-status/${targetType}/${targetId}`);
  return result.liked;
}

export default {
  likeGame,
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  createComment,
  getComments,
  deleteComment,
  getCommentReplies,
  getShareData,
  recordShare,
  getNotifications,
  markNotificationsAsRead,
  markAllNotificationsAsRead,
  getUnreadCount,
  deleteNotification,
  getTrendingCreators,
  checkFollowStatus,
  checkLikeStatus
};
