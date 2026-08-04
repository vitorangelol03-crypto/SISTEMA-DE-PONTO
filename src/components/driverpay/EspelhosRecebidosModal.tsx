/**
 * "Espelhos recebidos": o painel (2626) vê os PRINTS da tela do app que os
 * entregadores anexaram, com a foto ao lado do que a planilha diz, e valida /
 * recusa / exclui cada um.
 *
 * O que o driver NUNCA vê e aqui aparece: a quantidade esperada e a divergência.
 * Decisão do Victor (04/08) — o driver só anexa a foto; a diferença é assunto de
 * vocês. Por isso o filtro "só o que precisa de atenção" já vem ligado: numa leva
 * de 89 drivers, o que importa são os poucos que não bateram.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image as ImageIcon, Eye, Loader2, Check, X, Trash2, AlertTriangle,
  Clock, RefreshCw, Copy,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  listDeliveryProofs,
  proofFileUrl,
  setProofStatus,
  deleteDeliveryProof,
  getProofSettings,
  setProofSettings,
  type DeliveryProofRow,
} from '../../services/driverPay';
import { platformPackages, type DriverRowData } from './driverPayShared';
import { ModalShell } from './ModalShell';

interface EspelhosRecebidosModalProps {
  companyId: string;
  periodId: string;
  periodLabel: string;
  /** Linhas da grade — pra saber o que a planilha diz HOJE. */
  rows: DriverRowData[];
  userId: string;
  onClose: () => void;
  onChanged: () => void;
}

