import { request } from '@/utils/request';


export const commentService = {
  // Get comments for a game
  getComments: (gameId, page = 1, limit = 20) =>
  request.get(`/games/${gameId}/comments`, {
    data: { page, limit }
  }),

  // Get single comment
  getComment: (commentId) =>
  request.get(`/comments/${commentId}`),

  // Create comment
  createComment: (gameId, data) =>
  request.post(`/games/${gameId}/comments`, data),

  // Update comment
  updateComment: (commentId, content) =>
  request.put(`/comments/${commentId}`, { content }),

  // Delete comment
  deleteComment: (commentId) =>
  request.delete(`/comments/${commentId}`),

  // Get comment replies
  getReplies: (commentId, limit = 5) =>
  request.get(`/comments/${commentId}/replies`, {
    data: { limit }
  }),

  // Like comment
  likeComment: (commentId) =>
  request.post(`/comments/${commentId}/like`, {}),

  // Unlike comment
  unlikeComment: (commentId) =>
  request.delete(`/comments/${commentId}/like`),

  // Reply to comment
  replyToComment: (commentId, content) =>
  request.post(`/comments/${commentId}/replies`, { content })
};

export default commentService;