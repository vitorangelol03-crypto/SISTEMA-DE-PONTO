// Utilitários para manipulação de datas com timezone do Brasil

export const getBrazilDate = (): string => {
  const now = new Date();
  const brazilOffset = -3 * 60; // UTC-3 em minutos
  const localTime = new Date(now.getTime() + (brazilOffset * 60 * 1000));
  return localTime.toISOString().split('T')[0];
};

export const getBrazilDateTime = (): Date => {
  const now = new Date();
  const brazilOffset = -3 * 60; // UTC-3 em minutos
  return new Date(now.getTime() + (brazilOffset * 60 * 1000));
};

export const formatDateBR = (dateString: string): string => {
  // Converter YYYY-MM-DD para DD/MM/YYYY
  return dateString.split('-').reverse().join('/');
};

export const formatDateTimeBR = (dateTime: string): string => {
  return new Date(dateTime).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const getCurrentBrazilTime = (): string => {
  return new Date().toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
};

export const formatTimestampForExcel = (timestamp: string): string => {
  return new Date(timestamp).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};
/**
 * A SEMANA (segunda a domingo) que contém uma data — só com contas de calendário.
 *
 * 🔴 POR QUE ISTO EXISTE (12/09/2026). A criação automática de semanas fazia:
 *
 *     const monday = new Date(today);
 *     monday.setDate(today.getDate() + offsetToMonday);
 *     const mondayStr = monday.toISOString().slice(0, 10);   // ⬅ o erro
 *
 * `toISOString()` converte pra **UTC**. No Brasil (UTC−3), toda hora local a
 * partir das 21h já é o dia SEGUINTE em UTC — então a segunda-feira 07/09 saía
 * gravada como "08/09". O resultado é uma semana deslocada um dia, **sobreposta**
 * à que já existia, e dia com dois donos.
 *
 * Isso não é teoria: em 12/09/2026, às 23h18, a criação automática gerou
 * "Semana 08/09 a 14/09" na Ponte Nova em cima da "Semana 07/09 a 13/09". E é a
 * mesma doença por trás do erro de R$ 82.980 em Caratinga, onde semanas
 * sobrepostas faziam o mesmo lançamento contar em dois meses.
 *
 * A conta aqui é feita inteira em UTC, sobre uma data que JÁ é a do Brasil, e
 * por isso não tem fuso pra atrapalhar: entra "YYYY-MM-DD", sai "YYYY-MM-DD".
 */
export const semanaDaData = (dataISO: string): { segunda: string; domingo: string } => {
  const d = new Date(`${dataISO}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`semanaDaData: data inválida "${dataISO}"`);
  }
  const diaDaSemana = d.getUTCDay(); // 0=domingo, 1=segunda…
  const paraSegunda = diaDaSemana === 0 ? -6 : 1 - diaDaSemana;

  const segunda = new Date(d);
  segunda.setUTCDate(d.getUTCDate() + paraSegunda);
  const domingo = new Date(segunda);
  domingo.setUTCDate(segunda.getUTCDate() + 6);

  return {
    segunda: segunda.toISOString().slice(0, 10),
    domingo: domingo.toISOString().slice(0, 10),
  };
};
