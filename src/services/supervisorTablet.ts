/**
 * MODO SUPERVISOR DO TABLET — as chamadas pra edge function `ponto-supervisor-api` (07/10/2026,
 * plano do tablet sem toque, entregas D/E/F). O celular do supervisor entra com o código + senha do
 * PAINEL e recebe um segredo de sessão (20 min) que fica SÓ na memória da página — nada no
 * localStorage. O tablet fala com a mesma função usando o segredo dele.
 *
 * Quem decide tudo é o servidor (permissão, empresa, prazo, 1 uso do QR); aqui é só o transporte, e
 * a recusa chega com o MOTIVO dele (`ErroDoSupervisor`).
 */
const URL_DA_FUNCAO = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ponto-supervisor-api`;

/** Recusa do servidor, com o status HTTP e o motivo (quando ele manda um código de motivo). */
export class ErroDoSupervisor extends Error {
  readonly status: number;
  readonly motivo: string | null;

  constructor(mensagem: string, status: number, motivo: string | null) {
    super(mensagem);
    this.name = 'ErroDoSupervisor';
    this.status = status;
    this.motivo = motivo;
  }
}

async function chamar<T>(action: string, params: Record<string, unknown>): Promise<T> {
  const chave = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const resp = await fetch(URL_DA_FUNCAO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: chave, Authorization: `Bearer ${chave}` },
    body: JSON.stringify({ action, ...params }),
  });
  const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resp.ok) {
    throw new ErroDoSupervisor(
      typeof data.error === 'string' ? data.error : 'Não foi possível falar com o servidor.',
      resp.status,
      typeof data.motivo === 'string' ? data.motivo : null,
    );
  }
  return data as T;
}

export interface OQueOSupervisorPode {
  cadastrar: boolean;
  refazerRosto: boolean;
}

export interface SessaoDoSupervisor {
  sessionToken: string;
  expiresAt: string;
  usuario: { id: string; nome: string | null };
  funcionario: { id: string; nome: string } | null;
  empresa: { id: string; nome: string };
  pode: OQueOSupervisorPode;
}

export interface QrGerado {
  qrId: string;
  qrText: string;
  expiresAt: string;
}

export type StatusDoQr = 'pendente' | 'lido' | 'capturado' | 'confirmado' | 'recusado' | 'cancelado' | 'vencido';

export interface QualidadeDoRosto {
  maiorDistanciaEntreFotos?: number;
  resultado?: 'ok' | 'aviso' | 'recusa';
  parecidoCom?: { nome: string; distancia: number } | null;
  distanciaDoRostoAntigo?: number | null;
}

export interface PontoDoDia {
  entry_time: string | null;
  entry_1_time: string | null;
  exit_1_time: string | null;
  entry_2_time: string | null;
  exit_2_time: string | null;
  exit_time_full: string | null;
}

export interface EstadoDoQr {
  status: StatusDoQr;
  tipo: 'parear' | 'rosto';
  tablet: string | null;
  tentativas: number;
  foto?: string | null;
  qualidade?: QualidadeDoRosto | null;
  pontoDeHoje?: PontoDoDia | null;
}

export interface FuncionarioDoSupervisor {
  id: string;
  nome: string;
  funcao: string | null;
  cpfFinal: string;
  temRosto: boolean;
  pediuNovoRosto: boolean;
  status: string;
  desligado: boolean;
}

export type ResultadoDoCadastro =
  | { employeeId: string; nome: string; jaExiste?: undefined }
  | { jaExiste: true; employeeId: string; nome: string };

// ── Celular do supervisor ──
export const entrarComoSupervisor = (userId: string, password: string, companyId?: string) =>
  chamar<SessaoDoSupervisor>('supervisor-login', { userId, password, ...(companyId ? { companyId } : {}) });
export const sairDoModoSupervisor = (session: string) => chamar<{ ok: true }>('supervisor-logout', { session });
export const gerarQrDeConectar = (session: string) => chamar<QrGerado>('create-pair-qr', { session });
export const estadoDoQr = (session: string, qrId: string) => chamar<EstadoDoQr>('qr-status', { session, qrId });
export const listarFuncionariosDoSupervisor = (session: string) =>
  chamar<{ funcionarios: FuncionarioDoSupervisor[]; pode: OQueOSupervisorPode }>('list-employees', { session });
export const listarFuncoesDoSupervisor = (session: string) => chamar<{ funcoes: string[] }>('list-function-roles', { session });
export const cadastrarPeloTablet = (session: string, dados: { name: string; cpf: string; phone: string; functionRole: string }) =>
  chamar<ResultadoDoCadastro>('create-employee', { session, ...dados });
export const gerarQrDoRosto = (session: string, employeeId: string, mode: 'novo' | 'refazer', baterPonto: boolean) =>
  chamar<QrGerado>('create-face-qr', { session, employeeId, mode, baterPonto });
export const decidirRostoCapturado = (session: string, qrId: string, aceitar: boolean) =>
  chamar<{ status: StatusDoQr; tentativas?: number }>('confirm-face', { session, qrId, aceitar });

// ── Tablet (entrega F) ──
export type LeituraDoQr =
  | { tipo: 'parear'; supervisor: { id: string; nome: string | null }; funcionarioDoSupervisorId: string | null }
  | { tipo: 'rosto'; qrId: string; employeeId: string; primeiroNome: string; modo: 'novo' | 'refazer'; baterPonto: boolean; prazoCapturaMs: number };

export const tabletLeuQr = (deviceToken: string, qrText: string) => chamar<LeituraDoQr>('tablet-read-qr', { deviceToken, qrText });
export const tabletEnviaRosto = (deviceToken: string, qrId: string, amostras: number[][], foto: string) =>
  chamar<{ ok: true; aviso: boolean }>('tablet-submit-face', { deviceToken, qrId, amostras, foto });
export const tabletEstadoDoQr = (deviceToken: string, qrId: string) =>
  chamar<{ status: StatusDoQr; employeeId: string | null; baterPonto: boolean; tentativas: number }>('tablet-qr-status', { deviceToken, qrId });
