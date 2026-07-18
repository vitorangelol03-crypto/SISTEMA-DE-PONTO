/**
 * Tipos e resumo (puro) da APLICACAO de um import de planilha a um periodo.
 *
 * O leitor (driverSheetImport) produz agregados por (entregador, cidade, plataforma).
 * A tela resolve cada entregador (match automatico, vinculo manual, criar novo ou
 * ignorar) e monta os `ImportResolvedItem`. A gravacao (applyDriverImport, no
 * service) executa: cria drivers novos, aprende apelidos e lanca os pacotes no
 * periodo com a taxa ja cadastrada.
 *
 * `summarizeDriverImport` e puro (sem IO) para a tela mostrar o "vai acontecer"
 * antes de confirmar e para ser testavel.
 */

export type ImportResolution =
  | { kind: 'existing'; driverId: string; driverName: string; learnAlias: boolean }
  | { kind: 'create'; name: string }
  | { kind: 'ignore' };

/** Um agrupamento (entregador, cidade, plataforma) ja resolvido pela tela. */
export interface ImportResolvedItem {
  /** Nome/login como veio na planilha. */
  driverRaw: string;
  /** Chave normalizada para gravar/consultar o apelido. */
  aliasNorm: string;
  city: string;
  /** Nome da plataforma no sistema (eMile / SHOPEE / Coleta Shopee / ANJUN). */
  platform: string;
  packages: number;
  resolution: ImportResolution;
}

export interface ImportSummary {
  driversToCreate: number;
  driversAffected: number;
  packages: number;
  aliasesToLearn: number;
  ignored: number;
}

export interface ImportApplyResult {
  driversCreated: number;
  aliasesLearned: number;
  packagesApplied: number;
  driversAffected: number;
  ignored: number;
}

/** Resumo do que a aplicacao VAI fazer (para a previa/confirmacao na tela). */
export function summarizeDriverImport(items: ImportResolvedItem[]): ImportSummary {
  const toCreate = new Set<string>(); // driverRaw dos "create" (dedup por entregador)
  const affected = new Set<string>(); // driverId existentes + marcador dos novos
  let packages = 0;
  let aliasesToLearn = 0;
  let ignored = 0;

  for (const it of items) {
    if (it.resolution.kind === 'ignore') {
      ignored += 1;
      continue;
    }
    packages += it.packages;
    if (it.resolution.kind === 'create') {
      toCreate.add(it.driverRaw);
      affected.add(`new:${it.driverRaw}`);
    } else {
      affected.add(it.resolution.driverId);
      if (it.resolution.learnAlias) aliasesToLearn += 1;
    }
  }
  // cada driver novo tambem aprende o proprio apelido (1x por entregador)
  aliasesToLearn += toCreate.size;

  return {
    driversToCreate: toCreate.size,
    driversAffected: affected.size,
    packages,
    aliasesToLearn,
    ignored,
  };
}
