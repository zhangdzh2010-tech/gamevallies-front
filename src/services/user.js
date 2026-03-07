import { request } from '@/utils/request';


export const userService = {
  // Get user profile
  getUserProfile: (id) =>
  request.get(`/users/${id}`),

  // Get current user profile
  getCurrentProfile: () =>
  request.get('/users/me'),

  // Update user profile
  updateProfile: (data) =>
  request.put('/users/me', data),

  // Get followers
  getFollowers: (userId, page = 1, limit = 20) =>
  request.get(`/users/${userId}/followers`, {
    data: { page, limit }
  }),

  // Get following
  getFollowing: (userId, page = 1, limit = 20) =>
  request.get(`/users/${userId}/following`, {
    data: { page, limit }
  }),

  // Follow user
  followUser: (userId) =>
  request.post(`/users/${userId}/follow`, {}),

  // Unfollow user
  unfollowUser: (userId) =>
  request.delete(`/users/${userId}/follow`),

  // Search users
  searchUsers: (query, limit = 20) =>
  request.get('/users/search', {
    data: { q: query, limit }
  }),

  // Upload avatar
  uploadAvatar: (filePath) =>
  request.upload('/users/avatar', filePath),

  // Get user notifications
  getNotifications: (page = 1, limit = 20) =>
  request.get('/notifications', {
    data: { page, limit }
  }),

  // Mark notification as read
  markNotificationAsRead: (notificationId) =>
  request.put(`/notifications/${notificationId}/read`, {}),

  // Mark all notifications as read
  markAllNotificationsAsRead: () =>
  request.put('/notifications/read-all', {}),

  // Get user statistics
  getUserStats: (userId) =>
  request.get(`/users/${userId}/stats`)
};

export default userService;