/**
 * "Notas recebidas": o painel (2626) vê as notas que os entregadores anexaram no período,
 * VALIDA / RECUSA (com motivo) / EXCLUI cada uma, e baixa (uma a uma ou .zip nomeado
 * "Driver - CNPJ - Quinzena[ (n)].ext"). Bucket privado -> link assinado.
 *
 * Regra: só nota VALIDADA conta pra NF ficar verde no painel (ciente de grupo — só o líder
 * anexa; as notas do grupo validam o grupo todo). Recusar/Excluir reabrem o CNPJ no app
 * pro driver reenviar (Excluir apaga o registro; Recusar guarda o motivo que o driver vê).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Download, Eye, Loader2, Package, Check, X, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import JSZip from 'jszip';
import {
  listNotaFiscalFiles,
  notaFiscalFileUrl,
  setNotaFiscalStatus,
  deleteNotaFiscalFile,
  getNfAutoValidate,
  setNfAutoValidate,
  type NotaFiscalFileRow,
} from '../../services/driverPay';
import { notaFiscalFileName, nfPrazoStatus, nfAtrasoLabel } from './driverPayShared';
import { ModalShell } from './ModalShell';

interface NotasRecebidasModalProps {
  companyId: string;
  periodId: string;
  periodLabel: string;
  userId: string;
  onClose: () => void;
  /** Chamado após validar/recusar/excluir — o painel recarrega a coluna NF. */
  onChanged?: () => void;
  /**
   * Espelhos publicados desta quinzena, pra saber o PRAZO de cada nota (04/08/2026).
   * A nota é ligada ao espelho por (driver, conjunto de plataformas), que é a mesma
   * chave que o resto do painel usa.
   */
  publicacoes?: readonly { driverId: string; platformKey: string; nfDueAt: string | null }[];
}

const extOf = (r: NotaFiscalFileRow): string => {
  const p = (r.filePath.split('.').pop() ?? '').toLowerCase();
  return p && p.length <= 5 ? p : 'jpg';
};

