import { apiRequest } from './api.js'

export const discussionApi = {
  list(resourceId, token) {
    return apiRequest(`/resources/${encodeURIComponent(resourceId)}/comments`, { token })
  },
  create(resourceId, content, token) {
    return apiRequest(`/resources/${encodeURIComponent(resourceId)}/comments`, {
      method: 'POST',
      body: { content },
      token,
    })
  },
  update(resourceId, commentId, content, token) {
    return apiRequest(`/resources/${encodeURIComponent(resourceId)}/comments/${encodeURIComponent(commentId)}`, {
      method: 'PUT',
      body: { content },
      token,
    })
  },
  remove(resourceId, commentId, token) {
    return apiRequest(`/resources/${encodeURIComponent(resourceId)}/comments/${encodeURIComponent(commentId)}`, {
      method: 'DELETE',
      token,
    })
  },
}
