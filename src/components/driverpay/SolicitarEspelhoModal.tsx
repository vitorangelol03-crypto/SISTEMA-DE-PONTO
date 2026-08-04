/**
 * "Solicitar espelho": abre a torneira que faz o portal do entregador pedir o
 * PRINT DA TELA DO APP (aba "Encerrado" + período selecionado) desta quinzena.
 *
 * Por que existe (pedido do Victor, 04/08): a planilha da Shopee pode vir com a
 * quantidade de pacotes errada por driver. O print é a prova do lado do driver, e
 * o sistema compara os dois e marca o "Espelho conferido" sozinho quando batem.
 *
 * ⚠️ As DATAS da quinzena são obrigatórias aqui. A conferência compara o período
 * do print com elas — sem datas (ou com datas erradas) o print CERTO do driver
 * seria recusado. Em 04/08 as duas quinzenas de produção estavam justamente com
 * o mês do fim adiantado, então este campo não é burocracia.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Loader2, AlertTriangle, Users, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  listProofRequests,
  requestProof,
  cancelProofRequest,
  updatePeriod,
} from '../../services/driverPay';
import { expectedProofPlatforms, type DriverRowData } from './driverPayShared';
import { ModalShell } from './ModalShell';

interface SolicitarEspelhoModalProps {
  companyId: string;
  periodId: string;
  periodLabel: string;
  /** Datas atuais da quinzena (podem vir vazias — o modal exige preencher). */
  periodStart: string | null;
  periodEnd: string | null;
  /** Linhas da grade, pra contar quem vai ser cobrado. */
  rows: DriverRowData[];
  /** Plataformas da empresa que podem ser cobradas. */
  platformNames: string[];
  userId: string;
  onClose: () => void;
  /** Chamado depois de gravar, pra grade recarregar. */
  onChanged: () => void;
}

/** Só a Shopee vem marcada por padrão — foi a decisão do Victor em 04/08. */
const PADRAO = 'SHOPEE';

