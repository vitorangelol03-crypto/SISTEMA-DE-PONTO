/*
  # Criar usuário admin no Supabase Auth

  1. Processo
    - Cria o usuário 9999@sistema.local no auth.users com senha 684171
    - Vincula o registro na tabela public.users com o auth_user_id
    - Remove a senha em texto plano da tabela public.users
*/

DO $$
DECLARE
  admin_auth_id uuid;
  admin_exists_in_auth boolean;
BEGIN
  -- Verificar se usuário já existe no auth.users
  SELECT id INTO admin_auth_id
  FROM auth.users
  WHERE email = '9999@sistema.local';
  
  IF admin_auth_id IS NULL THEN
    -- Criar usuário no auth.users com senha criptografada
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      '9999@sistema.local',
      crypt('684171', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"],"matricula":"9999","role":"admin"}'::jsonb,
      '{"matricula":"9999","role":"admin"}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    )
    RETURNING id INTO admin_auth_id;
    
    -- Atualizar tabela public.users com auth_user_id
    UPDATE public.users
    SET 
      auth_user_id = admin_auth_id,
      password = NULL
    WHERE id = '9999';
    
    RAISE NOTICE 'Admin user created in Supabase Auth with ID: %', admin_auth_id;
  ELSE
    -- Apenas atualizar o vínculo se já existe
    UPDATE public.users
    SET 
      auth_user_id = admin_auth_id,
      password = NULL
    WHERE id = '9999' AND auth_user_id IS NULL;
    
    RAISE NOTICE 'Admin user already exists in Auth, updated link';
  END IF;
END $$;
