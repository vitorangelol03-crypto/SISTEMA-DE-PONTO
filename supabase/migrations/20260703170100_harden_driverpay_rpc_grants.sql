-- Hardening: revoga EXECUTE de PUBLIC/anon nas RPCs driverpay (SECURITY DEFINER).
-- Mantem apenas authenticated + service_role (o app chama autenticado). Fecha o
-- advisor "anon can execute SECURITY DEFINER function" das duas RPCs novas.
REVOKE EXECUTE ON FUNCTION public.driverpay_create_period(uuid,text,text,date,date,boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.driverpay_create_period(uuid,text,text,date,date,boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.driverpay_conclude_period(uuid,uuid,text,text,date,date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.driverpay_conclude_period(uuid,uuid,text,text,date,date) FROM anon;
GRANT EXECUTE ON FUNCTION public.driverpay_create_period(uuid,text,text,date,date,boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driverpay_conclude_period(uuid,uuid,text,text,date,date) TO authenticated, service_role;
