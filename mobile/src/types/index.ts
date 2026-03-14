export interface User { id: number; nome: string; usuario: string; perfil: string; requer_2fa?: boolean; }

export interface DashboardResumo {
  total_chamados: number; pendentes: number; em_andamento: number; resolvidos: number;
  projetos_ativos: number; total_provedores: number; total_treinamentos: number;
}

export interface VendasDashboard {
  kpis: { totalNegocios: number; totalAtivados: number; totalPerdidos: number; taxaConversao: number | string; valorPipeline: number; ativacoesMes: number; perdasMes: number; visitasMes: number; };
  propostas: { total: number; enviadas: number; aceitas: number; recusadas: number };
  funil: Array<{ estagio: string; total: number; valor: number }>;
  ativacoesPorMes: Array<{ mes: string; total: number }>;
  rankingVendedores: Array<{ vendedor: string; total_negocios: number; ativacoes: number; valor_ativado: number }>;
  porOrigem: Array<{ origem: string; total: number }>;
}

export interface ChamadoRecente { id: number; titulo: string; categoria: string; status: string; data_abertura: string; provedor_nome: string; prioridade?: string; responsavel_nome?: string; }

export interface OrdemServico {
  id: number; numero: string; chamado_id?: number;
  criador_id: number; criador_nome?: string;
  tecnico_id: number; tecnico_nome?: string;
  cliente_nome: string; cliente_telefone?: string; cliente_documento?: string;
  endereco: string; endereco_complemento?: string; latitude?: number; longitude?: number;
  tipo_servico: string; descricao?: string; equipamentos?: string;
  prioridade: string; status: string; observacoes_tecnico?: string;
  data_agendamento?: string; data_envio?: string; data_aceite?: string;
  data_inicio_deslocamento?: string; data_inicio_execucao?: string; data_conclusao?: string;
  assinatura_base64?: string;
  checklist?: OSChecklistItem[]; fotos?: OSFoto[]; historico?: OSHistorico[];
  criado_em: string; atualizado_em: string;
}

export interface OSChecklistItem { id: number; descricao: string; concluido: number; concluido_em?: string; }

export interface OSFoto { id: number; tipo: string; caminho: string; legenda?: string; criado_em: string; }

export interface OSHistorico { id: number; usuario_nome?: string; acao: string; de_status?: string; para_status?: string; detalhes?: string; criado_em: string; }

export interface OSMensagem { id: number; os_id: number; usuario_id: number; usuario_nome?: string; texto: string; lido: number; criado_em: string; }

export interface OSResumo { rascunho: number; enviada: number; aceita: number; em_deslocamento: number; em_execucao: number; concluida: number; recusada: number; cancelada: number; }

// ==================== VENDAS ====================

export interface VendaNegocio {
  id: number; provedor_id: number | null; provedor_nome: string | null;
  provedor_nome_lead: string | null; contato_lead: string | null;
  estagio: string; plano_interesse: string | null; valor_estimado: number;
  responsavel_vendedor: string; origem: string | null;
  observacoes: string | null; motivo_perda: string | null;
  criado_em: string; atualizado_em: string;
}

export interface VendaInteracao {
  id: number; negocio_id: number; tipo: string;
  descricao: string; criado_por: string; criado_em: string;
}

export interface VendaNegocioDetalhe extends VendaNegocio {
  interacoes: VendaInteracao[];
}

export interface VendaContrato {
  id: number; negocio_id: number | null; proposta_id: number | null;
  provedor_id: number | null; provedor_nome: string;
  numero_contrato: string | null; titulo: string; conteudo: string | null;
  valor_mensal: number; valor_total: number;
  data_inicio: string | null; data_fim: string | null;
  status: string; assinado_em: string | null;
  assinatura_token: string | null; pdf_caminho: string | null;
  responsavel: string; criado_em: string;
}

export interface VendaTarefa {
  id: number; titulo: string; descricao: string | null;
  provedor_nome?: string | null; negocio_id: number | null;
  tipo: string; data_hora: string; status: string;
  responsavel: string; criado_em: string;
}

export interface VendedorDashboard {
  stats: { negocios_ativos: number; ativacoes_mes: number; tarefas_pendentes: number; visitas_mes: number; };
  valor_pipeline: number; taxa_conversao: string | number;
  negocios_por_estagio: Array<{ estagio: string; total: number }>;
  ativacoes_por_mes: Array<{ mes: string; total: number }>;
  proximas_tarefas: VendaTarefa[];
  metas: Array<{ id: number; tipo_meta: string; valor_alvo: number; valor_atual: number; percentual_atingido: number; }>;
  performance: { media_equipe_ativacoes: number; tempo_medio_fechamento: number; perdidos_mes: number; negocios_parados: Array<VendaNegocio & { dias_parado: number }>; };
}
