-- Sub-fase 7.3 (TECH_DEBT D6=C): DROP TABLE bonus_defaults.
--
-- Tabela legacy substituída integralmente por bonus_types (multi-empresa).
--
-- Pre-checks executados em 2026-05-11 via MCP:
--   1. Dump completo de bonus_defaults salvo em
--      docs/bonus_defaults_legacy_dump_2026-05-11.json (audit trail).
--   2. Caratinga em bonus_types tem MESMOS valores de bonus_defaults
--      (B=15, C1=20, C2=15) — DROP não perde dados.
--   3. Ponte Nova nunca teve rows em bonus_defaults — sempre usou bonus_types.
--   4. Callers do código já migrados pra usar só bonus_types
--      (mesmo commit). Smoke test em 17-bonus-complete:67-72 removido.
--
-- Validações pós-DROP:
--   - information_schema.tables NÃO contém mais bonus_defaults
--   - SELECT em bonus_types retorna valores idênticos pra ambas empresas

DROP TABLE IF EXISTS public.bonus_defaults;
