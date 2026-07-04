import React, { useEffect, useState } from 'react';
import { Search, Tag, CheckCircle2, Clock, Loader2, Play } from 'lucide-react';
import toast from 'react-hot-toast';
import { searchDiscounts, discountProofUrl, type DiscountSearchRow } from '../../services/driverPay';
import { ModalShell } from './ModalShell';
import { ImageLightbox } from './ImageLightbox';
import { DiscountStatusPill } from './DiscountModal';
import { formatBRL } from './driverPayShared';

interface DiscountSearchModalProps {
  companyId: string;
  onClose: () => void;
}

/** Data ISO -> "DD/MM/AAAA" no fuso de São Paulo. */
const fmtDate = (iso: string | null): string => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  } catch {
    return '—';
  }
};

export const DiscountSearchModal: React.FC<DiscountSearchModalProps> = ({ companyId, onClose }) => {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<DiscountSearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // Busca com debounce (sem código = descontos mais recentes).
  useEffect(() => {
    let active = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await searchDiscounts(companyId, query);
        if (active) setRows(res);
      } catch (e) {
        console.error('Erro ao buscar descontos:', e);
        if (active) toast.error('Erro ao buscar descontos');
      } finally {
        if (active) setLoading(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [companyId, query]);

  return (
    <ModalShell
      icon={<Search className="w-5 h-5" />}
      title="Pacotes descontados"
      subtitle="Busque pelo código do pacote e veja se já foi descontado"
      onClose={onClose}
      maxWidth="sm:max-w-2xl"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium min-h-[40px]"
        >
          Fechar
        </button>
      }
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Digite o código do pacote (ex.: 741412525252)"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]"
          />
        </div>

        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            {loading ? 'Buscando…' : `${rows.length} resultado(s)`}
            {!query && !loading ? ' · mais recentes' : ''}
          </span>
          <span className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-amber-600" /> pendente</span>
            <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> descontado</span>
          </span>
        </div>

        <div className="max-h-[52vh] overflow-y-auto space-y-2 pr-0.5">
          {loading && rows.length === 0 ? (
            <div className="flex justify-center py-10 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-10">
              {query ? 'Nenhum pacote descontado com esse código.' : 'Nenhum desconto lançado ainda.'}
            </p>
          ) : (
            rows.map((r) => {
              const proofs = [r.proof1_path, r.proof2_path].filter((p): p is string => !!p);
              const videoPath = r.proof_video_path;
              const done = r.period_status === 'concluido';
              return (
                <div key={r.id} className="border border-gray-200 rounded-md p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 break-words flex items-center gap-2 flex-wrap">
                      <span>
                        {r.driver_name} <span className="text-red-600">· − {formatBRL(r.amount)}</span>
                      </span>
                      {r.package_status && <DiscountStatusPill status={r.package_status} />}
                    </div>
                    <div className="text-xs text-gray-600 flex items-center gap-1 mt-0.5 break-words">
                      <Tag className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      {r.package_code ? `Pacote ${r.package_code}` : 'Sem código de pacote'}
                      {r.observation ? ` · ${r.observation}` : ''}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      Lançado em {fmtDate(r.created_at)} · {r.period_label}
                    </div>
                    <div className="mt-1.5">
                      {done ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Descontado em {fmtDate(r.concluded_at)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                          <Clock className="w-3.5 h-3.5" /> Pendente · a descontar (período aberto)
                        </span>
                      )}
                    </div>
                  </div>
                  {(proofs.length > 0 || videoPath) && (
                    <div className="flex gap-1.5 flex-shrink-0">
                      {proofs.map((p, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setLightbox(discountProofUrl(p))}
                          title="Ver prova (sem baixar)"
                          className="block w-12 h-12 rounded border border-gray-200 overflow-hidden hover:ring-2 hover:ring-blue-400"
                        >
                          <img src={discountProofUrl(p)} alt="prova" className="w-full h-full object-cover" />
                        </button>
                      ))}
                      {videoPath && (
                        <button
                          type="button"
                          onClick={() => setLightbox(discountProofUrl(videoPath))}
                          title="Ver vídeo (sem baixar)"
                          className="flex items-center justify-center w-12 h-12 rounded border border-gray-200 bg-gray-900 text-white hover:ring-2 hover:ring-blue-400"
                        >
                          <Play className="w-5 h-5 fill-current" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
      <ImageLightbox url={lightbox} onClose={() => setLightbox(null)} />
    </ModalShell>
  );
};
