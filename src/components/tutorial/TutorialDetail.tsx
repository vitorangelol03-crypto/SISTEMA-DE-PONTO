import React from 'react';
import { X, CheckCircle, Lightbulb, Book, Target } from 'lucide-react';
import { Tutorial } from '../../types/tutorial';

interface TutorialDetailProps {
  tutorial: Tutorial;
  onClose: () => void;
}

export const TutorialDetail: React.FC<TutorialDetailProps> = ({ tutorial, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <span className="text-xl">📚</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{tutorial.title}</h2>
              <p className="text-sm text-gray-500">{tutorial.description}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-8">
          <section>
            <div className="flex items-center space-x-2 mb-4">
              <Book className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-900">Passo a Passo</h3>
            </div>
            <div className="space-y-4">
              {tutorial.steps.map((step, index) => (
                <div key={index} className="flex space-x-4">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold text-sm">
                      {index + 1}
                    </div>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 mb-1">{step.title}</h4>
                    <p className="text-gray-600 text-sm mb-2">{step.description}</p>
                    {step.tips && step.tips.length > 0 && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-2">
                        <div className="flex items-start space-x-2">
                          <Lightbulb className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-yellow-800 mb-1">Dicas:</p>
                            <ul className="text-xs text-yellow-700 space-y-1">
                              {step.tips.map((tip, tipIndex) => (
                                <li key={tipIndex}>• {tip}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center space-x-2 mb-4">
              <Target className="w-5 h-5 text-green-600" />
              <h3 className="text-lg font-semibold text-gray-900">Casos de Uso Práticos</h3>
            </div>
            <div className="space-y-4">
              {tutorial.useCases.map((useCase, index) => (
                <div key={index} className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2 flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span>{useCase.title}</span>
                  </h4>
                  <p className="text-sm text-gray-600 mb-3">{useCase.description}</p>
                  <div className="bg-white border border-green-300 rounded-lg p-3">
                    <p className="text-xs font-semibold text-green-800 mb-1">Exemplo:</p>
                    <p className="text-sm text-gray-700">{useCase.example}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {tutorial.tips && tutorial.tips.length > 0 && (
            <section>
              <div className="flex items-center space-x-2 mb-4">
                <Lightbulb className="w-5 h-5 text-yellow-600" />
                <h3 className="text-lg font-semibold text-gray-900">Dicas Importantes</h3>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <ul className="space-y-2">
                  {tutorial.tips.map((tip, index) => (
                    <li key={index} className="flex items-start space-x-2">
                      <CheckCircle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-gray-700">{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </div>

        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4">
          <button
            onClick={onClose}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Fechar Tutorial
          </button>
        </div>
      </div>
    </div>
  );
};
