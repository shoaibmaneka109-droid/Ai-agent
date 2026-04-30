import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { authApi } from '../../services/api';

export const loginUser = createAsyncThunk('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const { data } = await authApi.login(credentials);
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    return data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.error || 'Login failed');
  }
});

export const registerUser = createAsyncThunk('auth/register', async (payload, { rejectWithValue }) => {
  try {
    const { data } = await authApi.register(payload);
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    return data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.error || 'Registration failed');
  }
});

export const logoutUser = createAsyncThunk('auth/logout', async (_, { dispatch }) => {
  const refreshToken = localStorage.getItem('refreshToken');
  try { await authApi.logout(refreshToken); } catch {}
  localStorage.clear();
  dispatch(authSlice.actions.clearAuth());
});

export const fetchMe = createAsyncThunk('auth/me', async (_, { rejectWithValue }) => {
  try {
    const { data } = await authApi.me();
    return data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.error || 'Failed to fetch profile');
  }
});

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    organization: null,
    isAuthenticated: !!localStorage.getItem('accessToken'),
    loading: false,
    error: null,
  },
  reducers: {
    clearAuth: (state) => {
      state.user = null;
      state.organization = null;
      state.isAuthenticated = false;
      state.error = null;
    },
    clearError: (state) => { state.error = null; },
  },
  extraReducers: (builder) => {
    const pending = (state) => { state.loading = true; state.error = null; };
    const rejected = (state, action) => { state.loading = false; state.error = action.payload; };

    builder
      .addCase(loginUser.pending, pending)
      .addCase(loginUser.fulfilled, (state, { payload }) => {
        state.loading = false;
        state.isAuthenticated = true;
        state.user = payload.user;
        state.organization = payload.organization;
      })
      .addCase(loginUser.rejected, rejected)

      .addCase(registerUser.pending, pending)
      .addCase(registerUser.fulfilled, (state, { payload }) => {
        state.loading = false;
        state.isAuthenticated = true;
        state.user = payload.user;
        state.organization = payload.organization;
      })
      .addCase(registerUser.rejected, rejected)

      .addCase(fetchMe.fulfilled, (state, { payload }) => {
        state.user = payload;
        state.isAuthenticated = true;
      })
      .addCase(fetchMe.rejected, (state) => {
        state.isAuthenticated = false;
        localStorage.clear();
      });
  },
});

export const { clearAuth, clearError } = authSlice.actions;
export default authSlice.reducer;
