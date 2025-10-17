const axios = require('axios');

class ApiService {
  constructor(baseUrl) {
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor for auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('token'); // Adjust based on your auth storage
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error),
    );
  }

  async get(endpoint) {
    try {
      const response = await this.client.get(endpoint);
      return response.data;
    } catch (error) {
      throw this._handleError(error);
    }
  }

  async post(endpoint, data) {
    try {
      const response = await this.client.post(endpoint, data);
      return response.data;
    } catch (error) {
      throw this._handleError(error);
    }
  }

  async patch(endpoint, data) {
    try {
      const response = await this.client.patch(endpoint, data);
      return response.data;
    } catch (error) {
      throw this._handleError(error);
    }
  }

  _handleError(error) {
    if (error.response) {
      return new Error(error.response.data.message || 'API request failed');
    } else if (error.request) {
      return new Error('No response received from server');
    } else {
      return new Error(error.message || 'Request setup error');
    }
  }
}

module.exports = ApiService;