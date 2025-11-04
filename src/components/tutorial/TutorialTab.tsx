import React, { useState, useEffect, useMemo } from 'react';
import { Search, BookOpen, Sparkles } from 'lucide-react';
import { tutorialsContent } from '../../data/tutorialContent';
import { Tutorial } from '../../types/tutorial';
import { TutorialCard } from './TutorialCard';
import { TutorialDetail } from './TutorialDetail';
import { isFeatureNew } from '../../services/tutorialService';
import { PERMISSION_LABELS } from '../../types/permissions';

interface TutorialTabProps {
  hasPermission: (permission: string) => boolean;
}

export const TutorialTab: React.FC<TutorialTabProps> = ({ hasPermission }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTutorial, setSelectedTutorial] = useState<Tutorial | null>(null);
  const [newFeatures, setNewFeatures] = useState<Set<string>>(new Set());

  useEffect(() => {
    const checkNewFeatures = async () => {
      const newFeaturesSet = new Set<string>();

      for (const tutorial of tutorialsContent) {
        const isNew = await isFeatureNew(tutorial.category);
        if (isNew) {
          newFeaturesSet.add(tutorial.category);
        }
      }

      setNewFeatures(newFeaturesSet);
    };

    checkNewFeatures();
  }, []);

  const availableTutorials = useMemo(() => {
    return tutorialsContent.filter(tutorial => hasPermission(tutorial.requiredPermission));
  }, [hasPermission]);

  const filteredTutorials = useMemo(() => {
    let filtered = availableTutorials;

    if (selectedCategory !== 'all') {
      filtered = filtered.filter(t => t.category === selectedCategory);
    }

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(t =>
        t.title.toLowerCase().includes(search) ||
        t.description.toLowerCase().includes(search) ||
        t.steps.some(step =>
          step.title.toLowerCase().includes(search) ||
          step.description.toLowerCase().includes(search)
        ) ||
        t.useCases.some(uc =>
          uc.title.toLowerCase().includes(search) ||
          uc.description.toLowerCase().includes(search)
        )
      );
    }

    return filtered;
  }, [availableTutorials, selectedCategory, searchTerm]);

  const categories = useMemo(() => {
    const cats = new Map<string, { count: number; label: string }>();

    availableTutorials.forEach(tutorial => {
      const current = cats.get(tutorial.category) || { count: 0, label: '' };
      cats.set(tutorial.category, {
        count: current.count + 1,
        label: PERMISSION_LABELS[tutorial.category as keyof typeof PERMISSION_LABELS]?.title || tutorial.category
      });
    });

    return Array.from(cats.entries()).map(([key, value]) => ({
      id: key,
      name: value.label,
      count: value.count
    }));
  }, [availableTutorials]);

  const hasNewFeatures = newFeatures.size > 0;

  if (availableTutorials.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Nenhum tutorial disponível
        </h3>
        <p className="text-gray-600">
          Você não tem permissão para acessar nenhuma funcionalidade do sistema no momento.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg shadow-sm p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-2 flex items-center space-x-2">
              <BookOpen className="w-8 h-8" />
              <span>Central de Tutoriais</span>
            </h1>
            <p className="text-blue-100">
              Aprenda a usar todas as funcionalidades do sistema com guias práticos e detalhados
            </p>
          </div>
          {hasNewFeatures && (
            <div className="bg-white bg-opacity-20 backdrop-blur-sm rounded-lg px-4 py-2 flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-yellow-300" />
              <span className="text-sm font-medium">Novidades disponíveis!</span>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Buscar tutoriais..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="mb-6">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Todos ({availableTutorials.length})
            </button>
            {categories.map(category => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedCategory === category.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {category.name} ({category.count})
              </button>
            ))}
          </div>
        </div>

        {filteredTutorials.length === 0 ? (
          <div className="text-center py-12">
            <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Nenhum tutorial encontrado
            </h3>
            <p className="text-gray-600">
              Tente ajustar sua busca ou selecionar outra categoria
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTutorials.map(tutorial => (
              <TutorialCard
                key={tutorial.id}
                tutorial={tutorial}
                isNew={newFeatures.has(tutorial.category)}
                onClick={() => setSelectedTutorial(tutorial)}
              />
            ))}
          </div>
        )}
      </div>

      {selectedTutorial && (
        <TutorialDetail
          tutorial={selectedTutorial}
          onClose={() => setSelectedTutorial(null)}
        />
      )}
    </div>
  );
};