export const SolicitarEspelhoModal: React.FC<SolicitarEspelhoModalProps> = ({
  companyId, periodId, periodLabel, periodStart, periodEnd,
  rows, platformNames, userId, onClose, onChanged,
}) => {
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [jaSolicitadas, setJaSolicitadas] = useState<string[]>([]);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [inicio, setInicio] = useState(periodStart ?? '');
  const [fim, setFim] = useState(periodEnd ?? '');

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const atuais = await listProofRequests(companyId, periodId);
        if (!vivo) return;
        setJaSolicitadas(atuais);
        setMarcadas(new Set(atuais.length ? atuais : platformNames.includes(PADRAO) ? [PADRAO] : []));
      } catch {
        if (vivo) toast.error('Nao consegui carregar o que ja foi solicitado.');
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [companyId, periodId, platformNames]);

  /** Quem vai ser cobrado, com as plataformas marcadas agora. */
  const previa = useMemo(() => {
    const escolhidas = [...marcadas];
    const cobrados = rows.filter((r) => expectedProofPlatforms(r, escolhidas).length > 0);
    const prints = cobrados.reduce((s, r) => s + expectedProofPlatforms(r, escolhidas).length, 0);
    const emGrupo = cobrados.filter((r) => r.groupName);
    const grupos = new Set(emGrupo.map((r) => r.groupName as string));
    return {
      drivers: cobrados.length,
      prints,
      emGrupo: emGrupo.length,
      grupos: grupos.size,
      avulsos: cobrados.length - emGrupo.length,
    };
  }, [rows, marcadas]);

  const datasOk = Boolean(inicio && fim && inicio <= fim);
  const duracao = datasOk
    ? Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 86_400_000)
    : null;
  /** Quinzena tem ~14 dias. Fora disso é quase certo erro de digitação. */
  const duracaoEstranha = duracao !== null && (duracao < 6 || duracao > 20);

  const toggle = (nome: string) => {
    setMarcadas((prev) => {
      const novo = new Set(prev);
      if (novo.has(nome)) novo.delete(nome); else novo.add(nome);
      return novo;
    });
  };

  const handleSalvar = async () => {
    if (!datasOk) { toast.error('Preencha as datas da quinzena.'); return; }
    setSalvando(true);
    try {
      // 1. Grava as datas na quinzena (é contra elas que o print é conferido).
      if (inicio !== periodStart || fim !== periodEnd) {
        await updatePeriod(periodId, companyId, userId, { start: inicio, end: fim });
      }
      // 2. Abre/fecha a torneira de cada plataforma.
      const escolhidas = [...marcadas];
      for (const nome of escolhidas) {
        if (!jaSolicitadas.includes(nome)) await requestProof(companyId, periodId, nome, userId);
      }
      for (const nome of jaSolicitadas) {
        if (!marcadas.has(nome)) await cancelProofRequest(companyId, periodId, nome, userId);
      }
      toast.success(
        escolhidas.length
          ? `Espelho solicitado. ${previa.drivers} entregador(es) vao ver o pedido no portal.`
          : 'Solicitacao cancelada. O portal parou de pedir print.',
      );
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Nao consegui salvar a solicitacao.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalShell
      icon={<ClipboardList className="w-5 h-5" />}
      title="Solicitar espelho do app"
      subtitle={periodLabel}
      onClose={onClose}
      maxWidth="sm:max-w-xl"
      footer={
        <>
          <button
            type="button" onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium min-h-[40px]"
          >
            Cancelar
          </button>
          <button
            type="button" onClick={handleSalvar} disabled={salvando || carregando || !datasOk}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm font-medium min-h-[40px] flex items-center gap-2"
          >
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {marcadas.size ? 'Solicitar espelho' : 'Parar de pedir'}
          </button>
        </>
      }
    >
      {carregando ? (
        <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-gray-600">
            Os entregadores vao ver no portal um pedido pra anexar o <strong>print da tela do app</strong>
            {' '}(a aba <strong>Encerrado</strong>, com o periodo selecionado). O sistema le o print,
            compara com a planilha e marca o <strong>Espelho conferido</strong> sozinho quando bate.
          </p>

          {/* ── Datas: a base da conferencia ───────────────────────────── */}
          <div>
            <p className="text-sm font-medium text-gray-800 mb-2">Periodo desta quinzena</p>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date" value={inicio} onChange={(e) => setInicio(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm min-h-[40px]"
              />
              <span className="text-gray-400 text-sm">ate</span>
              <input
                type="date" value={fim} onChange={(e) => setFim(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm min-h-[40px]"
              />
              {duracao !== null && (
                <span className={`text-xs ${duracaoEstranha ? 'text-amber-700 font-medium' : 'text-gray-500'}`}>
                  {duracao} dias
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1.5">
              O print traz a data que o entregador selecionou no app. Se nao for exatamente este periodo,
              o print e <strong>recusado na hora</strong> e ele reenvia — por isso as datas precisam estar certas.
            </p>
            {!datasOk && (inicio || fim) && (
              <p className="text-xs text-red-600 mt-1">A data de inicio tem que vir antes da data de fim.</p>
            )}
            {duracaoEstranha && (
              <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  Uma quinzena costuma ter 14 dias, e esta ficou com <strong>{duracao}</strong>. Confira o mes
                  das duas datas antes de continuar.
                </p>
              </div>
            )}
          </div>

          {/* ── Plataformas ────────────────────────────────────────────── */}
          <div>
            <p className="text-sm font-medium text-gray-800 mb-2">De qual plataforma pedir o print</p>
            <div className="flex flex-wrap gap-2">
              {platformNames.map((nome) => {
                const ativa = marcadas.has(nome);
                return (
                  <button
                    key={nome} type="button" onClick={() => toggle(nome)}
                    className={`px-3 py-1.5 rounded-full text-sm border min-h-[36px] ${
                      ativa
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {nome}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Previa honesta de quem vai ser cobrado ─────────────────── */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
            <div className="flex items-start gap-2">
              <Users className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-gray-700">
                {previa.drivers === 0 ? (
                  <span>
                    Ninguem tem pacote nas plataformas escolhidas nesta quinzena — <strong>nenhum print
                    sera pedido</strong>.
                  </span>
                ) : (
                  <>
                    <strong>{previa.drivers}</strong> entregador(es) com pacote,{' '}
                    <strong>{previa.prints}</strong> print(s) no total.
                    {previa.grupos > 0 && (
                      <div className="text-xs text-gray-600 mt-1">
                        {previa.emGrupo} deles estao em {previa.grupos} grupo(s): quem anexa e o{' '}
                        <strong>lider</strong>, mas e <strong>um print por entregador</strong> — o portal
                        do lider mostra um cartao pra cada membro.
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {jaSolicitadas.length > 0 && (
            <p className="text-xs text-gray-500">
              Ja solicitado nesta quinzena: <strong>{jaSolicitadas.join(', ')}</strong>. Desmarcar faz o portal
              parar de pedir — os prints ja enviados continuam guardados.
            </p>
          )}
        </div>
      )}
    </ModalShell>
  );
};
