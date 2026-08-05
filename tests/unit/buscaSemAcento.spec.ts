/**
 * Busca de entregador/rota/grupo IGNORANDO ACENTO (pedido do Victor, 04/08/2026).
 *
 * A busca comparava `toLowerCase().includes(...)` cru: quem digitava "jose" não
 * achava "José", "cha" não achava "Chalé" e "conceicao" não achava "Conceição".
 * Como quase todo nome de entregador e de rota da região tem acento, isso obrigava
 * a digitar acentuado no meio da correria.
 *
 * Nomes reais de produção nos casos abaixo — é neles que a busca precisa acertar.
 */
import { describe, it, expect } from 'vitest';
import { semAcento, contemSemAcento } from '../../src/utils/buscaTexto';

describe('semAcento', () => {
  it('tira acento e baixa a caixa', () => {
    expect(semAcento('José')).toBe('jose');
    expect(semAcento('CONCEIÇÃO')).toBe('conceicao');
    expect(semAcento('Chalé')).toBe('chale');
    expect(semAcento("Pingo-D'Água")).toBe("pingo-d'agua");
  });

  it('texto sem acento não muda (fora a caixa)', () => {
    expect(semAcento('Caratinga')).toBe('caratinga');
  });

  it('nulo/vazio viram string vazia em vez de quebrar', () => {
    expect(semAcento(null)).toBe('');
    expect(semAcento(undefined)).toBe('');
    expect(semAcento('')).toBe('');
  });
});

describe('contemSemAcento — nomes REAIS de produção', () => {
  it('🎯 digitando SEM acento acha quem TEM acento', () => {
    expect(contemSemAcento('Diego Nunes da Paixão', 'paixao')).toBe(true);
    expect(contemSemAcento('MÁRIO CASSEMIRO DE ALMEIDA NETO', 'mario')).toBe(true);
    expect(contemSemAcento('Caíque Rezende Valério nascimento', 'caique')).toBe(true);
    expect(contemSemAcento('JOÃO GABRIEL FERREIRA', 'joao')).toBe(true);
    expect(contemSemAcento('Angélica Caroline Gonçalves Nunes', 'angelica')).toBe(true);
  });

  it('digitando COM acento continua achando', () => {
    expect(contemSemAcento('Diego Nunes da Paixão', 'Paixão')).toBe(true);
    expect(contemSemAcento('JOÃO GABRIEL FERREIRA', 'João')).toBe(true);
  });

  it('rotas com acento: "cha" acha Chalé, "imbe" acha Imbé, "conceicao" acha Conceição', () => {
    expect(contemSemAcento('Chalé', 'cha')).toBe(true);
    expect(contemSemAcento('Imbé de Minas', 'imbe')).toBe(true);
    expect(contemSemAcento('Conceição de Ipanema', 'conceicao')).toBe(true);
    expect(contemSemAcento("Pingo-D'Água", 'agua')).toBe(true);
    expect(contemSemAcento('São Domingos das Dores', 'sao domingos')).toBe(true);
  });

  it('grupo com acento também', () => {
    expect(contemSemAcento('Patrocínio de Caratinga - Caratinga, MG', 'patrocinio')).toBe(true);
    expect(contemSemAcento('Ipanema, MG Jéssica', 'jessica')).toBe(true);
  });

  it('caixa não importa dos dois lados', () => {
    expect(contemSemAcento('josé', 'JOSE')).toBe(true);
    expect(contemSemAcento('JOSÉ', 'jose')).toBe(true);
  });

  it('continua NÃO achando quem realmente não bate', () => {
    expect(contemSemAcento('José da Silva', 'maria')).toBe(false);
    expect(contemSemAcento('Chalé', 'chile')).toBe(false);
  });

  it('busca em branco casa com tudo (campo vazio não filtra)', () => {
    expect(contemSemAcento('qualquer nome', '')).toBe(true);
    expect(contemSemAcento('qualquer nome', '   ')).toBe(true);
  });

  it('nome nulo (sem rota / sem grupo) não quebra e não casa', () => {
    expect(contemSemAcento(null, 'jose')).toBe(false);
    expect(contemSemAcento(undefined, 'jose')).toBe(false);
    // ...mas com busca vazia casa, senão quem não tem grupo sumiria da lista.
    expect(contemSemAcento(null, '')).toBe(true);
  });

  it('⚠️ NÃO é o normalizeDriverName: prefixo e parênteses continuam buscáveis', () => {
    // `normalizeDriverName` (driverNameMatch) removeria "87191-", "(DUTRA)" e "XPT" —
    // serve pra CASAR planilha com cadastro. Numa busca livre isso atrapalharia:
    // procurar "xpt" ou pelo código deixaria de achar.
    expect(contemSemAcento('87191-XPT (DUTRA) GERSON BOTELHO DE SOUSA', 'xpt')).toBe(true);
    expect(contemSemAcento('87191-XPT (DUTRA) GERSON BOTELHO DE SOUSA', '87191')).toBe(true);
    expect(contemSemAcento('87191-XPT (DUTRA) GERSON BOTELHO DE SOUSA', 'dutra')).toBe(true);
  });
});
