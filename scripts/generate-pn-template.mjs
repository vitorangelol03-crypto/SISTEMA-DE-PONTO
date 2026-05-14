#!/usr/bin/env node
/**
 * Gera template Excel pra importação de funcionários da Ponte Nova.
 *
 * Mesmo formato do template gerado pela UI (src/utils/employeeImport.ts), mas
 * com defaults específicos de PN (cidade, estado) e linhas de exemplo
 * preenchidas com dados aceitáveis pra Ponte Nova.
 *
 * Uso:
 *   node scripts/generate-pn-template.mjs
 *   → cria `template-funcionarios-ponte-nova.xlsx` na raiz
 */
import XLSX from 'xlsx-js-style';
import { writeFileSync } from 'node:fs';

const TEMPLATE_HEADERS = [
  'nome*', 'cpf*', 'pix_chave', 'pix_tipo', 'employment_type',
  'endereco', 'bairro', 'cidade', 'estado', 'cep',
  'pin', 'funcao', 'cracha', 'pis', 'tipo_escala',
  'jornada_dom', 'jornada_seg', 'jornada_ter', 'jornada_qua', 'jornada_qui',
  'jornada_sex', 'jornada_sab', 'marcacoes_por_dia', 'data_admissao', 'tipo_contrato',
];

const COL_WIDTHS = [
  30, 15, 25, 12, 18, 30, 18, 18, 8, 12,
  8, 25, 10, 15, 15,
  12, 12, 12, 12, 12, 12, 12,
  18, 14, 16,
];

// Defaults pra Ponte Nova
const CIDADE = 'Ponte Nova';
const UF = 'MG';
const CONTRATO_PADRAO = 'CLT';

// Exemplo 1 — CLT padrão, jornada seg-sex 8h + sáb 4h
const example1 = [
  'MARIA DA SILVA EXEMPLO',
  '11144477735',         // CPF válido por algoritmo
  '11144477735',
  'CPF',
  'CLT',
  'RUA EXEMPLO, 123',
  'CENTRO',
  CIDADE,
  UF,
  '35430000',
  '1234',
  'AUXILIAR DE LOGÍSTICA',
  '001',
  '12056789010',         // PIS válido
  'Normal',
  0, 480, 480, 480, 480, 480, 240,   // dom=folga, seg-sex=8h, sáb=4h
  2,                      // 2 marcações/dia
  '01/01/2024',
  CONTRATO_PADRAO,
];

// Exemplo 2 — Escala 12x36 com 4 marcações
const example2 = [
  'JOÃO PEREIRA EXEMPLO',
  '52998224725',
  'joao@example.com',
  'Email',
  'CLT',
  '',
  '',
  CIDADE,
  UF,
  '',
  '5678',
  'VIGIA',
  '002',
  '11135568701',
  '12x36',
  0, 720, 0, 720, 0, 720, 0,   // 12h em dias alternados
  4,
  '15/03/2023',
  'CLT',
];

const emptyRow = new Array(TEMPLATE_HEADERS.length).fill('');

const data = [
  TEMPLATE_HEADERS,
  example1,
  example2,
  emptyRow,
];

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(data);
ws['!cols'] = COL_WIDTHS.map((wch) => ({ wch }));

// Estilo do cabeçalho: obrigatórios em vermelho, opcionais em azul
const headerRange = XLSX.utils.decode_range(ws['!ref'] || 'A1');
for (let col = headerRange.s.c; col <= headerRange.e.c; col++) {
  const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
  if (!ws[cellAddress]) continue;
  const isRequired = String(ws[cellAddress].v).endsWith('*');
  ws[cellAddress].s = {
    font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: isRequired ? 'C00000' : '4472C4' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  };
}

XLSX.utils.book_append_sheet(wb, ws, 'Funcionários');

// Sheet de instruções
const instructions = [
  ['INSTRUÇÕES DE IMPORTAÇÃO — PONTE NOVA'],
  [''],
  ['CAMPOS OBRIGATÓRIOS (marcados com *):'],
  ['  - nome: nome completo (mínimo 3 caracteres)'],
  ['  - cpf: 11 dígitos (com ou sem pontuação — 123.456.789-00 ou 12345678900)'],
  [''],
  ['CAMPOS RECOMENDADOS (úteis pra folha):'],
  ['  - pix_chave + pix_tipo: pra pagamento via C6 Bank'],
  ['  - employment_type: CLT, Diarista, PJ, etc.'],
  ['  - pis: 11 dígitos com dígito verificador — necessário pra espelho CLT'],
  ['  - data_admissao: DD/MM/AAAA (não pode ser futura)'],
  [''],
  ['CAMPOS DE JORNADA (em minutos):'],
  ['  - jornada_dom até jornada_sab: minutos trabalhados naquele dia'],
  ['  - 0 = folga, 480 = 8 horas, 240 = 4 horas (sábado típico)'],
  ['  - Se vazio, usa padrão da empresa'],
  [''],
  ['MARCAÇÕES POR DIA:'],
  ['  - 2 = entrada + saída (1 turno)'],
  ['  - 4 = entrada1, saída1 (almoço), entrada2, saída2 (2 turnos com almoço)'],
  ['  - Se vazio, usa padrão da empresa'],
  [''],
  ['PIX TIPO (com acento, exatamente):'],
  ['  - CPF, Email, Telefone, Aleatória'],
  [''],
  ['ESTADO (UF):'],
  ['  - 2 letras maiúsculas: MG (já pré-preenchido), SP, RJ, etc.'],
  [''],
  ['TIPO DE CONTRATO:'],
  ['  - CLT, PJ, Estagiário, Temporário, Diarista'],
  [''],
  ['TIPO DE ESCALA:'],
  ['  - Normal (seg-sex + sáb), 12x36, 6x1, etc.'],
  [''],
  ['CAMINHO DE IMPORTAÇÃO NO SISTEMA:'],
  ['  1. Login admin master 9999/684171 em https://sistema-ponto-zeta.vercel.app'],
  ['  2. CompanySelector → escolher Ponte Nova'],
  ['  3. Aba Funcionários → botão "Importar Excel" → escolher este arquivo'],
  ['  4. Validar preview (CPFs válidos, sem duplicatas) → Confirmar'],
  [''],
  ['DICAS:'],
  ['  - Use as 2 linhas de exemplo como referência'],
  ['  - Apague as linhas de exemplo antes de importar (ou só as 3 primeiras)'],
  ['  - Manter cidade=Ponte Nova e estado=MG nos exemplos pra agilizar'],
  ['  - PIN padrão (1234, 5678) pode ser alterado pelo funcionário no primeiro acesso'],
];

const wsInst = XLSX.utils.aoa_to_sheet(instructions);
wsInst['!cols'] = [{ wch: 90 }];
if (wsInst['A1']) {
  wsInst['A1'].s = {
    font: { bold: true, sz: 14, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '305496' } },
    alignment: { horizontal: 'center' },
  };
}
XLSX.utils.book_append_sheet(wb, wsInst, 'Instruções');

const filename = 'template-funcionarios-ponte-nova.xlsx';
const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
writeFileSync(filename, buf);

console.log(`✅ Template gerado: ${filename}`);
console.log(`   - Sheet "Funcionários": 25 colunas (cabeçalho + 2 exemplos + 1 linha vazia)`);
console.log(`   - Sheet "Instruções": guia completa de uso`);
console.log(`   - Defaults: cidade=${CIDADE}, estado=${UF}, contrato=${CONTRATO_PADRAO}`);
