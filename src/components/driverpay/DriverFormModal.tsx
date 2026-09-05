import React, { useEffect, useRef, useState } from 'react';
import { Truck, KeyRound, Loader2, Archive, ArchiveRestore } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Driver,
  DriverPlatform,
  createDriverWithRates,
  updateDriver,
  upsertDriverRate,
  getDriverRates,
  resetDriverPassword,
  setDriverActive,
  listDriverNotaNames,
  addDriverNotaName,
  removeDriverNotaName,
  type DriverNotaName,
} from '../../services/driverPay';
import { ModalShell } from './ModalShell';

/** Uma taxa (por plataforma) que MUDOU no cadastro do driver: valor antigo -> novo. */
export interface DriverRateChange {
  platformName: string;
  oldRate: number;
  newRate: number;
}

interface DriverFormModalProps {
  mode: 'create' | 'edit';
  driver: Driver | null;
  platforms: DriverPlatform[];
  companyId: string;
  userId: string;
  hasPermission: (permission: string) => boolean;
  onClose: () => void;
  /**
   * Chamado apos persistir. Recebe o id do driver e as taxas por plataforma que
   * REALMENTE mudaram (lista vazia quando nenhuma taxa mudou — ex.: editou so
   * PIX/telefone). Permite reaplicar a taxa aos pacotes do periodo aberto sem
   * atropelar os overrides por rota.
   */
  onSaved: (driverId: string, rateChanges: DriverRateChange[]) => void | Promise<void>;
  /**
   * Chamado depois de arquivar/reativar (01/09/2026). Separado de `onSaved` de
   * propósito: `onSaved`/`handleDriverSaved` reaplica taxa e pode abrir um
   * confirm de "valor divergente da config" — ruído completamente fora de
   * contexto pra uma ação de arquivar. Aqui só precisa recarregar a lista.
   */
  onArchived: () => void | Promise<void>;
}

const parseRate = (raw: string): number => {
  const normalized = raw.replace(/[^\d,.-]/g, '').replace(',', '.');
  const value = parseFloat(normalized);
  return Number.isFinite(value) ? value : 0;
};

