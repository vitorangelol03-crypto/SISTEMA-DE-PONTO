/**
 * Seed dos 57 drivers reais da iMile Caratinga (empresa CD Logística / Caratinga).
 *
 * Fonte: "PLANILHA DE PAGAMENTOS IMILE CTGA 2026 (1).xlsx", aba "1 QUINZENA DE JUNHO".
 * Extraído programaticamente (xlsx@0.18.5) e conferido: 57 drivers, somas multi-rota
 * batendo (Fernando 70+242=312; Gessiley 35+282+250=567), 1 desconto (Caio R$50).
 *
 * Formato pareado da planilha: a linha-driver traz o valor/pacote (col C "Valor eMile")
 * e o total de pacotes; as linhas seguintes (col C vazia) são as rotas/cidades. Só há
 * plataforma eMile neste período (ANJUN 100% vazio). package_code é STRING (o ID do
 * pacote do desconto do Caio tem 12 dígitos e viraria notação científica se fosse number).
 *
 * Uso: passar para bulkImportDrivers(companyId, userId, IMILE_CTGA_SEED, platforms).
 * NÃO editar à mão — regenerar da planilha se precisar (scripts no scratchpad).
 */
import type { DriverSeed } from '../services/driverPay';

/** Nome da plataforma-base desta operação (bate com o header "eMile" da planilha). */
export const IMILE_PLATFORM_EMILE = 'eMile';

