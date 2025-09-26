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

export const formatTimestampForExcel = (timestamp: string, date: string): string => {
  // Para o Excel, vamos mostrar apenas a data da marcação + horário atual
  // já que o timestamp do banco pode estar em UTC
  const currentTime = new Date().toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  
  return `${formatDateBR(date)} ${currentTime}`;
};