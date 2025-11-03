import * as XLSX from 'xlsx';

interface PaymentRow {
  employeeName: string;
  pixKey: string;
  amount: number;
  paymentDate: string;
  description: string;
}

export const exportC6PaymentSheet = async (paymentRows: PaymentRow[]) => {
  try {
    const workbook = XLSX.utils.book_new();

    const sheetData: any[][] = [];

    sheetData.push(['', '', '', '', '', '', '', '', '', '', '2', '', '', '']);
    sheetData.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['REGRAS DE PREENCHIMENTO', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['É importante que todas as regras sejam seguidas no momento do preenchimento da planilha para que os pagamentos sejam incluídos e efetivados:', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['1. Não altere o template deste arquivo. Isso inclui não adicionar ou remover linhas, colunas e abas, assim como não alterar o nome dos campos;', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['2. Para colar as informações de outra base, basta copiar os dados da planilha de origem, colar nesta planilha clicando com o botão direito do mouse selecionando  "Opções de colagem" e marcado a opção de colar  valores ("123", conforme imagem abaixo); ', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['3. Insira os pagamentos a partir da linha 3;', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['4. Não deixe nenhuma linha em branco entre os pagamentos;', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['5. O preenchimento é obrigatório em todos os campos, exceto nas colunas descritas como "opcional";', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['6. Só é possível utilizar caracteres especiais no campo "chave ou código Pix";', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['7. Caso o valor não seja preenchido, o sistema entenderá como R$0,00. Os centavos que não forem mencionados, o sistema também entenderá como ,00;', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['8. Os pagamentos podem ser incluídos para a data de hoje e agendados para até 1 ano;', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['9. Para datas, utilize o formato dd/mm/aaaa.', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['10. Para chave celular, favor sempre usar no seguinte layout +5511912345678', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['11. O campo "nome do recebedor" não irá refletir no comprovante de pagamento. Apenas o que for mencionado no campo "descrição".', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['12. No comprovante de pagamento constarão os dados do beneficiário da chave Pix ou Conta informados, e também as informações inseridas do campo "Descrição".', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['13. Dicas de uso para o campo "Descrição": informar a descrição de "Pagamento de Salário"// Ou informar neste campo o nome do funcionário quando a chave ou conta informada corresponder a outra pessoa.', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['EXEMPLO - PIX CHAVE OU CÓDIGO', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['DADOS DO PAGAMENTO', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['Chave ou código Pix', 'Valor', 'Data de pagamento', 'Descrição (opcional)', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['65784637898', '1038.57', '6/29/2025', 'Pagamento de salário', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['c6bank@c6bank.com', '255.47', '6/29/2025', 'Pagamento de salário', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['+5511912345678', '145.12', '6/30/2025', 'Pagamento de salário', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '']);

    paymentRows.forEach((row) => {
      sheetData.push([
        row.pixKey,
        row.amount,
        formatDateForC6(row.paymentDate),
        row.description || 'Pagamento de salário',
        '', '', '', '', '', '', '', '', '', ''
      ]);
    });

    sheetData.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['EXEMPLO - PIX AGÊNCIA E CONTA', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['DADOS DO PAGAMENTO', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['Nome', 'CPF/CNPJ', 'Banco (ISPB)', 'Tipo de conta', 'Agência', 'Conta e dígito', 'Valor', 'Data de pagamento', 'Descrição (opcional)', '', '', '', '', '']);
    sheetData.push(['Luiz Souza', '99999999999', '31872495', 'Conta Corrente', '123', '99999999', '385.33', '6/29/2025', 'Pagamento de salário', '', '', '', '', '']);
    sheetData.push(['Lucas Oliveira', '11111111111', '31872495', 'Conta Poupança', '4567', '11111111', '4184.94', '6/29/2025', 'Pagamento de salário', '', '', '', '', '']);
    sheetData.push(['Luiza Alves', '88888888888', '31872495', 'Conta Pagamento', '1111', '88888888', '123.45', '6/29/2025', 'Pagamento de salário', '', '', '', '', '']);
    sheetData.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['LISTA DE ISPBs', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['BANCO', 'ISPB', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['C6 Bank', '31872495', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['Banco BMG', '61186680', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['Banco Bradesco', '60746948', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['Banco BRB', ' 00000208', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['Banco Caixa', '360305', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['Banco do Brasil', ' 00000000', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['Banco Inter', '416968', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['Banco Itaú', '60701190', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['Banco iti', '60701190', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['Banco Mercado Pago', '10573521', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['Banco Nubank (Nu Pagamentos)', '18236120', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['Banco Original', '92894922', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['Banco Pagbank (Pagseguro)', '8561701', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['Banco Santander', '90400888', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['Banco Sicoob', '2038232', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['Banco Sicredi', '1181521', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheetData.push(['Picpay', '22896431', '', '', '', '', '', '', '', '', '', '', '', '']);

    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

    const columnWidths = [
      { wch: 35 }, // A
      { wch: 15 }, // B
      { wch: 20 }, // C
      { wch: 30 }, // D
      { wch: 10 }, // E
      { wch: 10 }, // F
      { wch: 10 }, // G
      { wch: 10 }, // H
      { wch: 10 }, // I
      { wch: 10 }, // J
      { wch: 10 }, // K
      { wch: 10 }, // L
      { wch: 10 }, // M
      { wch: 10 }  // N
    ];
    worksheet['!cols'] = columnWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Pagamentos');

    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    const filename = `c6-pagamento-salarios-${dateStr}.xlsx`;

    XLSX.writeFile(workbook, filename);
  } catch (error) {
    console.error('Erro ao gerar planilha:', error);
    throw error;
  }
};

const formatDateForC6 = (dateString: string): string => {
  const date = new Date(dateString + 'T00:00:00');
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
};
