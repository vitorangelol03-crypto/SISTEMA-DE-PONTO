export const sanitizeString = (input: string): string => {
  if (!input) return '';

  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

export const sanitizeNumber = (input: string | number): number => {
  const num = typeof input === 'string' ? parseFloat(input) : input;
  return isNaN(num) ? 0 : num;
};

export const sanitizeInteger = (input: string | number): number => {
  const num = typeof input === 'string' ? parseInt(input, 10) : Math.floor(input);
  return isNaN(num) ? 0 : num;
};

export const trimAndSanitize = (input: string): string => {
  return sanitizeString(input.trim());
};

export const sanitizeObservations = (input: string): string => {
  if (!input || !input.trim()) return '';

  const trimmed = input.trim();
  const maxLength = 500;

  const sanitized = sanitizeString(trimmed);

  return sanitized.length > maxLength
    ? sanitized.substring(0, maxLength) + '...'
    : sanitized;
};
