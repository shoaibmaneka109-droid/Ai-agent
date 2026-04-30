import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import * as authService from '../../services/authService';
import * as subscriptionService from '../../services/subscriptionService';

export const loginThunk = createAsyncThunk('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const res = await authService.login(credentials);
    return res.data.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.error?.message || 'Login failed');
  }
});

export const registerThunk = createAsyncThunk('auth/register', async (data, { rejectWithValue }) => {
  try {
    const res = await authService.register(data);
    return res.data.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.error?.message || 'Registration failed');
  }
});

export const logoutThunk = createAsyncThunk('auth/logout', async () => {
  try {
    await authService.logout();
  } catch {
    // Always clean up locally
  }
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
});

/**
 * Fetch fresh subscription status from the server.
 * Used after login and whenever the dashboard mounts.
 */
export const refreshSubscriptionThunk = createAsyncThunk(
  'auth/refreshSubscription',
  async (orgId, { rejectWithValue }) => {
    try {
      const res = await subscriptionService.getSubscriptionStatus(orgId);
      return res.data.data.subscription;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error?.message || 'Could not fetch subscription');
    }
  }
);

const initialState = {
  user: null,
  org: null,
  subscription: null,
  isAuthenticated: !!localStorage.getItem('accessToken'),
  loading: false,
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: (state) => { state.error = null; },
    setAuth: (state, action) => {
      state.user = action.payload.user;
      state.org = action.payload.org;
      state.subscription = action.payload.subscription ?? null;
      state.isAuthenticated = true;
    },
    setSubscription: (state, action) => {
      state.subscription = action.payload;
    },
  },
  extraReducers: (builder) => {
    // Login
    builder
      .addCase(loginThunk.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(loginThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.user;
        state.org = action.payload.org;
        // Subscription context is embedded in the org object from login response
        state.subscription = action.payload.org
          ? {
              status: action.payload.org.subscriptionStatus,
              trialEndsAt: action.payload.org.trialEndsAt,
              daysRemaining: action.payload.org.daysRemaining,
              hasFullAccess: action.payload.org.hasFullAccess,
              trialMemberLimit: action.payload.org.trialMemberLimit,
            }
          : null;
        state.isAuthenticated = true;
        localStorage.setItem('accessToken', action.payload.tokens.accessToken);
        localStorage.setItem('refreshToken', action.payload.tokens.refreshToken);
      })
      .addCase(loginThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });

    // Register
    builder
      .addCase(registerThunk.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(registerThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.user;
        state.org = action.payload.org;
        state.subscription = action.payload.org
          ? {
              status: action.payload.org.subscriptionStatus ?? 'trialing',
              trialEndsAt: action.payload.org.trialEndsAt,
              daysRemaining: action.payload.org.daysRemaining,
              hasFullAccess: true,
              trialMemberLimit: action.payload.org.trialMemberLimit,
            }
          : null;
        state.isAuthenticated = true;
        localStorage.setItem('accessToken', action.payload.accessToken);
        localStorage.setItem('refreshToken', action.payload.refreshToken);
      })
      .addCase(registerThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });

    // Logout
    builder.addCase(logoutThunk.fulfilled, (state) => {
      state.user = null;
      state.org = null;
      state.subscription = null;
      state.isAuthenticated = false;
      state.error = null;
    });

    // Refresh subscription
    builder
      .addCase(refreshSubscriptionThunk.fulfilled, (state, action) => {
        state.subscription = action.payload;
      });
  },
});

export const { clearError, setAuth, setSubscription } = authSlice.actions;
export default authSlice.reducer;
