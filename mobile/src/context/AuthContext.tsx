import React, { createContext, useState, useContext, useEffect } from 'react';
import * as api from '../services/api';
import type { User } from '../types';

interface AuthState { user: User | null; isLoading: boolean; isAuthenticated: boolean; pending2fa: boolean; }
interface AuthContextType extends AuthState { signIn: (u: string, s: string) => Promise<{ requer_2fa?: boolean }>; verify2fa: (c: string) => Promise<void>; signOut: () => Promise<void>; }
const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, isLoading: true, isAuthenticated: false, pending2fa: false });
  useEffect(() => { (async () => { try { const u = await api.getMe(); setState({ user: u, isLoading: false, isAuthenticated: true, pending2fa: false }); } catch { setState({ user: null, isLoading: false, isAuthenticated: false, pending2fa: false }); } })(); }, []);
  async function signIn(usuario: string, senha: string) {
    const r = await api.login(usuario, senha);
    if (r.requer_2fa) { setState(p => ({ ...p, pending2fa: true })); return { requer_2fa: true }; }
    setState({ user: r, isLoading: false, isAuthenticated: true, pending2fa: false }); return {};
  }
  async function verify2fa(codigo: string) { const u = await api.login2fa(codigo); setState({ user: u, isLoading: false, isAuthenticated: true, pending2fa: false }); }
  async function signOut() { try { await api.logout(); } catch {} setState({ user: null, isLoading: false, isAuthenticated: false, pending2fa: false }); }
  return <AuthContext.Provider value={{ ...state, signIn, verify2fa, signOut }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const c = useContext(AuthContext); if (!c) throw new Error('useAuth must be inside AuthProvider'); return c; }
