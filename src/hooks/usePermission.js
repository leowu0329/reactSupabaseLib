import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { ROLES, checkPermission } from '../config/permissions';

export function usePermission() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(ROLES.GUEST);
  const [loading, setLoading] = useState(true);

  const fetchUserRole = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      setUser(null);
      setRole(ROLES.GUEST);
      setLoading(false);
      return;
    }

    setUser(session.user);
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (!error && profile?.role) {
      setRole(profile.role);
    } else {
      setRole(ROLES.MEMBER);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUserRole();

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      fetchUserRole();
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [fetchUserRole]);

  const can = useCallback(
    (permission) => checkPermission(role, permission),
    [role]
  );

  return { user, role, loading, can, refreshRole: fetchUserRole };
}