import React, { useState, useMemo } from 'react';
import { HelpCircle, X, BookOpen, ChevronRight } from 'lucide-react';
import { tutorialsContent } from '../../data/tutorialContent';
import { Tutorial } from '../../types/tutorial';
import { TutorialDetail } from './TutorialDetail';

interface HelpButtonProps {
  currentTab: string;
  hasPermission: (permission: string) => boolean;
}

export const HelpButton: React.FC<HelpButtonProps> = ({ currentTab, hasPermission }) => {
  const [showModal, setShowModal] = useState(false);
  const [selectedTutorial, setSelectedTutorial] = useState<Tutorial | null>(null);

  const contextualTutorials = useMemo(() => {
    return tutorialsContent.filter(
      tutorial =>
        tutorial.category === currentTab &&
        hasPermission(tutorial.requiredPermission)
    );
  }, [currentTab, hasPermission]);

  const allAvailableTutorials = useMemo(() => {
    return tutorialsContent.filter(tutorial => hasPermission(tutorial.requiredPermission));
  }, [hasPermission]);

  const handleTutorialClick = (tutorial: Tutorial) => {
    setSelectedTutorial(tutorial);
    setShowModal(false);
  };

  if (allAvailableTutorials.length === 0) {
    return null;
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center group z-40"
        title="Ajuda"
      >
        <HelpCircle className="w-6 h-6" />
        <span className="absolute right-full mr-3 bg-gray-900 text-white text-sm px-3 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
          Precisa de ajuda?
        </span>
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                  <HelpCircle className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Ajuda Rápida</h2>
                  <p className="text-sm text-gray-500">Tutoriais e guias disponíveis</p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {contextualTutorials.length > 0 && (
                <section>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center space-x-2">
                    <BookOpen className="w-5 h-5 text-blue-600" />
                    <span>Tutoriais desta aba</span>
                  </h3>
                  <div className="space-y-2">
                    {contextualTutorials.map(tutorial => (
                      <button
                        key={tutorial.id}
                        onClick={() => handleTutorialClick(tutorial)}
                        className="w-full bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg p-4 text-left transition-colors group"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900 group-hover:text-blue-600 mb-1">
                              {tutorial.title}
                            </h4>
                            <p className="text-sm text-gray-600 line-clamp-2">
                              {tutorial.description}
                            </p>
                          </div>
                          <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 flex-shrink-0 ml-4" />
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  Outras funcionalidades
                </h3>
                <div className="grid grid-cols-1 gap-2">
                  {allAvailableTutorials
                    .filter(t => t.category !== currentTab)
                    .slice(0, 5)
                    .map(tutorial => (
                      <button
                        key={tutorial.id}
                        onClick={() => handleTutorialClick(tutorial)}
                        className="bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg p-3 text-left transition-colors group"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h4 className="font-medium text-gray-900 text-sm group-hover:text-blue-600">
                              {tutorial.title}
                            </h4>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600 flex-shrink-0 ml-2" />
                        </div>
                      </button>
                    ))}
                </div>
              </section>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900 mb-3">
                  <strong>Dica:</strong> Acesse a aba "Ajuda" para ver todos os tutoriais disponíveis e buscar por funcionalidades específicas.
                </p>
                <p className="text-xs text-blue-700">
                  Os tutoriais são personalizados de acordo com suas permissões de acesso.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedTutorial && (
        <TutorialDetail
          tutorial={selectedTutorial}
          onClose={() => {
            setSelectedTutorial(null);
            setShowModal(true);
          }}
        />
      )}
    </>
  );
};
