import { cleanupAllTestArtifacts } from './cleanup';

/**
 * Ao final da suíte inteira, apaga o que sobrou de TESTE (redundante com os afterAll dos specs —
 * é um seguro extra, que pega também a sobra de rodada morta).
 *
 * 05/10/2026: a limpeza é SÓ por dono de teste (funcionário/empresa 'PW Test …') — antes ela
 * apagava por horário e levava dado real de todas as empresas junto (ver limparLinhasDeTeste).
 */
export default async function globalTeardown() {
  try {
    const apagadas = await cleanupAllTestArtifacts();
    const resumo = Object.entries(apagadas).map(([tabela, n]) => `${tabela}=${n}`).join(' ') || 'nada';
    console.log(`\n[cleanup] Linhas de TESTE removidas: ${resumo}. Dado real não é tocado.`);
  } catch (err) {
    console.error('[cleanup] Falha ao limpar artefatos de teste:', err);
  }
}
