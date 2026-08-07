/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      /**
       * A letra do app (07/08/2026, escolha do Victor: Inter).
       *
       * Antes daqui o projeto NÃO carregava fonte nenhuma: valia a pilha padrão do
       * Tailwind, ou seja, cada aparelho desenhava com a letra dele — Segoe UI no
       * Windows, Roboto no Android, San Francisco no iPhone. Ninguém tinha escolhido
       * nada, e em corpo pequeno (a tela tem 71 textos de 10-11px) o resultado saía
       * fino e lavado.
       *
       * O Preflight do Tailwind aplica `fontFamily.sans` no <html>, então declarar aqui
       * já troca a fonte do app inteiro — sem tocar em componente nenhum.
       *
       * A pilha antiga fica ATRÁS como rede: se por qualquer motivo o arquivo da fonte
       * não carregar, a tela continua legível em vez de cair no serifado do navegador.
       */
      fontFamily: {
        sans: [
          'Inter Variable',
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'Noto Sans',
          'sans-serif',
          'Apple Color Emoji',
          'Segoe UI Emoji',
          'Segoe UI Symbol',
          'Noto Color Emoji',
        ],
      },
    },
  },
  plugins: [],
};
