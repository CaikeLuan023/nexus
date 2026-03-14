import type { User, DashboardResumo, VendasDashboard, ChamadoRecente, OrdemServico, OSResumo, OSMensagem, VendaNegocio, VendaNegocioDetalhe, VendaContrato, VendaTarefa, VendedorDashboard } from '../types';

const BASE_URL = __DEV__ ? 'http://192.168.15.2:3000' : 'https://nexus.seudominio.com';
let csrfToken: string | null = null;

export class AuthError extends Error { constructor(msg: string) { super(msg); this.name = 'AuthError'; } }

async function refreshCsrfToken() {
  try { const r = await fetch(`${BASE_URL}/api/csrf-token`, { credentials: 'include' }); if (r.ok) { csrfToken = (await r.json()).token; } } catch {}
}

async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers as Record<string, string>) };
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) { if (!csrfToken) await refreshCsrfToken(); if (csrfToken) headers['X-CSRF-Token'] = csrfToken; }
  const response = await fetch(`${BASE_URL}${endpoint}`, { ...options, credentials: 'include', headers });
  if (response.status === 401) { csrfToken = null; throw new AuthError('Sessao expirada'); }
  if (response.status === 403) {
    const data = await response.json();
    if (data.erro?.includes('CSRF')) {
      csrfToken = null; await refreshCsrfToken();
      const rh = { ...headers }; if (csrfToken) rh['X-CSRF-Token'] = csrfToken;
      const retry = await fetch(`${BASE_URL}${endpoint}`, { ...options, credentials: 'include', headers: rh });
      if (retry.status === 401) throw new AuthError('Sessao expirada');
      const rd = await retry.json(); if (!retry.ok) throw new Error(rd.erro || 'Erro'); return rd as T;
    }
    throw new Error(data.erro || 'Acesso negado');
  }
  const data = await response.json(); if (!response.ok) throw new Error(data.erro || 'Erro'); return data as T;
}

export const login = (usuario: string, senha: string) => { csrfToken = null; return apiFetch<User & { requer_2fa?: boolean }>('/api/login', { method: 'POST', body: JSON.stringify({ usuario, senha }) }); };
export const login2fa = (codigo: string) => apiFetch<User>('/api/login/2fa', { method: 'POST', body: JSON.stringify({ codigo }) });
export const logout = async () => { const r = await apiFetch<{ sucesso: boolean }>('/api/logout', { method: 'POST' }); csrfToken = null; return r; };
export const getMe = () => apiFetch<User>('/api/me');
export const getDashboardResumo = () => apiFetch<DashboardResumo>('/api/dashboard/resumo');
export const getVendasDashboard = () => apiFetch<VendasDashboard>('/api/vendas/dashboard');
export const getChamadosRecentes = () => apiFetch<ChamadoRecente[]>('/api/dashboard/chamados-recentes');

// Ordens de Servico
export const getMinhasOS = () => apiFetch<OrdemServico[]>('/api/ordens-servico/minhas');
export const getOSResumo = () => apiFetch<OSResumo>('/api/ordens-servico/resumo');
export const getOSDetalhe = (id: number) => apiFetch<OrdemServico>(`/api/ordens-servico/${id}`);
export const aceitarOS = (id: number) => apiFetch<{sucesso: boolean}>(`/api/ordens-servico/${id}/aceitar`, { method: 'PATCH' });
export const recusarOS = (id: number, motivo: string) => apiFetch<{sucesso: boolean}>(`/api/ordens-servico/${id}/recusar`, { method: 'PATCH', body: JSON.stringify({ motivo }) });
export const deslocamentoOS = (id: number) => apiFetch<{sucesso: boolean}>(`/api/ordens-servico/${id}/deslocamento`, { method: 'PATCH' });
export const iniciarOS = (id: number) => apiFetch<{sucesso: boolean}>(`/api/ordens-servico/${id}/iniciar`, { method: 'PATCH' });
export const concluirOS = (id: number, data: { assinatura_base64?: string; observacoes_tecnico?: string }) => apiFetch<{sucesso: boolean}>(`/api/ordens-servico/${id}/concluir`, { method: 'PATCH', body: JSON.stringify(data) });
export const getMensagensOS = (id: number, order: 'asc' | 'desc' = 'asc') => apiFetch<OSMensagem[]>(`/api/ordens-servico/${id}/mensagens?order=${order}`);
export const enviarMensagemOS = (id: number, texto: string) => apiFetch<OSMensagem>(`/api/ordens-servico/${id}/mensagens`, { method: 'POST', body: JSON.stringify({ texto }) });
export const toggleChecklistOS = (itemId: number) => apiFetch<{sucesso: boolean; concluido: number}>(`/api/ordens-servico/checklist/${itemId}`, { method: 'PATCH' });

