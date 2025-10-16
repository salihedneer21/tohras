import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    const message = error.response?.data?.message || error.message || 'Something went wrong';
    return Promise.reject(new Error(message));
  }
);

// User API
export const userAPI = {
  getAll: () => api.get('/users'),
  getById: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
  addImageUrls: (id, imageUrls) => api.post(`/users/${id}/images`, { imageUrls }),
  removeImageUrl: (id, imageUrl) => api.delete(`/users/${id}/images`, { data: { imageUrl } }),
};

// Training API
export const trainingAPI = {
  getAll: (params) => api.get('/trainings', { params }),
  getById: (id) => api.get(`/trainings/${id}`),
  create: (data) => {
    if (data instanceof FormData) {
      return api.post('/trainings', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }
    return api.post('/trainings', data);
  },
  checkStatus: (id) => api.get(`/trainings/${id}/status`),
  cancel: (id) => api.post(`/trainings/${id}/cancel`),
  getUserSuccessful: (userId) => api.get(`/trainings/user/${userId}/successful`),
};

// Generation API
export const generationAPI = {
  getAll: (params) => api.get('/generations', { params }),
  getById: (id) => api.get(`/generations/${id}`),
  create: (data) => api.post('/generations', data),
  download: (id) => api.post(`/generations/${id}/download`),
  getByUser: (userId) => api.get(`/generations/user/${userId}`),
};

export default api;
