import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Clock,
  Users,
  BarChart3,
  Settings,
  UserCog,
  DollarSign,
  AlertTriangle,
  FileSpreadsheet,
  Truck,
  Database,
  BookOpen,
  Shield,
  MoreHorizontal,
  UserCheck,
} from 'lucide-react';

export type TabType =
  | 'attendance'
  | 'employees'
  | 'reports'
  | 'settings'
  | 'users'
  | 'financial'
  | 'errors'
  | 'c6payment'
  | 'driverpay'
  | 'datamanagement'
  | 'tutorial'
  | 'admin'
  | 'employeeapproval';

interface TabNavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  userRole: 'admin' | 'supervisor';
  hasPermission: (permission: string) => boolean;
}

/**
 * Cor de cada área (06/08/2026, pedido do Victor: "cores vivas", "didático").
 * A cor é a MESMA em toda a aba (aba ativa, títulos, botão principal), então
 * quem usa aprende o lugar pela cor antes de ler o nome.
 */
const TAB_COLOR: Record<TabType, string> = {
  attendance: '#0284c7',      // ponto — azul
  employees: '#7c3aed',       // pessoas — violeta
  reports: '#d97706',         // relatórios — âmbar
  financial: '#059669',       // dinheiro — verde
  c6payment: '#0891b2',       // banco — ciano
  driverpay: '#4f46e5',       // entregadores — índigo
  errors: '#e11d48',          // erro — vermelho
  settings: '#475569',        // ajustes — chumbo
  users: '#c026d3',           // usuários — fúcsia
  datamanagement: '#0d9488',  // dados — teal
  tutorial: '#ea580c',        // ajuda — laranja
  admin: '#b91c1c',           // admin — vermelho escuro
  employeeapproval: '#16a34a', // aprovação de cadastro — verde
};

const LARGURA_BOTAO_MAIS = 104; // px reservados pro botão "Mais" quando ele existe