export const IMILE_CTGA_SEED: DriverSeed[] = [
  //  1 — Caio Rezende Valério Nascimento (desconto)
  {
    name: 'Caio Rezende Valério Nascimento',
    route: 'Santa Rita de Minas',
    rates: { eMile: 2 },
    routes: [{ city: 'Santa Rita de Minas', packages: { eMile: 187 } }],
    discount: { amount: 50, package_code: '741412525252' },
  },
  //  2 — Fabricio dos Santos Maia Soares
  {
    name: 'Fabricio dos Santos Maia Soares',
    route: 'Santa Bárbara do Leste',
    rates: { eMile: 2 },
    routes: [{ city: 'Santa Bárbara do Leste', packages: { eMile: 378 } }],
  },
  //  3 — VANILDO DA SILVA RUELA DE OLIVEIRA
  {
    name: 'VANILDO DA SILVA RUELA DE OLIVEIRA',
    route: 'Mutum',
    rates: { eMile: 2.15 },
    routes: [{ city: 'Mutum', packages: { eMile: 234 } }],
  },
  //  4 — Adriano Furtunato Alves
  {
    name: 'Adriano Furtunato Alves',
    route: 'Caratinga',
    rates: { eMile: 3 },
    routes: [{ city: 'Caratinga', packages: { eMile: 36 } }],
  },
  //  5 — ANDREA DOS SANTOS ALVES
  {
    name: 'ANDREA DOS SANTOS ALVES',
    route: 'São Sebastião do Anta',
    rates: { eMile: 2.2 },
    routes: [{ city: 'São Sebastião do Anta', packages: { eMile: 372 } }],
  },
  //  6 — Angelo Fabricio Avelino Esteves
  {
    name: 'Angelo Fabricio Avelino Esteves',
    route: 'Caratinga',
    rates: { eMile: 2 },
    routes: [{ city: 'Caratinga', packages: { eMile: 39 } }],
  },
  //  7 — Augusto Paulo Horsth Dutra
  {
    name: 'Augusto Paulo Horsth Dutra',
    route: 'Mutum',
    rates: { eMile: 2.15 },
    routes: [{ city: 'Mutum', packages: { eMile: 146 } }],
  },
  //  8 — Aurineth da Cunha Hermsdorf
  {
    name: 'Aurineth da Cunha Hermsdorf',
    route: 'Conceição de Ipanema',
    rates: { eMile: 2.5 },
    routes: [{ city: 'Conceição de Ipanema', packages: { eMile: 160 } }],
  },
  //  9 — Bruno Egídio
  {
    name: 'Bruno Egídio',
    route: 'Raul Soares',
    rates: { eMile: 2 },
    routes: [{ city: 'Raul Soares', packages: { eMile: 125 } }],
  },
  // 10 — Bruno Ferrari Guedes
  {
    name: 'Bruno Ferrari Guedes',
    route: 'Mutum',
    rates: { eMile: 2.7 },
    routes: [{ city: 'Mutum', packages: { eMile: 356 } }],
  },
  // 11 — Caíque Rezende Valério Nascimento
  {
    name: 'Caíque Rezende Valério Nascimento',
    route: 'Santa Rita de Minas',
    rates: { eMile: 2 },
    routes: [{ city: 'Santa Rita de Minas', packages: { eMile: 87 } }],
  },
  // 12 — Carlos Barbosa
  {
    name: 'Carlos Barbosa',
    route: 'Raul Soares',
    rates: { eMile: 2 },
    routes: [{ city: 'Raul Soares', packages: { eMile: 1 } }],
  },
  // 13 — Carlos Barbosa
  {
    name: 'Carlos Barbosa',
    route: 'Raul Soares',
    rates: { eMile: 2 },
    routes: [{ city: 'Raul Soares', packages: { eMile: 109 } }],
  },
  // 14 — Carlos Henrique
  {
    name: 'Carlos Henrique',
    route: 'Raul Soares',
    rates: { eMile: 2 },
    routes: [{ city: 'Raul Soares', packages: { eMile: 111 } }],
  },
  // 15 — Cicero Junior de Sousa da Silva
  {
    name: 'Cicero Junior de Sousa da Silva',
    route: 'Caratinga',
    rates: { eMile: 2 },
    routes: [{ city: 'Caratinga', packages: { eMile: 536 } }],
  },
  // 16 — Claudio Carlos de paula
  {
    name: 'Claudio Carlos de paula',
    route: 'Caratinga',
    rates: { eMile: 2 },
    routes: [{ city: 'Caratinga', packages: { eMile: 159 } }],
  },
  // 17 — Cristiano Viegas Alves
  {
    name: 'Cristiano Viegas Alves',
    route: 'Taparuba',
    rates: { eMile: 2 },
    routes: [{ city: 'Taparuba', packages: { eMile: 153 } }],
  },
  // 18 — Daniel Pires Da Cruz
  {
    name: 'Daniel Pires Da Cruz',
    route: 'Caratinga',
    rates: { eMile: 2 },
    routes: [{ city: 'Caratinga', packages: { eMile: 177 } }],
  },
  // 19 — Erick de Paula Matias
  {
    name: 'Erick de Paula Matias',
    route: 'Caratinga',
    rates: { eMile: 2 },
    routes: [{ city: 'Caratinga', packages: { eMile: 559 } }],
  },
  // 20 — Fabio Araújo Nascimento
  {
    name: 'Fabio Araújo Nascimento',
    route: 'Caratinga',
    rates: { eMile: 2 },
    routes: [{ city: 'Caratinga', packages: { eMile: 8 } }],
  },
  // 21 — Fabricio dos Santos Ferreira
  {
    name: 'Fabricio dos Santos Ferreira',
    route: 'Caratinga',
    rates: { eMile: 2 },
    routes: [{ city: 'Caratinga', packages: { eMile: 291 } }],
  },
  // 22 — Fernando Martins da Silva (multi-rota)
  {
    name: 'Fernando Martins da Silva',
    route: 'Raul Soares, Vermelho Novo',
    rates: { eMile: 2 },
    routes: [
      { city: 'Raul Soares', packages: { eMile: 70 } },
      { city: 'Vermelho Novo', packages: { eMile: 242 } },
    ],
  },
  // 23 — FILLIPE AUGUSTO DOS SANTOS EMIDIO
  {
    name: 'FILLIPE AUGUSTO DOS SANTOS EMIDIO',
    route: 'Imbé de Minas',
    rates: { eMile: 2 },
    routes: [{ city: 'Imbé de Minas', packages: { eMile: 185 } }],
  },
  // 24 — Geovane Pereira da Silva
  {
    name: 'Geovane Pereira da Silva',
    route: 'São José do Mantimento',
    rates: { eMile: 2.3 },
    routes: [{ city: 'São José do Mantimento', packages: { eMile: 236 } }],
  },
  // 25 — Gerson Botelho de Sousa
  {
    name: 'Gerson Botelho de Sousa',
    route: 'Piedade de Caratinga',
    rates: { eMile: 2 },
    routes: [{ city: 'Piedade de Caratinga', packages: { eMile: 468 } }],
  },
  // 26 — Gessiley Rodrigues de Freitas (multi-rota)
  {
    name: 'Gessiley Rodrigues de Freitas',
    route: 'Caratinga, Entre Folhas, Vargem Alegre',
    rates: { eMile: 2.2 },
    routes: [
      { city: 'Caratinga', packages: { eMile: 35 } },
      { city: 'Entre Folhas', packages: { eMile: 282 } },
      { city: 'Vargem Alegre', packages: { eMile: 250 } },
    ],
  },
  // 27 — Henrique Pereira de Freitas
  {
    name: 'Henrique Pereira de Freitas',
    route: 'Chalé',
    rates: { eMile: 2.3 },
    routes: [{ city: 'Chalé', packages: { eMile: 486 } }],
  },
  // 28 — Igor Gomes Santos
  {
    name: 'Igor Gomes Santos',
    route: 'Caratinga',
    rates: { eMile: 2.5 },
    routes: [{ city: 'Caratinga', packages: { eMile: 38 } }],
  },
  // 29 — Jessica Correia da Silva
  {
    name: 'Jessica Correia da Silva',
    route: 'Ipanema',
    rates: { eMile: 2 },
    routes: [{ city: 'Ipanema', packages: { eMile: 1192 } }],
  },
  // 30 — João Gabriel Ferreira
  {
    name: 'João Gabriel Ferreira',
    route: 'Caratinga',
    rates: { eMile: 2 },
    routes: [{ city: 'Caratinga', packages: { eMile: 67 } }],
  },
  // 31 — João Pedro da Silveira Silva
  {
    name: 'João Pedro da Silveira Silva',
    route: 'Caratinga',
    rates: { eMile: 2 },
    routes: [{ city: 'Caratinga', packages: { eMile: 81 } }],
  },
  // 32 — Joao Pedro Gomes
  {
    name: 'Joao Pedro Gomes',
    route: 'Caratinga',
    rates: { eMile: 2 },
    routes: [{ city: 'Caratinga', packages: { eMile: 89 } }],
  },
  // 33 — João Victor Cassimiro Fonseca
  {
    name: 'João Victor Cassimiro Fonseca',
    route: 'Mutum',
    rates: { eMile: 2.15 },
    routes: [{ city: 'Mutum', packages: { eMile: 236 } }],
  },
  // 34 — Leandro Bernardes Francisco
  {
    name: 'Leandro Bernardes Francisco',
    route: 'Raul Soares',
    rates: { eMile: 2 },
    routes: [{ city: 'Raul Soares', packages: { eMile: 612 } }],
  },
  // 35 — Luan Fialho Souza
  {
    name: 'Luan Fialho Souza',
    route: 'Inhapim',
    rates: { eMile: 2.2 },
    routes: [{ city: 'Inhapim', packages: { eMile: 223 } }],
  },
  // 36 — Luan Henrique da Silva FErreira
  {
    name: 'Luan Henrique da Silva FErreira',
    route: 'Caratinga',
    rates: { eMile: 2 },
    routes: [{ city: 'Caratinga', packages: { eMile: 150 } }],
  },
  // 37 — LUAN KALLEB DE OLIVEIRA PIRES
  {
    name: 'LUAN KALLEB DE OLIVEIRA PIRES',
    route: 'Caratinga',
    rates: { eMile: 2 },
    routes: [{ city: 'Caratinga', packages: { eMile: 127 } }],
  },
  // 38 — Lucas Aredes Martins Vieira
  {
    name: 'Lucas Aredes Martins Vieira',
    route: 'Inhapim',
    rates: { eMile: 2.2 },
    routes: [{ city: 'Inhapim', packages: { eMile: 63 } }],
  },
  // 39 — Luis Fernando Ramos
  {
    name: 'Luis Fernando Ramos',
    route: 'Inhapim',
    rates: { eMile: 2.2 },
    routes: [{ city: 'Inhapim', packages: { eMile: 283 } }],
  },
  // 40 — Luiz Junior Correia
  {
    name: 'Luiz Junior Correia',
    route: 'Caratinga',
    rates: { eMile: 2 },
    routes: [{ city: 'Caratinga', packages: { eMile: 50 } }],
  },
  // 41 — Mario Cassemiro de Almeida Neto
  {
    name: 'Mario Cassemiro de Almeida Neto',
    route: 'Caratinga',
    rates: { eMile: 2.5 },
    routes: [{ city: 'Caratinga', packages: { eMile: 60 } }],
  },
  // 42 — Matheus Henrique Gomes Ferreira
  {
    name: 'Matheus Henrique Gomes Ferreira',
    route: 'Caratinga',
    rates: { eMile: 2 },
    routes: [{ city: 'Caratinga', packages: { eMile: 49 } }],
  },
  // 43 — Mikael Barbosa Do Carmo ( Cordeiro)
  {
    name: 'Mikael Barbosa Do Carmo ( Cordeiro)',
    route: 'Caratinga',
    rates: { eMile: 2.5 },
    routes: [{ city: 'Caratinga', packages: { eMile: 50 } }],
  },
  // 44 — Oliur Cunha do Nascimento
  {
    name: 'Oliur Cunha do Nascimento',
    route: 'São Domingos das Dores',
    rates: { eMile: 2.2 },
    routes: [{ city: 'São Domingos das Dores', packages: { eMile: 238 } }],
  },
  // 45 — Paulo Cesar Gonçalves
  {
    name: 'Paulo Cesar Gonçalves',
    route: 'Imbé de Minas',
    rates: { eMile: 2 },
    routes: [{ city: 'Imbé de Minas', packages: { eMile: 25 } }],
  },
  // 46 — Roberval Gomes
  {
    name: 'Roberval Gomes',
    route: 'Caratinga',
    rates: { eMile: 2 },
    routes: [{ city: 'Caratinga', packages: { eMile: 7 } }],
  },
  // 47 — Robson Silva Alves
  {
    name: 'Robson Silva Alves',
    route: 'Mutum',
    rates: { eMile: 2.15 },
    routes: [{ city: 'Mutum', packages: { eMile: 142 } }],
  },
  // 48 — Rodrigo Santos Tatibana
  {
    name: 'Rodrigo Santos Tatibana',
    route: 'Caratinga',
    rates: { eMile: 2.5 },
    routes: [{ city: 'Caratinga', packages: { eMile: 80 } }],
  },
  // 49 — Romario Alves Dornelas
  {
    name: 'Romario Alves Dornelas',
    route: 'Caratinga',
    rates: { eMile: 2 },
    routes: [{ city: 'Caratinga', packages: { eMile: 1172 } }],
  },
  // 50 — Tales Alexandre de Souza
  {
    name: 'Tales Alexandre de Souza',
    route: 'Inhapim',
    rates: { eMile: 2.2 },
    routes: [{ city: 'Inhapim', packages: { eMile: 214 } }],
  },
  // 51 — Thales Gomes Ferreira
  {
    name: 'Thales Gomes Ferreira',
    route: 'Caratinga',
    rates: { eMile: 2 },
    routes: [{ city: 'Caratinga', packages: { eMile: 222 } }],
  },
  // 52 — Thiago de Oliveira Inacio
  {
    name: 'Thiago de Oliveira Inacio',
    route: 'Caratinga',
    rates: { eMile: 2 },
    routes: [{ city: 'Caratinga', packages: { eMile: 32 } }],
  },
  // 53 — Tiago André Oliveira Costa
  {
    name: 'Tiago André Oliveira Costa',
    route: 'Pocrane',
    rates: { eMile: 2.5 },
    routes: [{ city: 'Pocrane', packages: { eMile: 403 } }],
  },
  // 54 — Vitor da Luz Costa
  {
    name: 'Vitor da Luz Costa',
    route: 'Mutum',
    rates: { eMile: 2.15 },
    routes: [{ city: 'Mutum', packages: { eMile: 182 } }],
  },
  // 55 — Wender Vieira de Carvalho da Silva
  {
    name: 'Wender Vieira de Carvalho da Silva',
    route: 'Caratinga',
    rates: { eMile: 2 },
    routes: [{ city: 'Caratinga', packages: { eMile: 144 } }],
  },
  // 56 — Wesley carlota Ramos de Sousa
  {
    name: 'Wesley carlota Ramos de Sousa',
    route: 'Caratinga',
    rates: { eMile: 2 },
    routes: [{ city: 'Caratinga', packages: { eMile: 8 } }],
  },
  // 57 — Winglison de Paiva da Silva
  {
    name: 'Winglison de Paiva da Silva',
    route: 'Ubaporanga',
    rates: { eMile: 2 },
    routes: [{ city: 'Ubaporanga', packages: { eMile: 524 } }],
  },
];