const dataBr = (iso: string | null): string => {
  if (!iso) return '—';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

/** Selo do resultado da conferência, em português leigo. */
const SeloConferencia: React.FC<{ p: DeliveryProofRow }> = ({ p }) => {
  const base = 'text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap';
  if (p.status === 'rejeitado') return <span className={`${base} bg-red-100 text-red-800`}>recusado</span>;
  if (p.status === 'validado') return <span className={`${base} bg-green-100 text-green-800`}>confere ✓</span>;
  if (p.checkStatus === 'divergente') return <span className={`${base} bg-amber-100 text-amber-800`}>quantidade diferente</span>;
  if (p.nextCheckAt) return <span className={`${base} bg-blue-100 text-blue-800`}>na fila de conferência</span>;
  if (p.checkStatus === 'pendente') return <span className={`${base} bg-gray-100 text-gray-700`}>conferir na mão</span>;
  return <span className={`${base} bg-gray-100 text-gray-700`}>recebido</span>;
};

export const EspelhosRecebidosModal: React.FC<EspelhosRecebidosModalProps> = ({
  companyId, periodId, periodLabel, rows, userId, onClose, onChanged,
}) => {
  const [carregando, setCarregando] = useState(true);
  const [proofs, setProofs] = useState<DeliveryProofRow[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [soAtencao, setSoAtencao] = useState(true);
  const [autoConfirm, setAutoConfirm] = useState(true);
  const [urls, setUrls] = useState<Record<string, string>>({});

  const recarregar = useCallback(async () => {
    try {
      const [lista, cfg] = await Promise.all([
        listDeliveryProofs(companyId, periodId),
        getProofSettings(companyId),
      ]);
      setProofs(lista);
      setAutoConfirm(cfg.autoConfirm);
      // Miniaturas: link assinado de 5 min, um por print.
      const pares = await Promise.all(
        lista.map(async (p) => [p.id, await proofFileUrl(p.filePath)] as const),
      );
      setUrls(Object.fromEntries(pares.filter((x): x is [string, string] => Boolean(x[1]))));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Nao consegui carregar os espelhos.');
    } finally {
      setCarregando(false);
    }
  }, [companyId, periodId]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  /** O que a planilha diz HOJE pra (driver, plataforma). */
  const esperadoHoje = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      for (const rl of r.routes) {
        for (const plat of Object.keys(rl.packages)) {
          const k = `${r.driverId}|${plat}`;
          m.set(k, platformPackages(r, plat));
        }
      }
    }
    return m;
  }, [rows]);

  /** Prints cujo arquivo é idêntico ao de OUTRO driver (o app não mostra o nome na tela). */
  const repetidos = useMemo(() => {
    const porHash = new Map<string, Set<string>>();
    for (const p of proofs) {
      if (!p.fileSha256) continue;
      const s = porHash.get(p.fileSha256) ?? new Set<string>();
      s.add(p.driverId);
      porHash.set(p.fileSha256, s);
    }
    const out = new Map<string, string[]>();
    for (const p of proofs) {
      if (!p.fileSha256) continue;
      const donos = porHash.get(p.fileSha256);
      if (donos && donos.size > 1) {
        out.set(p.id, proofs.filter((o) => o.fileSha256 === p.fileSha256 && o.driverId !== p.driverId)
          .map((o) => o.driverName));
      }
    }
    return out;
  }, [proofs]);

  const precisaAtencao = (p: DeliveryProofRow): boolean =>
    p.status === 'rejeitado' || p.checkStatus === 'divergente'
    || (p.status !== 'validado' && !p.nextCheckAt) || repetidos.has(p.id);

  const visiveis = soAtencao ? proofs.filter(precisaAtencao) : proofs;
  const naFila = proofs.filter((p) => p.nextCheckAt).length;
  const atencao = proofs.filter(precisaAtencao).length;

  const agir = async (fn: () => Promise<void>, id: string, ok: string) => {
    setOcupado(id);
    try { await fn(); toast.success(ok); await recarregar(); onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Nao consegui fazer isso.'); }
    finally { setOcupado(null); }
  };

  const handleToggleAuto = async () => {
    const novo = !autoConfirm;
    setAutoConfirm(novo);
    try {
      await setProofSettings(companyId, { autoConfirm: novo }, userId);
      toast.success(novo
        ? 'Ligado: o espelho fica conferido sozinho quando o print bate.'
        : 'Desligado: a conferencia continua, mas o clique final e seu.');
    } catch {
      setAutoConfirm(!novo);
      toast.error('Nao consegui mudar essa opcao.');
    }
  };

  return (
    <ModalShell
      icon={<ImageIcon className="w-5 h-5" />}
      title="Espelhos recebidos"
      subtitle={`${periodLabel} · ${proofs.length} print(s)`}
      onClose={onClose}
      maxWidth="sm:max-w-4xl"
      footer={
        <button
          type="button" onClick={onClose}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium min-h-[40px]"
        >
          Fechar
        </button>
      }
    >
      {carregando ? (
        <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="space-y-4">
          {/* ── Liga/desliga do automatico ────────────────────────────── */}
          <div className="rounded-lg border border-gray-200 px-3 py-2.5 flex items-start justify-between gap-3 flex-wrap">
            <div className="text-sm text-gray-700">
              <strong>Marcar o espelho conferido sozinho</strong>
              <p className="text-xs text-gray-500 mt-0.5">
                Desligado, a conferencia e a recusa continuam iguais — so o clique final fica com voce.
              </p>
            </div>
            <button
              type="button" onClick={handleToggleAuto}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border min-h-[36px] ${
                autoConfirm ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-300'
              }`}
            >
              {autoConfirm ? 'Ligado' : 'Desligado'}
            </button>
          </div>

          {/* ── Resumo + filtro ───────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-gray-600 flex items-center gap-3 flex-wrap">
              {atencao > 0 && (
                <span className="text-amber-700 font-medium flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" /> {atencao} precisa(m) da sua atencao
                </span>
              )}
              {naFila > 0 && (
                <span className="text-blue-700 flex items-center gap-1">
                  <Clock className="w-4 h-4" /> {naFila} na fila (o sistema reconfere sozinho)
                </span>
              )}
              {atencao === 0 && naFila === 0 && proofs.length > 0 && (
                <span className="text-green-700">Tudo conferido.</span>
              )}
            </div>
            <label className="text-sm text-gray-600 flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={soAtencao} onChange={(e) => setSoAtencao(e.target.checked)} />
              So o que precisa de atencao
            </label>
          </div>

          {visiveis.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">
              {proofs.length === 0
                ? 'Nenhum print recebido nesta quinzena ainda.'
                : 'Nada precisando de atencao — todos os prints bateram.'}
            </p>
          ) : (
            <div className="space-y-3">
              {visiveis.map((p) => {
                const hoje = esperadoHoje.get(`${p.driverId}|${p.platformName}`) ?? null;
                const mudou = p.expectedPackages !== null && hoje !== null && p.expectedPackages !== hoje;
                const diff = p.readPackages !== null && hoje !== null ? p.readPackages - hoje : null;
                const iguais = repetidos.get(p.id);
                return (
                  <div key={p.id} className="rounded-lg border border-gray-200 overflow-hidden">
                    <div className="flex flex-col sm:flex-row">
                      {/* A foto, do lado do numero — e o ponto da tela */}
                      <a
                        href={urls[p.id] ?? '#'} target="_blank" rel="noreferrer"
                        className="sm:w-44 flex-shrink-0 bg-gray-100 flex items-center justify-center min-h-[120px] hover:opacity-90"
                        title="Abrir o print em tamanho real"
                      >
                        {urls[p.id]
                          ? <img src={urls[p.id]} alt={`Print de ${p.driverName}`} className="max-h-40 w-full object-contain" />
                          : <ImageIcon className="w-8 h-8 text-gray-400" />}
                      </a>

                      <div className="flex-1 p-3 min-w-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 break-words">{p.driverName}</p>
                            <p className="text-xs text-gray-500">
                              {p.platformName} · {p.uploadSource === 'painel' ? 'anexado por voce' : 'enviado pelo portal'}
                            </p>
                          </div>
                          <SeloConferencia p={p} />
                        </div>

                        {/* A comparacao, em portugues */}
                        <div className="mt-2 text-sm">
                          {p.readPackages !== null ? (
                            <p className={diff && diff !== 0 ? 'text-amber-800' : 'text-gray-700'}>
                              planilha <strong>{hoje ?? '—'}</strong> · print <strong>{p.readPackages}</strong>
                              {diff !== null && diff !== 0 && (
                                <strong> · {diff > 0 ? `${diff} a mais` : `${Math.abs(diff)} a menos`} no print</strong>
                              )}
                            </p>
                          ) : (
                            <p className="text-gray-500">
                              {p.nextCheckAt ? 'Ainda nao foi lido — o sistema tenta de novo sozinho.' : 'Nao deu pra ler o print.'}
                            </p>
                          )}
                          {p.readStartDate && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              periodo do print: {dataBr(p.readStartDate)} a {dataBr(p.readEndDate)}
                            </p>
                          )}
                        </div>

                        {mudou && (
                          <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 flex items-start gap-1.5">
                            <RefreshCw className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                            Quando conferimos, a planilha dizia <strong>{p.expectedPackages}</strong>; hoje diz{' '}
                            <strong>{hoje}</strong> — a planilha mudou depois deste print.
                          </p>
                        )}

                        {iguais && iguais.length > 0 && (
                          <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 flex items-start gap-1.5">
                            <Copy className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                            Este print e <strong>identico</strong> ao de: {iguais.join(', ')}. O app da Shopee nao
                            mostra o nome do entregador na tela, entao o sistema nao tem como saber de quem e a foto.
                          </p>
                        )}

                        {p.rejectReason && (
                          <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                            {p.rejectReason}
                          </p>
                        )}

                        {/* Acoes */}
                        <div className="mt-2 flex items-center gap-1 flex-wrap">
                          <a
                            href={urls[p.id] ?? '#'} target="_blank" rel="noreferrer"
                            className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg" title="Ver o print"
                          >
                            <Eye className="w-4 h-4" />
                          </a>
                          {p.status !== 'validado' && (
                            <button
                              type="button" disabled={ocupado === p.id}
                              onClick={() => agir(() => setProofStatus(companyId, p.id, 'validado', userId), p.id, 'Print validado.')}
                              title="Aceitar este print (marca o espelho conferido)"
                              className="p-2 text-green-600 hover:bg-green-50 rounded-lg disabled:opacity-50"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          )}
                          {p.status !== 'rejeitado' && (
                            <button
                              type="button" disabled={ocupado === p.id}
                              onClick={() => {
                                const motivo = window.prompt('Por que esta recusando? (o entregador vai ver este texto)');
                                if (motivo === null) return;
                                void agir(
                                  () => setProofStatus(companyId, p.id, 'rejeitado', userId, motivo || 'Print recusado.'),
                                  p.id, 'Print recusado — o entregador vai reenviar.',
                                );
                              }}
                              title="Recusar e pedir outro print"
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            type="button" disabled={ocupado === p.id}
                            onClick={() => {
                              if (!window.confirm(`Excluir o print de ${p.driverName}? Isso apaga o registro.`)) return;
                              void agir(() => deleteDeliveryProof(companyId, p.id, userId), p.id, 'Print excluido.');
                            }}
                            title="Excluir de vez"
                            className="p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 rounded-lg disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          {ocupado === p.id && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </ModalShell>
  );
};
