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

// Book API
export const bookAPI = {
  getAll: (params) => api.get('/books', { params }),
  getById: (id) => api.get(`/books/${id}`),
  create: (data) => {
    if (data instanceof FormData) {
      return api.post('/books', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }
    return api.post('/books', data);
  },
  update: (id, data) => {
    if (data instanceof FormData) {
      return api.put(`/books/${id}`, data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }
    return api.put(`/books/${id}`, data);
  },
  delete: (id) => api.delete(`/books/${id}`),
  updateStatus: (id, status) => api.patch(`/books/${id}/status`, { status }),
};

// User API
export const userAPI = {
  getAll: () => api.get('/users'),
  getById: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
  uploadImage: (id, file, onUploadProgress) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post(`/users/${id}/images/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    });
  },
  deleteImage: (id, assetId) => api.delete(`/users/${id}/images/${assetId}`),
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

// Evaluation API
export const evalAPI = {
  evaluate: (data) => api.post('/evals', data),
};

export default api;
