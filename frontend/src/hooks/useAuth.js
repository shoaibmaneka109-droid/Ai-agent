import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchMe } from '../store/slices/authSlice';

export const useAuth = () => {
  const dispatch = useDispatch();
  const auth = useSelector((s) => s.auth);

  useEffect(() => {
    if (auth.isAuthenticated && !auth.user) {
      dispatch(fetchMe());
    }
  }, [auth.isAuthenticated, auth.user, dispatch]);

  return auth;
};
