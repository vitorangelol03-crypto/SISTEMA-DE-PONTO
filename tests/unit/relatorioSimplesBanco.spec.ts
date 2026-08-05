/**
 * RELATÓRIO SIMPLES no formato da planilha do BANCO (05/08/2026).
 *
 * Pedido do Victor, com o print do template do banco aberto: *"quero que a planilha
 * simples, o relatório simples, saia nesse padrão dessas colunas: A nome sem acento,
 * B chave pix, C valor, D data, E descrição"*.
 *
 * 🔑 O template do banco diz "Não altere o template deste arquivo" — o caminho é copiar
 * A:E daqui e colar lá. Por isso a ORDEM é o que mais importa: uma coluna fora de lugar
 * paga o valor errado pra pessoa errada. É isso que este teste tranca.
 */
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildSimpleSheet, dataDePagamentoHoje } from '../../src/utils/driverReport';

const META = {
  companyName: 'CD Logistica',
  periodLabel: '1 quinzena de julho',
  platforms: ['SHOPEE'],
  generatedAt: '05/08/2026 18:00',
  dataPagamento: '05/08/2026',
};

const LINHAS = [
  { name: 'CLAUDIOMAR BORGES SILVA', total: 1234.5, pix: '123.456.789-09' },
  { name: 'Andrea dos Santos Ramos', total: 987.65, pix: 'andrea@email.com' },
];

/** Lê a célula como texto/número cru. */
const cel = (ws: XLSX.WorkSheet, ref: string) => (ws[ref] as { v?: unknown } | undefined)?.v;

describe('relatório simples — colunas do banco', () => {
  const ws = buildSimpleSheet(LINHAS, META);

  it('🎯 o cabeçalho está na ordem do banco: nome, chave, valor, data, descrição', () => {
    expect(cel(ws, 'A4')).toBe('Nome do funcionario');
    expect(cel(ws, 'B4')).toBe('Chave ou codigo Pix');
    expect(cel(ws, 'C4')).toBe('Valor');
    expect(cel(ws, 'D4')).toBe('Data de pagamento');
    expect(cel(ws, 'E4')).toBe('Descricao');
  });

  it('🎯 a 1ª linha de dados sai na mesma ordem', () => {
    expect(cel(ws, 'A5')).toBe('CLAUDIOMAR BORGES SILVA');
    expect(cel(ws, 'B5')).toBe('12345678909'); // CPF só com números
    expect(cel(ws, 'C5')).toBe(1234.5);
    expect(cel(ws, 'D5')).toBe('05/08/2026');
    expect(cel(ws, 'E5')).toBe('1 quinzena de julho');
  });

  it('🔴 valor sai como NÚMERO, não texto — senão o banco não soma', () => {
    expect(typeof cel(ws, 'C5')).toBe('number');
    expect(typeof cel(ws, 'C6')).toBe('number');
  });

  it('🔴 chave que NÃO é CPF/CNPJ sai intacta (e-mail, aleatória)', () => {
    // Limpar o e-mail ou a chave aleatória quebraria o pagamento.
    expect(cel(ws, 'B6')).toBe('andrea@email.com');
  });

  it('o total geral soma a coluna C (a do valor), não a B', () => {
    const total = ws['C7'] as { f?: string } | undefined;
    expect(total?.f).toBe('SUM(C5:C6)');
  });

  it('quinzena com filtro de plataforma vai junto na descrição', () => {
    // Dois pagamentos da mesma quinzena não podem ficar iguais no extrato do entregador.
    const w = buildSimpleSheet(LINHAS, { ...META, platformFilterLabel: 'LOGGI' });
    expect(String(cel(w, 'E5'))).toContain('LOGGI');
  });

  it('sem data informada, usa HOJE em DD/MM/AAAA', () => {
    const w = buildSimpleSheet(LINHAS, { ...META, dataPagamento: undefined });
    expect(String(cel(w, 'D5'))).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('dataDePagamentoHoje formata com zero à esquerda', () => {
    expect(dataDePagamentoHoje(new Date(2026, 0, 9))).toBe('09/01/2026');
    expect(dataDePagamentoHoje(new Date(2026, 11, 25))).toBe('25/12/2026');
  });

  it('lista vazia não quebra (total zero)', () => {
    const w = buildSimpleSheet([], META);
    expect(cel(w, 'A5')).toBe('TOTAL GERAL');
    expect(cel(w, 'C5')).toBe(0);
  });
});
