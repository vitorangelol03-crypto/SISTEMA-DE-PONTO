export const getBrazilDate = (): string => {
  return new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Sao_Paulo'
  });
};

export const getBrazilDateTime = (): Date => {
  const nowInBrazil = new Date().toLocaleString('en-US', {
    timeZone: 'America/Sao_Paulo'
  });
  return new Date(nowInBrazil);
};

export const formatDateBR = (dateString: string): string => {
  if (!dateString) return '';
  return dateString.split('-').reverse().join('/');
};

export const formatDateTimeBR = (dateTime: string): string => {
  if (!dateTime) return '';
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
  if (!timestamp) return '';
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

export const getCurrentTimestamp = (): string => {
  return new Date().toISOString();
};

export const compareDates = (date1: string, date2: string): number => {
  const d1 = new Date(date1 + 'T00:00:00');
  const d2 = new Date(date2 + 'T00:00:00');
  return d1.getTime() - d2.getTime();
};

export const isDateInRange = (date: string, startDate: string, endDate: string): boolean => {
  const dateTime = new Date(date + 'T00:00:00').getTime();
  const startTime = new Date(startDate + 'T00:00:00').getTime();
  const endTime = new Date(endDate + 'T23:59:59').getTime();
  return dateTime >= startTime && dateTime <= endTime;
};