export const TabNavigation: React.FC<TabNavigationProps> = ({
  activeTab,
  onTabChange,
  hasPermission,
}) => {
  const { t } = useTranslation();
  // Sub-fase 17.5.1: name traduzido via i18n. data-test mantém nome pt-BR
  // pra compat com specs E2E (que usam getByRole({name:/Ponto/}) etc.).
  const allTabs = [
    { id: 'attendance' as TabType, name: t('tab.attendance'), icon: Clock, permission: 'attendance.view' },
    { id: 'employees' as TabType, name: t('tab.employees'), icon: Users, permission: 'employees.view' },
    { id: 'employeeapproval' as TabType, name: t('tab.employeeapproval'), icon: UserCheck, permission: 'employeeapproval.view' },
    { id: 'reports' as TabType, name: t('tab.reports'), icon: BarChart3, permission: 'reports.view' },
    { id: 'financial' as TabType, name: t('tab.financial'), icon: DollarSign, permission: 'financial.view' },
    { id: 'c6payment' as TabType, name: t('tab.c6payment'), icon: FileSpreadsheet, permission: 'c6payment.view' },
    { id: 'driverpay' as TabType, name: t('tab.driverpay'), icon: Truck, permission: 'driverpay.view' },
    { id: 'errors' as TabType, name: t('tab.errors'), icon: AlertTriangle, permission: 'errors.view' },
    { id: 'settings' as TabType, name: t('tab.settings'), icon: Settings, permission: 'settings.view' },
    { id: 'users' as TabType, name: t('tab.users'), icon: UserCog, permission: 'users.view' },
    { id: 'datamanagement' as TabType, name: t('tab.datamanagement'), icon: Database, permission: 'datamanagement.view' },
    { id: 'tutorial' as TabType, name: t('tab.tutorial'), icon: BookOpen, permission: null },
    { id: 'admin' as TabType, name: t('tab.admin'), icon: Shield, permission: null },
  ];

  const tabs = allTabs.filter((tab) => !tab.permission || hasPermission(tab.permission));

  /**
   * Quantas abas cabem na largura de hoje (decisão dele: o que não couber vai
   * pro menu "Mais"). As larguras são medidas numa linha invisível `aria-hidden`
   * — invisível pro leitor de tela E pros seletores dos testes, então continua
   * existindo UM só botão por aba no app inteiro.
   *
   * Se a medição falhar por qualquer motivo, o padrão é MOSTRAR TUDO (a barra
   * volta a rolar de lado, como era antes): nenhuma aba pode sumir por acidente.
   */
  const barraRef = useRef<HTMLDivElement>(null);
  const medidorRef = useRef<HTMLDivElement>(null);
  const [visiveis, setVisiveis] = useState<number>(tabs.length);
  const [menuAberto, setMenuAberto] = useState(false);

  const medir = useCallback(() => {
    const barra = barraRef.current;
    const medidor = medidorRef.current;
    if (!barra || !medidor) return;
    // 📱 Celular e tablet NÃO têm menu "Mais": lá a barra rola de lado e qualquer
    // aba continua a UM toque. Medido: em 393px caberiam 2 abas e em 820px caberiam
    // 4 — o menu engoliria o resto e trocar de tela viraria dois toques, o oposto
    // do que ele pediu. O menu só entra no computador (≥1024px), onde ele guarda
    // no máximo 2 abas.
    if (barra.clientWidth < 1024) { setVisiveis(tabs.length); return; }
    const larguras = Array.from(medidor.children).map((c) => (c as HTMLElement).offsetWidth + 8);
    if (larguras.length === 0 || larguras.some((l) => l <= 8)) return; // ainda não pintou
    const disponivel = barra.clientWidth - 8;
    let usado = 0;
    let cabem = 0;
    for (const l of larguras) {
      if (usado + l > disponivel) break;
      usado += l;
      cabem += 1;
    }
    // Sobrou aba de fora? Então o botão "Mais" também precisa de lugar.
    if (cabem < larguras.length) {
      while (cabem > 0 && usado + LARGURA_BOTAO_MAIS > disponivel) {
        cabem -= 1;
        usado -= larguras[cabem];
      }
    }
    setVisiveis(Math.max(1, cabem));
  }, [tabs.length]);

  useLayoutEffect(() => {
    medir();
    const barra = barraRef.current;
    if (!barra || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => medir());
    ro.observe(barra);
    return () => ro.disconnect();
  }, [medir, tabs.length]);

  useEffect(() => {
    if (!menuAberto) return;
    const fechar = (e: MouseEvent): void => {
      if (!(e.target as HTMLElement).closest('[data-menu-mais]')) setMenuAberto(false);
    };
    document.addEventListener('mousedown', fechar);
    return () => document.removeEventListener('mousedown', fechar);
  }, [menuAberto]);

  const naBarra = tabs.slice(0, visiveis);
  const noMenu = tabs.slice(visiveis);
  // A aba aberta nunca fica escondida: se ela caiu no "Mais", troca de lugar com
  // a última visível — senão a pessoa perde de vista onde está.
  if (noMenu.some((tb) => tb.id === activeTab) && naBarra.length > 0) {
    const i = noMenu.findIndex((tb) => tb.id === activeTab);
    const ultima = naBarra[naBarra.length - 1];
    naBarra[naBarra.length - 1] = noMenu[i];
    noMenu[i] = ultima;
  }

  const botao = (tab: (typeof tabs)[number], dentroDoMenu: boolean): React.ReactElement => {
    const Icon = tab.icon;
    const isActive = activeTab === tab.id;
    const cor = TAB_COLOR[tab.id];
    return (
      <button
        key={tab.id}
        onClick={() => { onTabChange(tab.id); setMenuAberto(false); }}
        aria-label={tab.name}
        aria-current={isActive ? 'page' : undefined}
        style={
          isActive
            ? { background: `linear-gradient(135deg, ${cor}, ${cor}dd)`, boxShadow: `0 6px 16px -6px ${cor}` }
            : undefined
        }
        className={`${
          isActive ? 'text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        } ${
          dentroDoMenu ? 'w-full justify-start' : ''
        } whitespace-nowrap rounded-xl px-3 py-2 font-semibold text-xs sm:text-sm flex items-center gap-2 transition-all min-h-[44px] flex-shrink-0`}
      >
        <Icon className="w-4 h-4 flex-shrink-0" style={isActive ? undefined : { color: cor }} />
        <span>{tab.name}</span>
      </button>
    );
  };

  return (
    <div className="bg-white shadow-sm mb-4 sm:mb-6 sticky top-14 sm:top-16 z-30 border-b border-gray-200">
      {/* Linha invisível só pra medir a largura de cada aba (aria-hidden: não
          entra na árvore de acessibilidade, então não duplica seletor nenhum). */}
      {/* `w-0 overflow-hidden`: a linha de medição não pode, em hipótese nenhuma, esticar a
          página pro lado. Medir continua funcionando — `offsetWidth` do filho não muda por
          causa do corte do pai. */}
      <div
        ref={medidorRef}
        aria-hidden="true"
        className="pointer-events-none absolute -z-10 flex gap-2 opacity-0 w-0 h-0 overflow-hidden"
        style={{ visibility: 'hidden' }}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <span
              key={tab.id}
              className="whitespace-nowrap rounded-xl px-3 py-2 font-semibold text-xs sm:text-sm flex items-center gap-2 min-h-[44px] flex-shrink-0"
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{tab.name}</span>
            </span>
          );
        })}
      </div>

      <nav
        ref={barraRef}
        className="flex items-center gap-2 px-2 sm:px-4 py-2 overflow-x-auto sm:overflow-visible"
        aria-label="Navegação principal"
      >
        {naBarra.map((tab) => botao(tab, false))}

        {noMenu.length > 0 && (
          <div className="relative flex-shrink-0" data-menu-mais>
            <button
              type="button"
              onClick={() => setMenuAberto((v) => !v)}
              aria-label="Mais abas"
              aria-expanded={menuAberto}
              data-testid="abas-mais"
              className="whitespace-nowrap rounded-xl px-3 py-2 font-semibold text-xs sm:text-sm flex items-center gap-2 min-h-[44px] text-gray-600 hover:bg-gray-100 hover:text-gray-900 border border-dashed border-gray-300"
            >
              <MoreHorizontal className="w-4 h-4" />
              <span>Mais ({noMenu.length})</span>
            </button>
            {menuAberto && (
              <div className="absolute right-0 top-full mt-1 z-40 w-56 rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl">
                {noMenu.map((tab) => botao(tab, true))}
              </div>
            )}
          </div>
        )}
      </nav>
    </div>
  );
};
