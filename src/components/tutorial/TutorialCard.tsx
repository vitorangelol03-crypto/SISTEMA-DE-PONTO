import React from 'react';
import { ChevronRight, Sparkles } from 'lucide-react';
import { Tutorial } from '../../types/tutorial';

interface TutorialCardProps {
  tutorial: Tutorial;
  isNew?: boolean;
  onClick: () => void;
}

export const TutorialCard: React.FC<TutorialCardProps> = ({ tutorial, isNew, onClick }) => {
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 p-6 hover:border-blue-500 hover:shadow-md transition-all cursor-pointer group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center group-hover:bg-blue-100 transition-colors">
            <span className="text-2xl">📚</span>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
              {tutorial.title}
            </h3>
            {isNew && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-full mt-1">
                <Sparkles className="w-3 h-3" />
                Novo
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
      </div>

      <p className="text-sm text-gray-600 mb-4 line-clamp-2">
        {tutorial.description}
      </p>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{tutorial.steps.length} passos</span>
        <span>{tutorial.useCases.length} casos de uso</span>
      </div>
    </div>
  );
};
