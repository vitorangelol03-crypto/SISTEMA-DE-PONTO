/**
 * Cliente do app do ENTREGADOR (rota publica /driver). Conversa SO com a edge fn
 * driver-public-api (verify_jwt=false): a seguranca fica no servidor (service_role
 * + token proprio). O front nunca fala direto com o banco.
 *
 * Sessao do driver = token HS256 (assinado com DRIVER_JWT_SECRET dedicado) guardado
 * em localStorage. Mandado no Authorization Bearer das acoes autenticadas; a chave
 * anonima vai no header `apikey` so pra passar no gateway do Supabase (padrao do
 * callEmployeePublicApi em database.ts).
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const TOKEN_KEY = 'driverpay_app_token';
const NAME_KEY = 'driverpay_app_driver_name';

export function getDriverToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function getDriverName(): string | null {
  return localStorage.getItem(NAME_KEY);
}
export function setDriverSession(token: string, name?: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  if (name) localStorage.setItem(NAME_KEY, name);
}
export function clearDriverSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(NAME_KEY);
}

/** Erro com status HTTP, pra UI distinguir 401 (sessao) dos demais. */
export class DriverApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'DriverApiError';
    this.status = status;
  }
}

async function callDriverApi<T>(
  action: string,
  params: Record<string, unknown> = {},
  token?: string,
): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(`${SUPABASE_URL}/functions/v1/driver-public-api`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON_KEY,
        Authorization: `Bearer ${token || ANON_KEY}`,
      },
      body: JSON.stringify({ action, ...params }),
    });
  } catch {
    throw new DriverApiError('Sem conexao. Verifique a internet e tente de novo.', 0);
  }
  const data = await resp.json().catch(() => ({} as Record<string, unknown>));
  if (!resp.ok) {
    const msg = (data as { error?: string }).error || `Falha em ${action}`;
    throw new DriverApiError(msg, resp.status);
  }
  return data as T;
}

export interface DriverLoginResult {
  token: string;
  mustChange: boolean;
  driver: { name: string };
}
export interface DriverMirror {
  id: string;
  periodId: string;
  periodLabel: string;
  /** 'aberto' = quinzena ATUAL; 'concluido' = FECHADA (tag no card). Null = edge fn antiga. */
  periodStatus: string | null;
  scope: 'individual' | 'group' | 'selection';
  platformFilter: string[] | null;
  deliveredAt: string;
  viewedAt: string | null;
}

/**
 * Um "lugar de anexo" que o driver deve enviar nota no período.
 *
 * 28/07: com pagamento por plataforma existe um slot por (ESPELHO × CNPJ) — pagando
 * LOGGI hoje e SHOPEE depois, são duas notas mesmo caindo no mesmo CNPJ.
 */
export interface NfSlot {
  emitterId: string;
  cnpj: string;
  label: string;
  /** Espelho que pediu esta nota ('' = quinzena inteira; null = sem espelho publicado). */
  mirrorKey: string | null;
  /** Rótulo pro driver: "SOMENTE LOGGI" / "Quinzena completa". */
  mirrorLabel: string;
  /** notas NÃO rejeitadas enviadas neste CNPJ (pendentes/validadas). */
  sent: number;
  /** notas rejeitadas (pediram outra). */
  rejected: number;
  /** motivo da última recusa (mostra "recusada: <motivo>, envie outra"). */
  rejectReason: string | null;
}
export interface NfFile {
  id: string;
  emitterId: string;
  emitterLabel: string;
  cnpj: string;
  filename: string | null;
  status: string;
  uploadedAt: string;
}

export function driverLogin(cpf: string, password: string): Promise<DriverLoginResult> {
  return callDriverApi<DriverLoginResult>('login', { cpf, password });
}
export function driverChangePassword(newPassword: string, token: string): Promise<{ ok: boolean; token: string }> {
  return callDriverApi<{ ok: boolean; token: string }>('change-password', { newPassword }, token);
}
export function driverMyMirrors(token: string): Promise<{ mirrors: DriverMirror[] }> {
  return callDriverApi<{ mirrors: DriverMirror[] }>('my-mirrors', {}, token);
}
export function driverMirrorUrl(publicationId: string, token: string): Promise<{ url: string }> {
  return callDriverApi<{ url: string }>('my-mirror-url', { publicationId }, token);
}

// ─── Nota Fiscal (Fase 3) ────────────────────────────────────────────────────
export function driverNfSlots(periodId: string, token: string): Promise<{ slots: NfSlot[] }> {
  return callDriverApi<{ slots: NfSlot[] }>('nf-slots', { periodId }, token);
}
export function driverNfList(periodId: string, token: string): Promise<{ files: NfFile[] }> {
  return callDriverApi<{ files: NfFile[] }>('nf-list', { periodId }, token);
}
export function driverNfUpload(
  input: {
    periodId: string; emitterId: string; contentType: string; fileBase64: string;
    filename?: string;
    /** De qual espelho é esta nota (28/07). Omitido = sem espelho publicado. */
    mirrorKey?: string | null;
  },
  token: string,
): Promise<{ ok: boolean; validated?: boolean }> {
  // Nota recusada pela conferência automática volta como HTTP 422 → callDriverApi
  // lança DriverApiError com o motivo (o slot reabre e mostra "recusada: <motivo>").
  return callDriverApi<{ ok: boolean; validated?: boolean }>('nf-upload', input, token);
}

// ─── Espelho do app da Shopee (print da tela) — 04/08/2026 ───────────────────
//
// ⚠️ O driver NUNCA recebe quantidade esperada nem resultado de conferência de
// quantidade — decisão do Victor: "ele só anexa a foto, não pode ter acesso a
// nenhuma informação". Repare que não há campo de número nenhum aqui embaixo.

/** Um print que este driver precisa anexar. */
export interface ProofSlot {
  /** De QUEM é o print. Se ele lidera um grupo, vem um item por membro. */
  driverId: string;
  driverName: string;
  /** true quando o print é de um membro do grupo, não dele próprio. */
  doGrupo: boolean;
  platformName: string;
  /** prints NÃO recusados já enviados neste lugar. */
  sent: number;
  /** prints recusados (data errada / ilegível): precisa reenviar. */
  rejected: number;
  /** motivo da última recusa — é a única coisa que o driver fica sabendo. */
  rejectReason: string | null;
}

export interface ProofFile {
  id: string;
  driverId: string;
  driverName: string;
  platformName: string;
  filename: string | null;
  /** 'enviado' | 'rejeitado'. Divergente e validado aparecem IGUAIS ('enviado'). */
  status: string;
  rejectReason: string | null;
  uploadedAt: string;
}

export function driverProofSlots(periodId: string, token: string): Promise<{ slots: ProofSlot[] }> {
  return callDriverApi<{ slots: ProofSlot[] }>('proof-slots', { periodId }, token);
}

export function driverProofList(periodId: string, token: string): Promise<{ files: ProofFile[] }> {
  return callDriverApi<{ files: ProofFile[] }>('proof-list', { periodId }, token);
}

export function driverProofUpload(
  input: {
    periodId: string;
    /** De quem é o print (o líder envia pelos membros). O servidor valida. */
    driverId: string;
    platformName: string;
    contentType: string;
    fileBase64: string;
    filename?: string;
  },
  token: string,
): Promise<{ ok: boolean }> {
  // Print recusado (data errada / ilegível) volta como HTTP 422 → callDriverApi
  // lança DriverApiError com o motivo. Quantidade divergente NUNCA cai aqui:
  // ela é aceita em silêncio e só aparece no painel.
  return callDriverApi<{ ok: boolean }>('proof-upload', input, token);
}