async function fetchBlob(path: string): Promise<Blob> {
  const url = await notaFiscalFileUrl(path);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Falha ao baixar o arquivo');
  return resp.blob();
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Selo de status da nota. */
const StatusBadge: React.FC<{ status: string; reason: string | null; auto?: boolean }> = ({ status, reason, auto }) => {
  if (status === 'validada')
    return (
      <span
        className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 whitespace-nowrap"
        title={auto ? 'Validada automaticamente na conferência do envio (valor + CNPJ + nome conferidos).' : undefined}
      >
        ✓ validada{auto ? ' (auto)' : ''}
      </span>
    );
  if (status === 'rejeitada')
    return (
      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 whitespace-nowrap" title={reason ?? undefined}>
        ✕ recusada{reason ? ` — ${reason}` : ''}
      </span>
    );
  return <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">• pendente</span>;
};

/** Selos da conferência automática (v8): ✓/✗/– valor · CNPJ · nome. */
const CheckBadges: React.FC<{ row: NotaFiscalFileRow }> = ({ row }) => {
  if (!row.checkStatus) return null; // nota anterior à feature — sem conferência
  const details = row.checkDetails;
  const reasons = Array.isArray(details?.reasons) ? (details.reasons as string[]).join(' ') : '';
  if (row.checkStatus === 'ilegivel')
    return (
      <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 whitespace-nowrap" title={reasons || 'PDF sem texto (escaneado) — não deu pra conferir automaticamente.'}>
        📄 não legível
      </span>
    );
  if (row.checkStatus === 'pendente')
    return (
      <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 whitespace-nowrap" title="A conferência automática falhou por erro interno — confira manualmente.">
        conferência pendente
      </span>
    );
  // Passou nos 3 checks mas a auto-validação estava desligada: é só apertar Validar.
  const skipped = details?.autoValidateSkipped === true && row.status === 'recebida';
  const item = (label: string, ok: boolean | null) => {
    const cls = ok === true ? 'bg-green-100 text-green-700' : ok === false ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500';
    const mark = ok === true ? '✓' : ok === false ? '✗' : '–';
    return <span className={`text-[11px] px-1.5 py-0.5 rounded-full whitespace-nowrap ${cls}`}>{mark} {label}</span>;
  };
  return (
    <span className="inline-flex items-center gap-1 flex-wrap" title={reasons || 'Conferência automática do envio.'}>
      {item('valor', row.checkValor)}
      {item('CNPJ', row.checkCnpj)}
      {item('nome', row.checkNome)}
      {skipped && (
        <span
          className="text-[11px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 whitespace-nowrap"
          title="Passou nos 3 checks, mas a auto-validação estava desligada — é só validar."
        >
          conferida, aguardando você
        </span>
      )}
    </span>
  );
};

export const NotasRecebidasModal: React.FC<NotasRecebidasModalProps> = ({
  companyId,
  periodId,
  periodLabel,
  userId,
  onClose,
  onChanged,
  publicacoes,
}) => {
  const [files, setFiles] = useState<NotaFiscalFileRow[] | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null); // id do arquivo, ou 'ALL'
  const [acting, setActing] = useState<string | null>(null); // id em validação/recusa/exclusão
  // Com a conferência automática, o que sobra pro olho humano são as não-validadas.
  const [soAtencao, setSoAtencao] = useState(false);
  /** '' todas | 'atrasada' | 'no_prazo' — o filtro de prazo pedido pelo Victor. */
  const [filtroPrazo, setFiltroPrazo] = useState('');
  // Liga/desliga da auto-validação (null = ainda carregando).
  const [autoValidate, setAutoValidate] = useState<boolean | null>(null);
  const [savingAuto, setSavingAuto] = useState(false);

  const reload = async () => {
    try {
      const f = await listNotaFiscalFiles(companyId, periodId);
      setFiles(f);
    } catch {
      setFiles([]);
      toast.error('Não consegui carregar as notas.');
    }
  };

  useEffect(() => {
    let alive = true;
    listNotaFiscalFiles(companyId, periodId)
      .then((f) => { if (alive) setFiles(f); })
      .catch(() => { if (alive) { setFiles([]); toast.error('Não consegui carregar as notas.'); } });
    return () => { alive = false; };
  }, [companyId, periodId]);

  useEffect(() => {
    let alive = true;
    getNfAutoValidate(companyId)
      .then((v) => { if (alive) setAutoValidate(v); })
      .catch(() => { if (alive) setAutoValidate(true); }); // falhou lendo: assume o padrão
    return () => { alive = false; };
  }, [companyId]);

  const handleToggleAuto = async () => {
    if (autoValidate === null || savingAuto) return;
    const next = !autoValidate;
    setSavingAuto(true);
    try {
      await setNfAutoValidate(companyId, next, userId);
      setAutoValidate(next);
      toast.success(next
        ? 'Auto-validação LIGADA: nota com valor, CNPJ e nome certos entra validada sozinha.'
        : 'Auto-validação DESLIGADA: o sistema continua conferindo e recusando nota errada, mas você valida as certas na mão.',
        { duration: 7000 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao mudar a auto-validação.');
    } finally { setSavingAuto(false); }
  };

  // Numera as notas repetidas do mesmo (driver, CNPJ) e pré-calcula o nome do arquivo
  // (numeração SEMPRE sobre a lista completa — o filtro não muda o nome), depois
  // agrupa por driver (todas as notas de um entregador juntas).
  const { groups, allNamed } = useMemo(() => {
    const seen: Record<string, number> = {};
    const named = (files ?? []).map((r) => {
      const key = `${r.driverId}|${r.emitterId}`;
      const idx = seen[key] ?? 0;
      seen[key] = idx + 1;
      return { row: r, filename: notaFiscalFileName(r.driverName, r.emitterLabel, periodLabel, idx, extOf(r)) };
    });
    // Prazo de cada nota: vem do espelho publicado daquele driver + conjunto de plataformas.
    const prazoDe = (r: NotaFiscalFileRow): string | null =>
      (publicacoes ?? []).find(
        (p) => p.driverId === r.driverId && p.platformKey === (r.mirrorPlatformKey ?? ''),
      )?.nfDueAt ?? null;
    const comPrazo = named.map((it) => ({
      ...it,
      prazo: nfPrazoStatus(it.row.uploadedAt, prazoDe(it.row)),
      atraso: nfAtrasoLabel(it.row.uploadedAt, prazoDe(it.row)),
    }));
    let visible = soAtencao ? comPrazo.filter((it) => it.row.status !== 'validada') : comPrazo;
    if (filtroPrazo) visible = visible.filter((it) => it.prazo === filtroPrazo);
    const byDriver = new Map<string, { driverName: string; recebedorNome: string | null; items: typeof comPrazo }>();
    for (const it of visible) {
      const g = byDriver.get(it.row.driverId);
      if (g) g.items.push(it);
      else byDriver.set(it.row.driverId, { driverName: it.row.driverName, recebedorNome: it.row.recebedorNome, items: [it] });
    }
    return {
      groups: [...byDriver.values()].sort((a, b) => a.driverName.localeCompare(b.driverName, 'pt-BR')),
      // O .zip "Baixar todas" baixa TODAS mesmo com o filtro ligado.
      allNamed: named,
    };
  }, [files, periodLabel, soAtencao, filtroPrazo, publicacoes]);

  const handleView = async (row: NotaFiscalFileRow) => {
    try {
      window.open(await notaFiscalFileUrl(row.filePath), '_blank', 'noopener,noreferrer');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não consegui abrir.');
    }
  };

  const handleOne = async (row: NotaFiscalFileRow, filename: string) => {
    setDownloading(row.id);
    try {
      triggerDownload(await fetchBlob(row.filePath), filename);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não consegui baixar.');
    } finally { setDownloading(null); }
  };

  const handleValidate = async (row: NotaFiscalFileRow) => {
    setActing(row.id);
    try {
      await setNotaFiscalStatus(row.id, 'validada', userId);
      await reload();
      onChanged?.();
      toast.success('Nota validada.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao validar.');
    } finally { setActing(null); }
  };

  const handleReject = async (row: NotaFiscalFileRow) => {
    const reason = window.prompt('Motivo da recusa (o driver vê no app). Ex.: "foto cortada, envie de novo":', row.rejectReason ?? '');
    if (reason === null) return; // cancelou
    setActing(row.id);
    try {
      await setNotaFiscalStatus(row.id, 'rejeitada', userId, reason);
      await reload();
      onChanged?.();
      toast.success('Nota recusada — o driver vai poder enviar outra.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao recusar.');
    } finally { setActing(null); }
  };

  const handleDelete = async (row: NotaFiscalFileRow) => {
    if (!window.confirm('Excluir esta nota de vez? O driver precisará enviar uma nova neste CNPJ.')) return;
    setActing(row.id);
    try {
      await deleteNotaFiscalFile(row.id, userId);
      await reload();
      onChanged?.();
      toast.success('Nota excluída.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao excluir.');
    } finally { setActing(null); }
  };

  const handleZip = async () => {
    if (allNamed.length === 0) return;
    setDownloading('ALL');
    try {
      const zip = new JSZip();
      const used: Record<string, number> = {};
      for (const { row, filename } of allNamed) {
        const blob = await fetchBlob(row.filePath);
        let name = filename;
        if (used[name] != null) { const n = used[name] + 1; used[name] = n; name = filename.replace(/(\.[^.]+)$/, ` (${n})$1`); }
        else used[name] = 1;
        zip.file(name, blob);
      }
      const out = await zip.generateAsync({ type: 'blob' });
      const periodClean = (periodLabel || 'quinzena').replace(/[/\\:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
      triggerDownload(out, `Notas - ${periodClean}.zip`);
      toast.success(`${allNamed.length} nota(s) no .zip`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não consegui gerar o .zip.');
    } finally { setDownloading(null); }
  };

  const busy = downloading === 'ALL';
  const total = files?.length ?? 0;

  return (
    <ModalShell
      icon={<FileText className="w-5 h-5" />}
      title="Notas recebidas"
      subtitle={`Valide, recuse ou baixe as notas anexadas — ${periodLabel}`}
      onClose={onClose}
      maxWidth="sm:max-w-2xl"
      footer={
        <>
          <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium min-h-[40px]">
            Fechar
          </button>
          <button
            type="button" onClick={handleZip} disabled={busy || total === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium inline-flex items-center gap-2 min-h-[40px] disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
            Baixar todas (.zip)
          </button>
        </>
      }
    >
      {files === null && <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>}

      {files !== null && total === 0 && (
        <div className="text-center py-12 text-gray-500">
          <FileText size={36} className="mx-auto mb-2 text-gray-300" />
          <p className="font-medium">Nenhuma nota recebida ainda nesta quinzena.</p>
        </div>
      )}

      {files !== null && total > 0 && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <p className="text-xs text-gray-500">
              {total} nota(s). <b className="text-green-700">Validar</b> deixa a NF do driver/grupo verde no painel ·{' '}
              <b className="text-red-700">Recusar</b> pede outra (com motivo) · <b className="text-gray-600">Excluir</b> apaga de vez.
            </p>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={soAtencao}
                onChange={(e) => setSoAtencao(e.target.checked)}
                className="rounded border-gray-300"
              />
              Só as que precisam de atenção
            </label>
            {/* Filtro de PRAZO (04/08/2026): o prazo vem do espelho publicado de cada driver. */}
            <label className="flex items-center gap-1.5 text-xs text-gray-600 whitespace-nowrap">
              Prazo:
              <select
                value={filtroPrazo}
                onChange={(e) => setFiltroPrazo(e.target.value)}
                data-testid="nf-filtro-prazo"
                className="border border-gray-300 rounded-md px-2 py-1 text-xs"
              >
                <option value="">Todas</option>
                <option value="no_prazo">Só no prazo</option>
                <option value="atrasada">Só atrasadas</option>
                <option value="sem_prazo">Sem prazo definido</option>
              </select>
            </label>
          </div>
          {/* Liga/desliga da auto-validação. DESLIGADA, a conferência continua
              inteira (selos + recusa de nota errada) — só a nota certa espera você. */}
          <div className={`rounded-lg border px-3 py-2.5 flex items-start justify-between gap-3 flex-wrap ${
            autoValidate === false ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'
          }`}>
            <div className="text-xs leading-relaxed">
              <div className="font-semibold text-gray-800">
                {autoValidate === false ? '🔒 Auto-validação DESLIGADA' : '⚡ Auto-validação LIGADA'}
              </div>
              <div className="text-gray-600">
                {autoValidate === false
                  ? 'O sistema confere tudo e recusa nota errada normalmente — a nota certa fica aqui esperando você validar.'
                  : 'Nota com valor, CNPJ e nome certos entra validada sozinha. A conferência e a recusa não mudam.'}
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleAuto}
              disabled={autoValidate === null || savingAuto}
              className={`shrink-0 px-3 py-2 rounded-md text-xs font-semibold min-h-[40px] inline-flex items-center gap-1.5 disabled:opacity-50 ${
                autoValidate === false
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {savingAuto && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {autoValidate === false ? 'Ligar auto-validação' : 'Desligar auto-validação'}
            </button>
          </div>

          {soAtencao && groups.length === 0 && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
              ✓ Nenhuma nota precisando de atenção — todas validadas.
            </p>
          )}
          {groups.map((g) => (
            <div key={g.driverName} className="rounded-lg border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-800 border-b border-gray-200 flex items-center gap-2 flex-wrap">
                {g.driverName}
                <span className="text-xs font-normal text-gray-500">{g.items.length} nota(s)</span>
                {/* Recebedor configurado: a NOTA deste driver vem no nome de outra pessoa (confira ao validar). */}
                {g.recebedorNome && (
                  <span
                    className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 whitespace-nowrap"
                    title="Este driver tem recebedor configurado — a nota fiscal vem no nome do recebedor, não no do driver."
                  >
                    nota no nome de: {g.recebedorNome}
                  </span>
                )}
              </div>
              <div className="divide-y divide-gray-100">
                {g.items.map(({ row, filename, prazo, atraso }) => {
                  const isActing = acting === row.id;
                  return (
                    <div key={row.id} className="flex items-center gap-2 p-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-gray-700 truncate">{row.emitterLabel} · {row.emitterCnpj}</span>
                          <StatusBadge status={row.status} reason={row.rejectReason} auto={row.checkDetails?.autoValidated === true} />
                          <CheckBadges row={row} />
                          {/* Prazo do espelho daquele driver (04/08/2026). "sem prazo" = espelho
                              publicado antes da feature — nao da pra cobrar horario que ninguem combinou. */}
                          {prazo === 'atrasada' && (
                            <span
                              className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 whitespace-nowrap"
                              title={`Chegou ${atraso} do prazo combinado no espelho.`}
                              data-testid="nf-atrasada"
                            >
                              ⏰ atrasada — {atraso}
                            </span>
                          )}
                          {prazo === 'no_prazo' && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 whitespace-nowrap">
                              no prazo
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-400 truncate" title={filename}>{filename}</div>
                      </div>
                      <button type="button" onClick={() => handleView(row)} title="Ver a nota" className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        type="button" onClick={() => handleOne(row, filename)} disabled={downloading === row.id}
                        title="Baixar" className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50"
                      >
                        {downloading === row.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      </button>
                      {row.status !== 'validada' && (
                        <button
                          type="button" onClick={() => handleValidate(row)} disabled={isActing}
                          title="Validar (conta pra NF ficar verde)" className="p-2 text-green-600 hover:bg-green-50 rounded-lg disabled:opacity-50"
                        >
                          {isActing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        </button>
                      )}
                      <button
                        type="button" onClick={() => handleReject(row)} disabled={isActing}
                        title="Recusar / pedir outra (com motivo)" className="p-2 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <button
                        type="button" onClick={() => handleDelete(row)} disabled={isActing}
                        title="Excluir a nota de vez" className="p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 rounded-lg disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </ModalShell>
  );
};