// Fotos da OS
export const uploadFotoOS = async (osId: number, uri: string, tipo: string, legenda?: string) => {
  if (!csrfToken) await refreshCsrfToken();
  const formData = new FormData();
  formData.append('foto', {
    uri,
    name: `foto_${Date.now()}.jpg`,
    type: 'image/jpeg',
  } as any);
  formData.append('tipo', tipo);
  if (legenda) formData.append('legenda', legenda);
  const headers: Record<string, string> = {};
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  const response = await fetch(`${BASE_URL}/api/ordens-servico/${osId}/fotos`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: formData,
  });
  if (response.status === 401) throw new AuthError('Sessao expirada');
  const data = await response.json();
  if (!response.ok) throw new Error(data.erro || 'Erro ao enviar foto');
  return data;
};

export const deleteFotoOS = (fotoId: number) => apiFetch<{sucesso: boolean}>(`/api/ordens-servico/fotos/${fotoId}`, { method: 'DELETE' });

// Almoco / Equipe
export const toggleAlmoco = () => apiFetch<{sucesso: boolean; em_almoco: boolean}>('/api/almoco/toggle', { method: 'POST' });
export const getAlmocoStatus = () => apiFetch<{em_almoco: boolean}>('/api/almoco/status');
export const getEquipeOnline = () => apiFetch<{id: number; nome: string; perfil: string; foto_url: string | null; em_almoco: boolean}[]>('/api/equipe/online');

// Vendas - Dashboard
export const getVendedorDashboard = () => apiFetch<VendedorDashboard>('/api/vendas/dashboard-vendedor');

// Vendas - Negocios
export const getNegocios = (estagio?: string) => apiFetch<VendaNegocio[]>(`/api/vendas/negocios${estagio ? `?estagio=${estagio}` : ''}`);
export const getNegocioDetalhe = (id: number) => apiFetch<VendaNegocioDetalhe>(`/api/vendas/negocios/${id}`);
export const criarNegocio = (data: { provedor_nome_lead: string; contato_lead?: string; plano_interesse?: string; valor_estimado?: number; origem?: string; observacoes?: string }) =>
  apiFetch<VendaNegocio>('/api/vendas/negocios', { method: 'POST', body: JSON.stringify(data) });
export const mudarEstagioNegocio = (id: number, estagio: string, motivo_perda?: string) =>
  apiFetch<{ sucesso: boolean }>(`/api/vendas/negocios/${id}/estagio`, { method: 'PATCH', body: JSON.stringify({ estagio, motivo_perda }) });
export const adicionarInteracao = (id: number, tipo: string, descricao: string) =>
  apiFetch<{ id: number }>(`/api/vendas/negocios/${id}/interacoes`, { method: 'POST', body: JSON.stringify({ tipo, descricao }) });

// Vendas - Contratos
export const getContratos = () => apiFetch<VendaContrato[]>('/api/vendas/contratos');
export const criarContrato = (data: { provedor_nome: string; titulo: string; conteudo?: string; valor_mensal?: number; valor_total?: number; data_inicio?: string; data_fim?: string; negocio_id?: number }) =>
  apiFetch<{ id: number }>('/api/vendas/contratos', { method: 'POST', body: JSON.stringify(data) });
export const enviarContratoAssinatura = (id: number) =>
  apiFetch<{ sucesso: boolean; url: string; token: string }>(`/api/vendas/contratos/${id}/enviar`, { method: 'POST' });

// Vendas - Tarefas
export const getTarefasVendas = () => apiFetch<VendaTarefa[]>('/api/vendas/tarefas');
export const concluirTarefa = (id: number) =>
  apiFetch<{ sucesso: boolean }>(`/api/vendas/tarefas/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'concluida' }) });

export const getBaseUrl = () => BASE_URL;
