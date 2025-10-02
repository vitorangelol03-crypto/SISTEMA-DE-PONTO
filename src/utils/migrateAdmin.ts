import { supabase } from '../lib/supabase';

export const migrateAdminToAuth = async (): Promise<boolean> => {
  try {
    const { data: adminUser, error: adminError } = await supabase
      .from('users')
      .select('*')
      .eq('id', '9999')
      .maybeSingle();

    if (adminError || !adminUser) {
      console.log('Admin não encontrado ou erro ao buscar:', adminError);
      return false;
    }

    if (adminUser.auth_user_id) {
      console.log('Admin já migrado para Supabase Auth');
      return true;
    }

    console.log('Admin encontrado sem auth_user_id, criando no Supabase Auth...');

    const email = '9999@sistema.local';
    const password = '684171';

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          matricula: '9999',
          role: 'admin'
        },
        emailRedirectTo: undefined
      }
    });

    if (authError) {
      console.error('Erro ao criar admin no Auth:', authError);
      return false;
    }

    if (!authData.user) {
      console.error('Usuário não foi criado no Auth');
      return false;
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({
        auth_user_id: authData.user.id,
        email,
        password: null
      })
      .eq('id', '9999');

    if (updateError) {
      console.error('Erro ao atualizar admin na tabela users:', updateError);
      await supabase.auth.admin.deleteUser(authData.user.id);
      return false;
    }

    console.log('Admin migrado com sucesso para Supabase Auth!');
    return true;

  } catch (error) {
    console.error('Erro durante migração do admin:', error);
    return false;
  }
};
