export const validateCPF = (cpf: string | null | undefined): boolean => {
  if (!cpf) return false;
  // Remove caracteres não numéricos
  cpf = cpf.replace(/[^\d]/g, '');
  
  if (cpf.length !== 11) return false;
  
  // Verifica se todos os dígitos são iguais
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  
  // Valida primeiro dígito
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf[i]) * (10 - i);
  }
  let digit1 = (sum * 10) % 11;
  if (digit1 === 10) digit1 = 0;
  if (digit1 !== parseInt(cpf[9])) return false;
  
  // Valida segundo dígito
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf[i]) * (11 - i);
  }
  let digit2 = (sum * 10) % 11;
  if (digit2 === 10) digit2 = 0;
  if (digit2 !== parseInt(cpf[10])) return false;
  
  return true;
};

export const formatCPF = (cpf: string | null | undefined): string => {
  if (!cpf) return '';
  cpf = cpf.replace(/[^\d]/g, '');
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
};

export const isValidPassword = (password: string): boolean => {
  return password.length >= 4;
};

export const isNumericString = (str: string): boolean => {
  return /^\d+$/.test(str);
};

// Sub-fase: cadastro público de funcionário (26/08) — pedido explícito do
// Victor: nome, CPF, telefone e chave PIX sem acento, traço ou ponto (mesmo
// sabendo que isso pode deixar e-mail/chave aleatória com formato estranho;
// ele confirmou que quer assim mesmo — ajuste manual na aprovação se precisar).
export const stripAccentsDashesDots = (value: string): string => {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // acentos (á, ç, ã, õ, ü...)
    .replace(/[.-]/g, ''); // ponto e traço
};

export const sanitizePublicRegistrationName = (value: string): string => {
  return stripAccentsDashesDots(value).replace(/\s+/g, ' ').trim();
};

export const sanitizePublicRegistrationPixKey = (value: string): string => {
  return stripAccentsDashesDots(value).trim();
};

export const sanitizePhoneDigits = (value: string): string => {
  return value.replace(/\D/g, '').slice(0, 11);
};

export const validatePhoneDigits = (digits: string): boolean => {
  return digits.length === 10 || digits.length === 11;
};

export const formatPhoneDisplay = (digits: string | null | undefined): string => {
  if (!digits) return '';
  const d = digits.replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return d;
};