export const DriverFormModal: React.FC<DriverFormModalProps> = ({
  mode,
  driver,
  platforms,
  companyId,
  userId,
  hasPermission,
  onClose,
  onSaved,
  onArchived,
}) => {
  const [name, setName] = useState(driver?.name ?? '');
  const [route, setRoute] = useState(driver?.route ?? '');
  const [pix, setPix] = useState(driver?.pix_key ?? '');
  const [cpf, setCpf] = useState(driver?.cpf ?? '');
  const [phone, setPhone] = useState(driver?.phone ?? '');
  // Recebedor separado (ex.: esposa emite a nota e recebe o PIX) — relatórios saem no nome/PIX dele.
  const [recebedorNome, setRecebedorNome] = useState(driver?.recebedor_nome ?? '');
  const [recebedorPix, setRecebedorPix] = useState(driver?.recebedor_pix ?? '');
  // Nomes autorizados a emitir nota (nota dividida, 19/08/2026) — máx 2, teto no banco.
  const [notaNames, setNotaNames] = useState<DriverNotaName[]>([]);
  const [novoNotaNome, setNovoNotaNome] = useState('');
  const [novoNotaCnpj, setNovoNotaCnpj] = useState('');
  const [salvandoNotaNome, setSalvandoNotaNome] = useState(false);

  useEffect(() => {
    if (mode !== 'edit' || !driver?.id) return;
    listDriverNotaNames(companyId, driver.id)
      .then(setNotaNames)
      .catch((e) => console.error('Erro ao carregar nomes autorizados:', e));
  }, [mode, driver?.id, companyId]);

  const adicionarNotaNome = async () => {
    if (!driver?.id || !novoNotaNome.trim()) return;
    setSalvandoNotaNome(true);
    try {
      await addDriverNotaName(companyId, driver.id, novoNotaNome, novoNotaCnpj || null, userId);
      setNotaNames(await listDriverNotaNames(companyId, driver.id));
      setNovoNotaNome('');
      setNovoNotaCnpj('');
      toast.success('Nome autorizado cadastrado.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao cadastrar o nome');
    } finally {
      setSalvandoNotaNome(false);
    }
  };

  const removerNotaNome = async (id: string) => {
    if (!driver?.id) return;
    try {
      await removeDriverNotaName(companyId, id, userId);
      setNotaNames((prev) => prev.filter((n) => n.id !== id));
      toast.success('Nome removido.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao remover o nome');
    }
  };
  const [rates, setRates] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const pl of platforms) initial[pl.id] = String(pl.default_rate);
    return initial;
  });
  // Taxas por plataforma como estavam AO ABRIR o modal (numero), para detectar no save
  // exatamente o que mudou. Inicia nos defaults; a edicao carrega as taxas reais do driver.
  const originalRatesRef = useRef<Record<string, number>>(
    Object.fromEntries(platforms.map((pl) => [pl.id, pl.default_rate])),
  );
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const canConfigRate = hasPermission('driverpay.configRate');

  // Arquivar (01/09/2026, pedido do Victor): soft-delete — driverpay_drivers.active=false.
  // NÃO apaga nada: histórico de pagamento de quinzenas passadas fica intacto (o grid
  // monta as linhas a partir de driverpay_payments, não da lista de drivers — arquivar
  // só tira o driver de quinzenas NOVAS a partir de agora, via driverpay_create_period
  // que já filtra active=true no preload). Reversível a qualquer momento.
  const handleArchiveToggle = async () => {
    if (!driver) return;
    const willArchive = driver.active;
    const msg = willArchive
      ? `Arquivar ${driver.name}?\n\n` +
        'Ele some das quinzenas novas a partir de agora (não entra mais automaticamente) ' +
        'e some da lista de nomes reconhecidos ao importar planilha. O histórico de ' +
        'pagamentos já feitos continua intacto — nada é apagado. Dá pra reverter depois.'
      : `Reativar ${driver.name}?\n\nEle volta a entrar automaticamente nas quinzenas novas.`;
    if (!window.confirm(msg)) return;
    setArchiving(true);
    try {
      await setDriverActive(driver.id, !willArchive, userId);
      toast.success(willArchive ? 'Driver arquivado' : 'Driver reativado');
      await onArchived();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao arquivar/reativar');
    } finally {
      setArchiving(false);
    }
  };

  // Reset de senha do app: apaga a auth -> volta pro 1234 (troca no próximo acesso) e destrava.
  const handleResetPassword = async () => {
    if (!driver) return;
    if (
      !window.confirm(
        `Resetar a senha do app de ${driver.name}?\n\n` +
          'A senha volta a ser 1234 e o driver cria uma nova no próximo acesso. Também destrava se estiver bloqueado por tentativas.',
      )
    )
      return;
    setResetting(true);
    try {
      const apagadas = await resetDriverPassword(driver.id, userId);
      if (apagadas > 0) {
        toast.success('Senha resetada — o driver entra com 1234 e cria uma nova.');
      } else {
        toast.success('Este driver ainda não tinha acessado o app — nada pra resetar: ele já entra com 1234.');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao resetar a senha');
    } finally {
      setResetting(false);
    }
  };

  // Em edicao, carrega as taxas atuais do driver por plataforma.
  useEffect(() => {
    let cancelled = false;
    if (mode === 'edit' && driver) {
      getDriverRates(driver.id)
        .then((driverRates) => {
          if (cancelled) return;
          setRates((prev) => {
            const next = { ...prev };
            for (const r of driverRates) next[r.platform_id] = String(r.rate);
            return next;
          });
          // Snapshot das taxas originais (numero) para o diff no save.
          const orig = { ...originalRatesRef.current };
          for (const r of driverRates) orig[r.platform_id] = Number(r.rate);
          originalRatesRef.current = orig;
        })
        .catch((e) => {
          console.error('Erro ao carregar taxas do driver:', e);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [mode, driver]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Nome do driver é obrigatório');
      return;
    }
    setSaving(true);
    try {
      let driverId: string;
      const payload = {
        name: name.trim(),
        route: route.trim() || null,
        pix_key: pix.trim() || null,
        cpf: cpf.trim() || null,
        phone: phone.trim() || null,
        recebedor_nome: recebedorNome.trim() || null,
        recebedor_pix: recebedorPix.trim() || null,
      };

      // 05/08/2026 — CADASTRO É TUDO OU NADA. Antes o entregador era gravado e as taxas
      // vinham depois; falhando as taxas, ficava um cadastro pela metade e cada nova
      // tentativa criava outro (o Othon virou 3). Agora o serviço desfaz sozinho.
      if (mode === 'create') {
        const taxas = canConfigRate
          ? platforms.map((pl) => ({ platformId: pl.id, rate: parseRate(rates[pl.id] ?? String(pl.default_rate)) }))
          : [];
        const { driver: created, fantasmas } = await createDriverWithRates(companyId, userId, payload, taxas);
        driverId = created.id;
        if (fantasmas > 0) {
          toast(
            `${fantasmas} plataforma(s) da tela já não existem no sistema e foram ignoradas. ` +
            'Atualize a página (F5) para ver a lista certa.',
            { duration: 10000, icon: '⚠️' },
          );
        }
      } else if (driver) {
        await updateDriver(driver.id, userId, payload);
        driverId = driver.id;
      } else {
        setSaving(false);
        return;
      }

      const rateChanges: DriverRateChange[] = [];
      if (canConfigRate) {
        for (const pl of platforms) {
          const rate = parseRate(rates[pl.id] ?? String(pl.default_rate));
          // No cadastro as taxas já foram gravadas junto (tudo ou nada); aqui só a edição.
          if (rate > 0 && mode !== 'create') await upsertDriverRate(companyId, driverId, pl.id, rate, userId);
          // So marca como mudanca quando a taxa DE FATO mudou (compara em centavos,
          // robusto a float). Alimenta a reaplicacao seletiva no periodo aberto.
          const oldRate = originalRatesRef.current[pl.id] ?? pl.default_rate;
          if (rate > 0 && Math.round(rate * 100) !== Math.round(Number(oldRate) * 100)) {
            rateChanges.push({ platformName: pl.name, oldRate: Number(oldRate), newRate: rate });
          }
        }
      }

      toast.success(mode === 'create' ? 'Driver cadastrado' : 'Driver atualizado');
      await onSaved(driverId, rateChanges);
      onClose();
    } catch (e) {
      console.error('Erro ao salvar driver:', e);
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar driver');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      icon={<Truck className="w-5 h-5" />}
      title={mode === 'create' ? 'Novo driver' : 'Editar driver'}
      subtitle={
        mode === 'create'
          ? 'Cadastrar entregador'
          : driver && !driver.active
            ? `${name} · 🗄️ Arquivado`
            : name
      }
      onClose={onClose}
      footer={
        <>
          {mode === 'edit' && driver && (
            <div className="mr-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleResetPassword}
                disabled={resetting || saving || archiving}
                title="Volta a senha do app pro 1234 (o driver cria uma nova no próximo acesso)"
                className="px-4 py-2 border border-red-300 text-red-700 rounded-md hover:bg-red-50 text-sm font-medium min-h-[40px] inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                Resetar senha
              </button>
              <button
                type="button"
                onClick={handleArchiveToggle}
                disabled={resetting || saving || archiving}
                title={driver.active ? 'Some das quinzenas novas — histórico fica intacto, reversível' : 'Volta a entrar nas quinzenas novas'}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium min-h-[40px] inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {archiving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : driver.active ? (
                  <Archive className="w-4 h-4" />
                ) : (
                  <ArchiveRestore className="w-4 h-4" />
                )}
                {driver.active ? 'Arquivar' : 'Reativar'}
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium min-h-[40px]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium min-h-[40px] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Salvando…' : mode === 'create' ? 'Cadastrar driver' : 'Salvar alterações'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Nome</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome completo do driver"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Rota / cidade</label>
            <input
              type="text"
              value={route}
              onChange={(e) => setRoute(e.target.value)}
              placeholder="Ex.: Caratinga"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Chave PIX (opcional)</label>
            <input
              type="text"
              value={pix}
              onChange={(e) => setPix(e.target.value)}
              placeholder="CPF, e-mail, telefone…"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">CPF (opcional)</label>
            <input
              type="text"
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              placeholder="Opcional"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Telefone (opcional)</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Opcional"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]"
            />
          </div>
        </div>

        <div className="border border-amber-200 bg-amber-50 rounded-md p-3 space-y-3">
          <div>
            <p className="text-sm font-medium text-gray-700">Recebedor diferente (opcional)</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Preencha só se OUTRA pessoa recebe por este driver (ex.: a esposa emite a nota e o PIX é dela).
              Os relatórios saem no nome e PIX do recebedor; o espelho continua no nome do driver.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Nome do recebedor</label>
              <input
                type="text"
                value={recebedorNome}
                onChange={(e) => setRecebedorNome(e.target.value)}
                placeholder="Ex.: nome de quem emite a nota"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Chave PIX do recebedor</label>
              <input
                type="text"
                value={recebedorPix}
                onChange={(e) => setRecebedorPix(e.target.value)}
                placeholder="CPF, CNPJ, e-mail, telefone…"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]"
              />
            </div>
          </div>
        </div>

        {/* ── Nomes autorizados a emitir nota (nota dividida, 19/08/2026) ──
            Só na edição: o driver precisa existir pra pendurar os nomes. */}
        {mode === 'edit' && driver?.id && (
          <div className="border border-blue-200 bg-blue-50 rounded-md p-3 space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-700">Nomes autorizados a emitir nota (máx. 2)</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Serve pra duas coisas: o robô passa a aceitar nota emitida nestes nomes (além do driver e do
                recebedor) e, com pelo menos um nome aqui, o app deste driver mostra o botão
                <b> “Preciso dividir em 2 notas”</b>. Sem nome nenhum, ele só consegue mandar nota única.
                A divisão é entre os <b>2 CNPJs</b> (metade/metade ou 70%/30%), com 10 minutos entre a 1ª e a 2ª.
              </p>
            </div>
            {notaNames.length > 0 && (
              <div className="space-y-1.5">
                {notaNames.map((n) => (
                  <div key={n.id} className="flex items-center justify-between gap-2 bg-white border border-gray-200 rounded-md px-3 py-2">
                    <div className="min-w-0 text-sm text-gray-800">
                      <span className="font-medium">{n.name}</span>
                      {n.cnpj && <span className="text-xs text-gray-500"> · CNPJ {n.cnpj}</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => removerNotaNome(n.id)}
                      className="shrink-0 text-xs text-red-600 hover:text-red-800 underline"
                    >
                      remover
                    </button>
                  </div>
                ))}
              </div>
            )}
            {notaNames.length < 2 && (
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px_auto] gap-2">
                <input
                  type="text"
                  value={novoNotaNome}
                  onChange={(e) => setNovoNotaNome(e.target.value)}
                  placeholder="Nome EXATO como sai na nota"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]"
                />
                <input
                  type="text"
                  value={novoNotaCnpj}
                  onChange={(e) => setNovoNotaCnpj(e.target.value)}
                  placeholder="CNPJ (opcional)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]"
                />
                <button
                  type="button"
                  onClick={adicionarNotaNome}
                  disabled={salvandoNotaNome || !novoNotaNome.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 min-h-[40px]"
                >
                  {salvandoNotaNome ? 'Salvando…' : 'Adicionar'}
                </button>
              </div>
            )}
          </div>
        )}

        {platforms.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Valor por pacote (por plataforma)</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {platforms.map((pl) => (
                <div key={pl.id} className="flex flex-col gap-1">
                  <span className="text-xs text-gray-500">{pl.name}</span>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">R$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      disabled={!canConfigRate}
                      value={rates[pl.id] ?? ''}
                      onChange={(e) => setRates((prev) => ({ ...prev, [pl.id]: e.target.value }))}
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px] disabled:bg-gray-50 disabled:text-gray-500"
                    />
                  </div>
                </div>
              ))}
            </div>
            {!canConfigRate && (
              <p className="text-xs text-amber-600">Você não tem permissão para configurar o valor por pacote.</p>
            )}
          </div>
        )}
      </div>
    </ModalShell>
  );
};
