import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Tablet, KeyRound, ShieldCheck, Trash2, RefreshCw, Loader2, Hand } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getCompanies,
  listClockDevices,
  createClockDevicePairing,
  revokeClockDevice,
  setClockDeviceLock,
  setClockDeviceModoGalpao,
  type ClockDeviceRow,
  type Company,
} from '../../services/database';
import { mensagemDeErro } from '../../utils/mensagemDeErro';

/**
 * "Tablets de ponto" (30/09/2026, roadmap item 3 — decisões do Victor: só o 2626 cadastra e
 * liga a trava; com a trava ligada TODO MUNDO só bate no tablet, supervisor incluído; nasce
 * desligada).
 *
 * Três coisas nesta tela:
 *   1. cadastrar um tablet = gerar um CÓDIGO DE ATIVAÇÃO (vale 15 min) e digitá-lo no tablet,
 *      na tela de ponto ("Ativar este aparelho como tablet de ponto");
 *   2. ver os tablets (ativos, aguardando ativação, removidos) e remover um;
 *   3. ligar/desligar "ponto só no tablet" por empresa — ligar exige um tablet ativo dela, e o
 *      banco recusa remover o último tablet de uma empresa com a trava ligada;
 *   4. (06/10/2026) ligar/desligar o MODO GALPÃO de um tablet ativo — a tela dele deixa de pedir
 *      toque (plano do tablet sem toque, decisões do Victor de 05/10). Nasce desligado.
 * Quem garante tudo isso é o banco (funções clock_device_*, conferem sub = 2626); a tela só
 * mostra e confirma.
 */

