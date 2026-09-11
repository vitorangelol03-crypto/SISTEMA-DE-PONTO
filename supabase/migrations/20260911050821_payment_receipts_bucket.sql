-- ════════════════════════════════════════════════════════════════════════════
-- RECIBO DE PAGAMENTO — 2/3: O BUCKET PRIVADO
--
-- ✅ APLICADO em 11/09/2026. Falta só a policy dele: 20260911051000.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ---------- Bucket PRIVADO ----------
-- Documento com dinheiro de gente real: privado, como o dos espelhos. O
-- funcionario NUNCA le o bucket direto — so por URL assinada de curta duracao.
insert into storage.buckets (id, name, public)
values ('payment-receipts', 'payment-receipts', false)
on conflict (id) do nothing;

commit;
