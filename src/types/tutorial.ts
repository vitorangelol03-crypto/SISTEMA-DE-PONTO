export interface TutorialStep {
  title: string;
  description: string;
  tips?: string[];
}

export interface TutorialUseCase {
  title: string;
  description: string;
  example: string;
}

export interface Tutorial {
  id: string;
  category: string;
  title: string;
  description: string;
  icon: string;
  requiredPermission: string;
  steps: TutorialStep[];
  useCases: TutorialUseCase[];
  tips?: string[];
}

export interface TutorialCategory {
  id: string;
  name: string;
  icon: string;
  tutorials: Tutorial[];
}

export interface FeatureVersion {
  id: string;
  feature_key: string;
  version: string;
  release_date: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface TutorialSearchResult {
  tutorial: Tutorial;
  matchedIn: 'title' | 'description' | 'content';
}
