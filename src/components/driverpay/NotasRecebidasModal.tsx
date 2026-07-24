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
  type NotaFiscalFileRow,
} from '../../services/driverPay';
import { notaFiscalFileName } from './driverPayShared';
import { ModalShell } from './ModalShell';

interface NotasRecebidasModalProps {
  companyId: string;
  periodId: string;
  periodLabel: string;
  userId: string;
  onClose: () => void;
  /** Chamado após validar/recusar/excluir — o painel recarrega a coluna NF. */
  onChanged?: () => void;
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
const StatusBadge: React.FC<{ status: string; reason: string | null }> = ({ status, reason }) => {
  if (status === 'validada')
    return <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 whitespace-nowrap">✓ validada</span>;
  if (status === 'rejeitada')
    return (
      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 whitespace-nowrap" title={reason ?? undefined}>
        ✕ recusada{reason ? ` — ${reason}` : ''}
      </span>
    );
  return <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">• pendente</span>;
};

export const NotasRecebidasModal: React.FC<NotasRecebidasModalProps> = ({
  companyId,
  periodId,
  periodLabel,
  userId,
  onClose,
  onChanged,
}) => {
  const [files, setFiles] = useState<NotaFiscalFileRow[] | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null); // id do arquivo, ou 'ALL'
  const [acting, setActing] = useState<string | null>(null); // id em validação/recusa/exclusão

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

  // Numera as notas repetidas do mesmo (driver, CNPJ) e pré-calcula o nome do arquivo,
  // depois agrupa por driver (todas as notas de um entregador juntas).
  const groups = useMemo(() => {
    const seen: Record<string, number> = {};
    const named = (files ?? []).map((r) => {
      const key = `${r.driverId}|${r.emitterId}`;
      const idx = seen[key] ?? 0;
      seen[key] = idx + 1;
      return { row: r, filename: notaFiscalFileName(r.driverName, r.emitterLabel, periodLabel, idx, extOf(r)) };
    });
    const byDriver = new Map<string, { driverName: string; recebedorNome: string | null; items: typeof named }>();
    for (const it of named) {
      const g = byDriver.get(it.row.driverId);
      if (g) g.items.push(it);
      else byDriver.set(it.row.driverId, { driverName: it.row.driverName, recebedorNome: it.row.recebedorNome, items: [it] });
    }
    return [...byDriver.values()].sort((a, b) => a.driverName.localeCompare(b.driverName, 'pt-BR'));
  }, [files, periodLabel]);

  const allNamed = useMemo(() => groups.flatMap((g) => g.items), [groups]);

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
          <p className="text-xs text-gray-500">
            {total} nota(s). <b className="text-green-700">Validar</b> deixa a NF do driver/grupo verde no painel ·{' '}
            <b className="text-red-700">Recusar</b> pede outra (com motivo) · <b className="text-gray-600">Excluir</b> apaga de vez.
          </p>
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
                {g.items.map(({ row, filename }) => {
                  const isActing = acting === row.id;
                  return (
                    <div key={row.id} className="flex items-center gap-2 p-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-gray-700 truncate">{row.emitterLabel} · {row.emitterCnpj}</span>
                          <StatusBadge status={row.status} reason={row.rejectReason} />
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
