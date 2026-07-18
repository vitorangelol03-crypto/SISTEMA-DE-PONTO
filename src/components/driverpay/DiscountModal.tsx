import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Trash2, Plus, ImagePlus, X, AlertTriangle, Play, Video, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import { addDiscount, updateDiscount, removeDiscount, discountProofUrl } from '../../services/driverPay';
import { ModalShell } from './ModalShell';
import { ImageLightbox } from './ImageLightbox';
import { DriverRowData, formatBRL } from './driverPayShared';

interface DiscountModalProps {
  row: DriverRowData;
  companyId: string;
  userId: string;
  readOnly: boolean;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}

const parseAmount = (raw: string): number => {
  const normalized = raw.replace(/[^\d,.-]/g, '').replace(',', '.');
  const value = parseFloat(normalized);
  return Number.isFinite(value) ? value : 0;
};

const MAX_IMG = 5 * 1024 * 1024; // 5 MB por imagem
const MAX_VIDEO = 50 * 1024 * 1024; // 50 MB por vídeo

/** Selo da marca do pacote: PNR (roxo) / LOST (laranja). */
export const DiscountStatusPill: React.FC<{ status: 'PNR' | 'LOST' }> = ({ status }) => (
  <span
    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
      status === 'PNR' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'
    }`}
  >
    {status}
  </span>
);

export const DiscountModal: React.FC<DiscountModalProps> = ({
  row,
  companyId,
  userId,
  readOnly,
  onClose,
  onChanged,
}) => {
  const [amount, setAmount] = useState('');
  const [packageCode, setPackageCode] = useState('');
  const [observation, setObservation] = useState('');
  const [images, setImages] = useState<Blob[]>([]);
  const [video, setVideo] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [packageStatus, setPackageStatus] = useState<'PNR' | 'LOST' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  const total = row.discounts.reduce((s, d) => s + d.amount, 0);

  // Previews das novas imagens; revoga as URLs anteriores quando muda/desmonta.
  const previews = useMemo(() => images.map((b) => URL.createObjectURL(b)), [images]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  // Preview do vídeo novo; revoga a URL anterior quando muda/desmonta (igual às imagens).
  const videoPreview = useMemo(() => (video ? URL.createObjectURL(video) : null), [video]);
  useEffect(() => {
    if (!videoPreview) return;
    return () => URL.revokeObjectURL(videoPreview);
  }, [videoPreview]);

  const addImages = (files: (File | Blob)[]) => {
    const valid: Blob[] = [];
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      if (f.size > MAX_IMG) {
        toast.error('Imagem acima de 5 MB');
        continue;
      }
      valid.push(f);
    }
    if (valid.length === 0) return;
    setImages((prev) => {
      if (prev.length >= 2) {
        toast('Máximo de 2 fotos por desconto', { icon: '⚠️' });
        return prev;
      }
      return [...prev, ...valid].slice(0, 2);
    });
  };

  // Colar imagem com Ctrl+V em qualquer lugar do modal (só quando editável).
  useEffect(() => {
    if (readOnly) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const blobs: Blob[] = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) blobs.push(f);
        }
      }
      if (blobs.length > 0) {
        e.preventDefault();
        addImages(blobs);
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [readOnly]);

  const removeImage = (idx: number) => setImages((prev) => prev.filter((_, i) => i !== idx));

  // Vídeo de prova (complementar, opcional): 1 arquivo, até 50 MB.
  const addVideo = (file: File | Blob) => {
    if (!file.type.startsWith('video/')) {
      toast.error('Selecione um arquivo de vídeo');
      return;
    }
    if (file.size > MAX_VIDEO) {
      toast.error('Vídeo acima de 50 MB');
      return;
    }
    setVideo(file);
  };

  const removeVideo = () => setVideo(null);

  const resetForm = () => {
    setAmount('');
    setPackageCode('');
    setObservation('');
    setPackageStatus(null);
    setImages([]);
    setVideo(null);
    setEditingId(null);
  };

  const startEdit = (d: (typeof row.discounts)[number]) => {
    setEditingId(d.id);
    setAmount(String(d.amount).replace('.', ','));
    setPackageCode(d.package_code ?? '');
    setObservation(d.observation ?? '');
    setPackageStatus(d.package_status ?? null);
    setImages([]);
    setVideo(null);
  };

  const handleAdd = async () => {
    const value = parseAmount(amount);
    if (value <= 0) {
      toast.error('Informe um valor de desconto maior que zero');
      return;
    }
    setBusy(true);
    try {
      if (editingId) {
        await updateDiscount(editingId, companyId, row.paymentId, userId, {
          amount: value,
          packageCode: packageCode.trim() || null,
          observation: observation.trim() || null,
          packageStatus,
        });
        toast.success('Desconto atualizado');
      } else {
        await addDiscount(
          companyId,
          row.paymentId,
          value,
          packageCode.trim() || null,
          observation.trim() || null,
          userId,
          packageStatus,
          images,
          video,
        );
        toast.success('Desconto lançado');
      }
      resetForm();
      await onChanged();
    } catch (e) {
      console.error('Erro ao salvar desconto:', e);
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar desconto');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (id: string) => {
    setBusy(true);
    try {
      await removeDiscount(id, row.paymentId, userId);
      toast.success('Desconto removido');
      await onChanged();
    } catch (e) {
      console.error('Erro ao remover desconto:', e);
      toast.error(e instanceof Error ? e.message : 'Erro ao remover desconto');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      icon={<Minus className="w-5 h-5" />}
      title="Descontos"
      subtitle={row.name}
      onClose={onClose}
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
      <div className="space-y-4">
        {row.discounts.length > 0 ? (
          <div className="border border-gray-200 rounded-md divide-y divide-gray-100">
            {row.discounts.map((d) => {
              const proofs = [d.proof1_path, d.proof2_path].filter((p): p is string => !!p);
              const videoPath = d.proof_video_path;
              return (
                <div key={d.id} className="px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-red-600 flex items-center gap-2">
                        − {formatBRL(d.amount)}
                        {d.package_status && <DiscountStatusPill status={d.package_status} />}
                      </div>
                      <div className="text-xs text-gray-500 break-words">
                        {d.package_code ? `Pacote ${d.package_code}` : 'Sem ID de pacote'}
                        {d.observation ? ` · ${d.observation}` : ''}
                      </div>
                    </div>
                    {!readOnly && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => startEdit(d)}
                          disabled={busy}
                          className="text-blue-600 hover:text-blue-800 disabled:opacity-40"
                          title="Editar desconto"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemove(d.id)}
                          disabled={busy}
                          className="text-red-600 hover:text-red-800 disabled:opacity-40"
                          title="Remover desconto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  {(proofs.length > 0 || videoPath) && (
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {proofs.map((p, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setLightbox(discountProofUrl(p))}
                          title="Ver prova (sem baixar)"
                          className="block w-14 h-14 rounded border border-gray-200 overflow-hidden hover:ring-2 hover:ring-blue-400"
                        >
                          <img src={discountProofUrl(p)} alt="prova" className="w-full h-full object-cover" />
                        </button>
                      ))}
                      {videoPath && (
                        <button
                          type="button"
                          onClick={() => setLightbox(discountProofUrl(videoPath))}
                          title="Ver vídeo (sem baixar)"
                          className="inline-flex items-center gap-1 h-14 px-3 rounded border border-gray-200 text-xs font-medium text-gray-700 hover:ring-2 hover:ring-blue-400"
                        >
                          <Play className="w-4 h-4" /> Vídeo
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50">
              <span className="text-xs font-medium text-gray-500">Total de descontos</span>
              <span className="text-sm font-bold text-red-600">− {formatBRL(total)}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Nenhum desconto lançado.</p>
        )}

        {!readOnly && (
          <div className="border-t border-gray-200 pt-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Valor (R$)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0,00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">ID do pacote (opcional)</label>
                <input
                  type="text"
                  value={packageCode}
                  onChange={(e) => setPackageCode(e.target.value)}
                  placeholder="Ex.: 741412525252"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Observação (opcional)</label>
              <input
                type="text"
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
                placeholder="Motivo do desconto"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]"
              />
            </div>

            {/* Marca do pacote: PNR / LOST (toggle, opcional) */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Marca do pacote (opcional)</label>
              <div className="flex gap-2">
                {(['PNR', 'LOST'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setPackageStatus((cur) => (cur === s ? null : s))}
                    className={`px-5 py-2 rounded-md text-sm font-bold border min-h-[40px] ${
                      packageStatus === s
                        ? s === 'PNR'
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-orange-600 text-white border-orange-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Fotos de prova (até 2) — arquivo ou Ctrl+V */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Fotos de prova (até 2) — opcional</label>
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  Tire uma <b>foto nítida e legível</b> — o código do pacote e o valor precisam aparecer. Você pode{' '}
                  <b>colar com Ctrl+V</b>.
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {previews.map((url, i) => (
                  <div key={i} className="relative w-20 h-20 rounded-md border border-gray-200 overflow-hidden">
                    <img
                      src={url}
                      alt={`prova ${i + 1}`}
                      onClick={() => setLightbox(url)}
                      className="w-full h-full object-cover cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      title="Remover foto"
                      className="absolute top-0.5 right-0.5 bg-white/90 rounded-full text-red-600 hover:text-red-800 p-0.5 leading-none"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {images.length < 2 && (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="w-20 h-20 rounded-md border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-blue-400 hover:text-blue-500"
                  >
                    <ImagePlus className="w-5 h-5" />
                    <span className="text-[10px]">Adicionar</span>
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const fs = Array.from(e.target.files ?? []);
                    if (fs.length) addImages(fs);
                    if (fileRef.current) fileRef.current.value = '';
                  }}
                />
              </div>
            </div>

            {/* Vídeo de prova (opcional) — filmagem da câmera */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Vídeo de prova (opcional)</label>
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Vídeo curto e leve (máx. 50 MB) — filmagem da câmera, se precisar.</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {videoPreview ? (
                  <div className="relative w-28 h-20 rounded-md border border-gray-200 overflow-hidden">
                    <video src={videoPreview} muted controls className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={removeVideo}
                      title="Remover vídeo"
                      className="absolute top-0.5 right-0.5 bg-white/90 rounded-full text-red-600 hover:text-red-800 p-0.5 leading-none"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => videoRef.current?.click()}
                    className="w-28 h-20 rounded-md border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-blue-400 hover:text-blue-500"
                  >
                    <Video className="w-5 h-5" />
                    <span className="text-[10px]">Adicionar vídeo</span>
                  </button>
                )}
                <input
                  ref={videoRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) addVideo(f);
                    if (videoRef.current) videoRef.current.value = '';
                  }}
                />
              </div>
            </div>

            {editingId && (
              <p className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-md px-3 py-2">
                Editando um desconto lançado — as fotos/vídeo não mudam aqui (remova e lance de novo se precisar trocar as provas).
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleAdd}
                disabled={busy}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm font-medium inline-flex items-center justify-center gap-2 min-h-[40px] disabled:opacity-50"
              >
                <Plus className="w-4 h-4" /> {editingId ? 'Salvar edição' : 'Lançar desconto'}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={busy}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium min-h-[40px]"
                >
                  Cancelar edição
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      <ImageLightbox url={lightbox} onClose={() => setLightbox(null)} />
    </ModalShell>
  );
};
