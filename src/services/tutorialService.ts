import { supabase } from '../lib/supabase';
import { FeatureVersion } from '../types/tutorial';

export async function getFeatureVersions(): Promise<FeatureVersion[]> {
  const { data, error } = await supabase
    .from('feature_versions')
    .select('*')
    .order('feature_key', { ascending: true });

  if (error) {
    console.error('Erro ao buscar versões de funcionalidades:', error);
    return [];
  }

  return data || [];
}

export async function isFeatureNew(featureKey: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('feature_versions')
    .select('release_date')
    .eq('feature_key', featureKey)
    .single();

  if (error || !data) {
    return false;
  }

  const releaseDate = new Date(data.release_date);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  return releaseDate >= thirtyDaysAgo;
}

export async function getNewFeaturesCount(): Promise<number> {
  const { data, error } = await supabase
    .from('feature_versions')
    .select('release_date');

  if (error || !data) {
    return 0;
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const newFeatures = data.filter(feature => {
    const releaseDate = new Date(feature.release_date);
    return releaseDate >= thirtyDaysAgo;
  });

  return newFeatures.length;
}

export async function updateFeatureVersion(
  featureKey: string,
  version: string,
  description?: string
): Promise<boolean> {
  const { error } = await supabase
    .from('feature_versions')
    .update({
      version,
      description,
      release_date: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('feature_key', featureKey);

  if (error) {
    console.error('Erro ao atualizar versão:', error);
    return false;
  }

  return true;
}
