import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 🔴 A TRAVA DO BUILD QUE PASSA AQUI E QUEBRA NO AR (11/09/2026).
 *
 * O `.vercelignore` decide o que a Vercel NÃO recebe. Se um arquivo de `src/`
 * importar algo que está nessa lista, o build LOCAL passa (o arquivo está aqui)
 * e o da Vercel quebra com `Could not resolve` — e o deploy morre depois do
 * push, com tudo já validado.
 *
 * Aconteceu de verdade: `src/utils/nfSplit.ts` reexporta
 * `repartirLiquidoPorTomador` de `supabase/functions/driver-public-api/nfCheck.ts`
 * (de propósito: o robô e o relatório têm que usar a MESMA conta), e o
 * `.vercelignore` ignorava `supabase` inteiro.
 *
 * Este teste percorre os imports RELATIVOS de `src/` e reprova qualquer um que
 * aponte pra fora de `src/` e caia numa pasta ignorada.
 */

const RAIZ = path.resolve(__dirname, '../..');

/** As linhas do `.vercelignore` que são padrão de verdade (sem comentário/vazio). */
function padroesIgnorados(): string[] {
  const txt = fs.readFileSync(path.join(RAIZ, '.vercelignore'), 'utf8');
  return txt
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

/** Todo `.ts`/`.tsx` de `src/`. */
function arquivosDoSrc(dir = path.join(RAIZ, 'src'), acc: string[] = []): string[] {
  for (const nome of fs.readdirSync(dir)) {
    const p = path.join(dir, nome);
    if (fs.statSync(p).isDirectory()) arquivosDoSrc(p, acc);
    else if (/\.tsx?$/.test(nome)) acc.push(p);
  }
  return acc;
}

/** Os caminhos relativos importados por um arquivo (`import … from '...'`, `export … from '...'`). */
function importsRelativos(arquivo: string): string[] {
  const src = fs.readFileSync(arquivo, 'utf8');
  const achados: string[] = [];
  const re = /(?:^|\n)\s*(?:import|export)[^'"\n]*from\s*['"](\.[^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) achados.push(m[1]);
  // `import('...')` dinâmico (usado no lazy/`await import`).
  const reDin = /\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  while ((m = reDin.exec(src)) !== null) achados.push(m[1]);
  return achados;
}

/** O import cai dentro de alguma pasta que a Vercel não recebe? */
function caiEmPastaIgnorada(destinoRelativoARaiz: string, padroes: string[]): string | null {
  const partes = destinoRelativoARaiz.split(path.sep);
  for (const padrao of padroes) {
    const alvo = padrao.replace(/\/+$/, '').split('/');
    if (alvo.every((seg, i) => partes[i] === seg)) return padrao;
  }
  return null;
}

describe('.vercelignore não pode esconder nada que o src importa', () => {
  it('🎯 nenhum arquivo de src/ importa de uma pasta ignorada pela Vercel', () => {
    const padroes = padroesIgnorados();
    const problemas: string[] = [];

    for (const arquivo of arquivosDoSrc()) {
      for (const imp of importsRelativos(arquivo)) {
        const destino = path.resolve(path.dirname(arquivo), imp);
        const relativo = path.relative(RAIZ, destino);
        // Dentro de src/ nunca é problema — src/ não está no .vercelignore.
        if (relativo.startsWith(`src${path.sep}`)) continue;
        const padrao = caiEmPastaIgnorada(relativo, padroes);
        if (padrao) {
          problemas.push(
            `${path.relative(RAIZ, arquivo)} importa "${imp}" → ${relativo}, `
            + `que está em "${padrao}" no .vercelignore. O build da Vercel não vai achar.`,
          );
        }
      }
    }

    expect(problemas, problemas.join('\n')).toEqual([]);
  });

  it('o import que causou o problema real continua resolvendo', () => {
    // `src/utils/nfSplit.ts` → `supabase/functions/driver-public-api/nfCheck.ts`
    const alvo = path.join(RAIZ, 'supabase/functions/driver-public-api/nfCheck.ts');
    expect(fs.existsSync(alvo), 'o nfCheck.ts tem que existir').toBe(true);
    expect(
      caiEmPastaIgnorada(path.relative(RAIZ, alvo), padroesIgnorados()),
      'e NÃO pode estar numa pasta ignorada',
    ).toBeNull();
  });
});