function formatarDataHora(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatarHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

const ROTULO_DO_STATUS: Record<ClockDeviceRow['status'], { texto: string; classe: string }> = {
  active: { texto: 'Ativo', classe: 'bg-green-100 text-green-800' },
  pending: { texto: 'Aguardando ativação', classe: 'bg-yellow-100 text-yellow-800' },
  expired: { texto: 'Código vencido', classe: 'bg-gray-100 text-gray-600' },
  revoked: { texto: 'Removido', classe: 'bg-red-100 text-red-700' },
};

export const ClockDevicesCard: React.FC = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [devices, setDevices] = useState<ClockDeviceRow[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroAoCarregar, setErroAoCarregar] = useState<string | null>(null);

  const [nome, setNome] = useState('');
  const [empresasDoNovo, setEmpresasDoNovo] = useState<string[]>([]);
  const [gerando, setGerando] = useState(false);
  const [codigoGerado, setCodigoGerado] = useState<{ nome: string; codigo: string; ateAs: string } | null>(null);

  const [confirmarTrava, setConfirmarTrava] = useState<{ company: Company; ligar: boolean } | null>(null);
  const [mudandoTrava, setMudandoTrava] = useState(false);
  const [confirmarRemocao, setConfirmarRemocao] = useState<ClockDeviceRow | null>(null);
  const [removendo, setRemovendo] = useState(false);
  const [confirmarGalpao, setConfirmarGalpao] = useState<{ device: ClockDeviceRow; ligar: boolean } | null>(null);
  const [mudandoGalpao, setMudandoGalpao] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErroAoCarregar(null);
    try {
      const [todas, lista] = await Promise.all([getCompanies(), listClockDevices()]);
      setCompanies(todas);
      setDevices(lista);
      setEmpresasDoNovo((atuais) => (atuais.length ? atuais : todas.map((c) => c.id)));
    } catch (err) {
      setErroAoCarregar(mensagemDeErro(err, 'Não foi possível carregar os tablets de ponto'));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  /** Tablets ATIVOS de cada empresa (é o que decide se a trava pode ser ligada). */
  const ativosPorEmpresa = useMemo(() => {
    const mapa = new Map<string, ClockDeviceRow[]>();
    for (const d of devices) {
      if (d.status !== 'active') continue;
      for (const id of d.company_ids) mapa.set(id, [...(mapa.get(id) ?? []), d]);
    }
    return mapa;
  }, [devices]);

  const gerarCodigo = async () => {
    setGerando(true);
    try {
      const r = await createClockDevicePairing(nome.trim(), empresasDoNovo);
      setCodigoGerado({ nome: nome.trim(), codigo: r.pairingCode, ateAs: formatarHora(r.expiresAt) });
      setNome('');
      await carregar();
    } catch (err) {
      toast.error(mensagemDeErro(err, 'Não foi possível gerar o código'));
    } finally {
      setGerando(false);
    }
  };

  const aplicarTrava = async () => {
    if (!confirmarTrava) return;
    setMudandoTrava(true);
    try {
      await setClockDeviceLock(confirmarTrava.company.id, confirmarTrava.ligar);
      toast.success(`${confirmarTrava.company.display_name}: ponto só no tablet ${confirmarTrava.ligar ? 'LIGADO' : 'desligado'}.`);
      setConfirmarTrava(null);
      await carregar();
    } catch (err) {
      toast.error(mensagemDeErro(err, 'Não foi possível mudar a trava'));
    } finally {
      setMudandoTrava(false);
    }
  };

  const remover = async () => {
    if (!confirmarRemocao) return;
    setRemovendo(true);
    try {
      await revokeClockDevice(confirmarRemocao.id);
      toast.success(`Tablet "${confirmarRemocao.name}" removido.`);
      setConfirmarRemocao(null);
      await carregar();
    } catch (err) {
      toast.error(mensagemDeErro(err, 'Não foi possível remover o tablet'));
    } finally {
      setRemovendo(false);
    }
  };

  const aplicarGalpao = async () => {
    if (!confirmarGalpao) return;
    setMudandoGalpao(true);
    try {
      await setClockDeviceModoGalpao(confirmarGalpao.device.id, confirmarGalpao.ligar);
      toast.success(`${confirmarGalpao.device.name}: modo galpão ${confirmarGalpao.ligar ? 'LIGADO' : 'desligado'}.`);
      setConfirmarGalpao(null);
      await carregar();
    } catch (err) {
      toast.error(mensagemDeErro(err, 'Não foi possível mudar o modo galpão'));
    } finally {
      setMudandoGalpao(false);
    }
  };

  const podeGerar = nome.trim().length > 0 && nome.trim().length <= 60 && empresasDoNovo.length > 0 && !gerando;

  return (
    <div className="bg-white p-4 sm:p-6 rounded-lg shadow space-y-5" data-testid="clock-devices-card">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base sm:text-lg font-semibold flex items-center text-gray-800">
            <Tablet className="w-5 h-5 mr-2 text-blue-600" />
            Tablets de ponto
          </h3>
          {/* O tablet é ativado em OUTRO aparelho — daqui só dá pra saber recarregando a lista. */}
          <button
            onClick={() => void carregar()}
            disabled={carregando}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50 rounded-md disabled:opacity-50 min-h-[40px]"
          >
            <RefreshCw className="w-4 h-4" /> Atualizar lista
          </button>
        </div>
        <p className="text-sm text-gray-600 mt-1">
          Com a trava ligada, o ponto da empresa só é registrado nos tablets <strong>ativos</strong> daqui —
          celular pessoal e aparelho de supervisor são recusados. A localização e a facial continuam
          obrigatórias.
        </p>
      </div>

      {carregando ? (
        <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</p>
      ) : erroAoCarregar ? (
        <div className="text-sm text-red-700 bg-red-50 rounded-md p-3 space-y-2">
          <p>{erroAoCarregar}</p>
          <button onClick={() => void carregar()} className="inline-flex items-center gap-1 text-red-800 underline">
            <RefreshCw className="w-4 h-4" /> Tentar de novo
          </button>
        </div>
      ) : (
        <>
          {/* ── 1. Trava por empresa ── */}
          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1">
              <ShieldCheck className="w-4 h-4 text-emerald-600" /> Ponto só no tablet
            </h4>
            {companies.map((c) => {
              const ligada = c.require_clock_device === true;
              const ativos = ativosPorEmpresa.get(c.id) ?? [];
              return (
                <div key={c.id} className="flex flex-col sm:flex-row sm:items-center gap-2 border border-gray-200 rounded-md p-3" data-testid={`trava-${c.display_name}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800">{c.display_name}</p>
                    <p className="text-xs text-gray-500">
                      {ativos.length === 0 ? 'Nenhum tablet ativo' : `${ativos.length} tablet(s) ativo(s): ${ativos.map((d) => d.name).join(', ')}`}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded ${ligada ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'}`}>
                    {ligada ? 'LIGADA' : 'Desligada'}
                  </span>
                  <button
                    onClick={() => setConfirmarTrava({ company: c, ligar: !ligada })}
                    disabled={!ligada && ativos.length === 0}
                    title={!ligada && ativos.length === 0 ? 'Ative pelo menos um tablet desta empresa antes de ligar a trava' : undefined}
                    className={`px-3 py-2 rounded-md text-sm font-medium min-h-[40px] disabled:opacity-50 disabled:cursor-not-allowed ${ligada ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                  >
                    {ligada ? 'Desligar trava' : 'Ligar trava'}
                  </button>
                </div>
              );
            })}

            {confirmarTrava && (
              <div className="border-2 border-amber-300 bg-amber-50 rounded-md p-3 space-y-2" role="alertdialog" aria-label="Confirmar trava">
                {confirmarTrava.ligar ? (
                  <p className="text-sm text-amber-900">
                    Ligar a trava em <strong>{confirmarTrava.company.display_name}</strong>: a partir de agora
                    <strong> ninguém</strong> desta empresa bate ponto fora dos tablets ativos
                    ({(ativosPorEmpresa.get(confirmarTrava.company.id) ?? []).map((d) => d.name).join(', ')}).
                  </p>
                ) : (
                  <p className="text-sm text-amber-900">
                    Desligar a trava em <strong>{confirmarTrava.company.display_name}</strong>: volta a valer bater
                    ponto em qualquer aparelho (com localização e facial, como antes).
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => void aplicarTrava()}
                    disabled={mudandoTrava}
                    className="px-4 py-2 bg-amber-600 text-white rounded-md text-sm font-semibold hover:bg-amber-700 disabled:opacity-50"
                  >
                    {mudandoTrava ? 'Salvando...' : confirmarTrava.ligar ? 'Confirmar: ligar trava' : 'Confirmar: desligar trava'}
                  </button>
                  <button onClick={() => setConfirmarTrava(null)} className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm">
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* ── 2. Cadastrar tablet ── */}
          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1">
              <KeyRound className="w-4 h-4 text-blue-600" /> Cadastrar tablet
            </h4>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                maxLength={60}
                placeholder="Nome do tablet (ex.: Tablet da portaria)"
                aria-label="Nome do tablet"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-base min-h-[44px]"
              />
              <button
                onClick={() => void gerarCodigo()}
                disabled={!podeGerar}
                className="px-4 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 min-h-[44px] whitespace-nowrap"
              >
                {gerando ? 'Gerando...' : 'Gerar código de ativação'}
              </button>
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-gray-700">
              <span className="text-gray-500">Atende:</span>
              {companies.map((c) => (
                <label key={c.id} className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={empresasDoNovo.includes(c.id)}
                    onChange={(e) => setEmpresasDoNovo((atual) => (e.target.checked ? [...atual, c.id] : atual.filter((id) => id !== c.id)))}
                  />
                  {c.display_name}
                </label>
              ))}
            </div>

            {codigoGerado && (
              <div className="border-2 border-blue-300 bg-blue-50 rounded-md p-4 text-center space-y-1" data-testid="codigo-de-ativacao">
                <p className="text-sm text-blue-900">Código de ativação de <strong>{codigoGerado.nome}</strong>:</p>
                <p className="text-3xl font-mono font-bold tracking-widest text-blue-900" data-testid="codigo-de-ativacao-valor">{codigoGerado.codigo}</p>
                <p className="text-xs text-blue-800">Vale até {codigoGerado.ateAs} e só pode ser usado uma vez.</p>
                <p className="text-xs text-blue-800">
                  No tablet: abra a tela de ponto → toque em <strong>"Ativar este aparelho como tablet de ponto"</strong> → digite o código.
                </p>
              </div>
            )}
          </section>

          {/* ── 3. Tablets cadastrados ── */}
          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-700">Tablets cadastrados</h4>
            {devices.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum tablet cadastrado ainda.</p>
            ) : (
              <ul className="divide-y divide-gray-100 border border-gray-200 rounded-md">
                {devices.map((d) => {
                  const status = ROTULO_DO_STATUS[d.status];
                  return (
                    <li key={d.id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-2" data-testid={`tablet-${d.name}`}>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 truncate">{d.name}</p>
                        <p className="text-xs text-gray-500">
                          {d.company_names.join(', ')}
                          {d.status === 'pending' && d.pairing_expires_at ? ` · código vale até ${formatarHora(d.pairing_expires_at)}` : ''}
                          {d.status === 'active' ? ` · ativado ${formatarDataHora(d.activated_at)} · último uso ${formatarDataHora(d.last_seen_at)}` : ''}
                          {d.status === 'revoked' ? ` · removido ${formatarDataHora(d.revoked_at)}` : ''}
                        </p>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-1 rounded ${status.classe}`}>{status.texto}</span>
                      {d.status === 'active' && d.modo_galpao === true && (
                        <span className="text-xs font-semibold px-2 py-1 rounded bg-indigo-100 text-indigo-800">Modo galpão</span>
                      )}
                      {d.status === 'active' && (
                        <button
                          onClick={() => setConfirmarGalpao({ device: d, ligar: d.modo_galpao !== true })}
                          className="inline-flex items-center gap-1 px-3 py-2 text-sm text-indigo-700 hover:bg-indigo-50 rounded-md min-h-[40px]"
                          data-testid={`modo-galpao-${d.name}`}
                        >
                          <Hand className="w-4 h-4" /> {d.modo_galpao === true ? 'Desligar modo galpão' : 'Ligar modo galpão'}
                        </button>
                      )}
                      {(d.status === 'active' || d.status === 'pending') && (
                        <button
                          onClick={() => setConfirmarRemocao(d)}
                          className="inline-flex items-center gap-1 px-3 py-2 text-sm text-red-700 hover:bg-red-50 rounded-md min-h-[40px]"
                        >
                          <Trash2 className="w-4 h-4" /> Remover
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {confirmarGalpao && (
              <div className="border-2 border-indigo-300 bg-indigo-50 rounded-md p-3 space-y-2" role="alertdialog" aria-label="Confirmar modo galpão">
                {confirmarGalpao.ligar ? (
                  <p className="text-sm text-indigo-900">
                    Ligar o <strong>modo galpão</strong> em <strong>{confirmarGalpao.device.name}</strong>? A tela dele passa a
                    não pedir toque nenhum: a câmera fica sempre olhando (tela escura com relógio quando não tem ninguém),
                    quem bate de novo em menos de 10 minutos só vê o aviso e o ponto não é gravado, e quem não é
                    reconhecido vê &quot;chame o supervisor&quot;. A tela sempre abre na câmera e dá um bipe quando o ponto
                    entra. Vale só pra este tablet — ele fica sabendo sozinho em até 5 minutos.
                  </p>
                ) : (
                  <p className="text-sm text-indigo-900">
                    Desligar o modo galpão em <strong>{confirmarGalpao.device.name}</strong>? A tela volta a ser a de sempre
                    (descansa a câmera e pede toque pra voltar). Ele fica sabendo sozinho em até 5 minutos.
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => void aplicarGalpao()}
                    disabled={mudandoGalpao}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
                    data-testid="confirmar-modo-galpao"
                  >
                    {mudandoGalpao ? 'Salvando...' : confirmarGalpao.ligar ? 'Confirmar: ligar modo galpão' : 'Confirmar: desligar modo galpão'}
                  </button>
                  <button onClick={() => setConfirmarGalpao(null)} className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm">
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {confirmarRemocao && (
              <div className="border-2 border-red-300 bg-red-50 rounded-md p-3 space-y-2" role="alertdialog" aria-label="Confirmar remoção">
                <p className="text-sm text-red-900">
                  Remover <strong>{confirmarRemocao.name}</strong>? Ele deixa de registrar ponto na hora. Pra usar de
                  novo, é preciso gerar um código novo.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => void remover()}
                    disabled={removendo}
                    className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
                  >
                    {removendo ? 'Removendo...' : 'Confirmar: remover tablet'}
                  </button>
                  <button onClick={() => setConfirmarRemocao(null)} className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm">
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};
