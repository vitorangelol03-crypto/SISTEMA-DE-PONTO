/**
 * "Notas recebidas" (Fase 3e): o painel (2626) vê as notas que os entregadores anexaram
 * no período e baixa — uma a uma ou todas num .zip, com o arquivo já nomeado
 * "Driver - CNPJ - Quinzena[ (n)].ext" (pra contabilidade). Bucket privado -> link assinado.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Download, Eye, Loader2, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import JSZip from 'jszip';
import {
  listNotaFiscalFiles,
  notaFiscalFileUrl,
  type NotaFiscalFileRow,
} from '../../services/driverPay';
import { notaFiscalFileName } from './driverPayShared';
import { ModalShell } from './ModalShell';

interface NotasRecebidasModalProps {
  companyId: string;
  periodId: string;
  periodLabel: string;
  onClose: () => void;
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

export const NotasRecebidasModal: React.FC<NotasRecebidasModalProps> = ({ companyId, periodId, periodLabel, onClose }) => {
  const [files, setFiles] = useState<NotaFiscalFileRow[] | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null); // id do arquivo, ou 'ALL'

  useEffect(() => {
    let alive = true;
    listNotaFiscalFiles(companyId, periodId)
      .then((f) => { if (alive) setFiles(f); })
      .catch(() => { if (alive) { setFiles([]); toast.error('Não consegui carregar as notas.'); } });
    return () => { alive = false; };
  }, [companyId, periodId]);

  // Numera as notas repetidas do mesmo (driver, CNPJ) e pré-calcula o nome do arquivo.
  const named = useMemo(() => {
    const seen: Record<string, number> = {};
    return (files ?? []).map((r) => {
      const key = `${r.driverId}|${r.emitterId}`;
      const idx = seen[key] ?? 0;
      seen[key] = idx + 1;
      return { row: r, filename: notaFiscalFileName(r.driverName, r.emitterLabel, periodLabel, idx, extOf(r)) };
    });
  }, [files, periodLabel]);

  const handleOne = async (row: NotaFiscalFileRow, filename: string) => {
    setDownloading(row.id);
    try {
      triggerDownload(await fetchBlob(row.filePath), filename);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não consegui baixar.');
    } finally { setDownloading(null); }
  };

  const handleView = async (row: NotaFiscalFileRow) => {
    try {
      window.open(await notaFiscalFileUrl(row.filePath), '_blank', 'noopener,noreferrer');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não consegui abrir.');
    }
  };

  const handleZip = async () => {
    if (named.length === 0) return;
    setDownloading('ALL');
    try {
      const zip = new JSZip();
      const used: Record<string, number> = {};
      for (const { row, filename } of named) {
        const blob = await fetchBlob(row.filePath);
        // Garante nome único dentro do zip (caso raro de colisão de nome).
        let name = filename;
        if (used[name] != null) { const n = used[name] + 1; used[name] = n; name = filename.replace(/(\.[^.]+)$/, ` (${n})$1`); }
        else used[name] = 1;
        zip.file(name, blob);
      }
      const out = await zip.generateAsync({ type: 'blob' });
      const periodClean = (periodLabel || 'quinzena').replace(/[/\\:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
      triggerDownload(out, `Notas - ${periodClean}.zip`);
      toast.success(`${named.length} nota(s) no .zip`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não consegui gerar o .zip.');
    } finally { setDownloading(null); }
  };

  const busy = downloading === 'ALL';

  return (
    <ModalShell
      icon={<FileText className="w-5 h-5" />}
      title="Notas recebidas"
      subtitle={`Notas que os entregadores anexaram — ${periodLabel}`}
      onClose={onClose}
      maxWidth="sm:max-w-2xl"
      footer={
        <>
          <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium min-h-[40px]">
            Fechar
          </button>
          <button
            type="button" onClick={handleZip} disabled={busy || !files || files.length === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium inline-flex items-center gap-2 min-h-[40px] disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
            Baixar todas (.zip)
          </button>
        </>
      }
    >
      {files === null && <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>}

      {files !== null && files.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <FileText size={36} className="mx-auto mb-2 text-gray-300" />
          <p className="font-medium">Nenhuma nota recebida ainda nesta quinzena.</p>
        </div>
      )}

      {files !== null && files.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">{files.length} nota(s) recebida(s).</p>
          {named.map(({ row, filename }) => (
            <div key={row.id} className="flex items-center gap-2 rounded-lg border border-gray-200 p-2.5">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-800 text-sm truncate">{row.driverName}</div>
                <div className="text-xs text-gray-500 truncate">{row.emitterLabel} · {row.emitterCnpj}</div>
                <div className="text-[11px] text-gray-400 truncate" title={filename}>{filename}</div>
              </div>
              <button type="button" onClick={() => handleView(row)} title="Ver" className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
                <Eye className="w-4 h-4" />
              </button>
              <button
                type="button" onClick={() => handleOne(row, filename)} disabled={downloading === row.id}
                title="Baixar" className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50"
              >
                {downloading === row.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </ModalShell>
  );
};
