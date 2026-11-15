import React, { useState } from 'react';
import { useSettings } from '../../contexts/SettingsContext';

interface AiProfilePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AiProfilePanel: React.FC<AiProfilePanelProps> = ({ isOpen, onClose }) => {
  const { settings, updateSettings } = useSettings();
  const { userProfile } = settings;
  const [newEquipment, setNewEquipment] = useState('');

  const handleProfileUpdate = (key: string, value: any) => {
    updateSettings({
      userProfile: {
        ...userProfile,
        [key]: value,
      },
    });
  };

  const handleAddEquipment = () => {
    const trimmed = newEquipment.trim();
    if (!trimmed) return;
    const current = userProfile?.equipment || [];
    if (current.some(e => e.name.toLowerCase() === trimmed.toLowerCase())) return;
    handleProfileUpdate('equipment', [...current, { name: trimmed, available: true }]);
    setNewEquipment('');
  };

  const handleRemoveEquipment = (name: string) => {
    handleProfileUpdate('equipment', (userProfile?.equipment || []).filter(e => e.name !== name));
  };

  const handleToggleEquipment = (name: string) => {
    handleProfileUpdate(
      'equipment',
      (userProfile?.equipment || []).map(e => (e.name === name ? { ...e, available: !e.available } : e))
    );
  };

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/50 z-[101] transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-sm bg-gray-800 shadow-2xl z-[102] transform transition-transform duration-300 flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        dir="rtl"
      >
        <div className="flex justify-between items-center p-4 border-b border-gray-700 shrink-0">
          <h3 className="text-xl font-bold text-white">הפרופיל שלי</h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 space-y-6 overflow-y-auto flex-grow">
          <div>
            <label className="text-sm font-semibold text-gray-300">תאריך לידה</label>
            <input
              type="date"
              value={userProfile?.birthDate || ''}
              onChange={e => handleProfileUpdate('birthDate', e.target.value)}
              className="bg-gray-700 p-2 rounded-md text-white w-full mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-300">רמת כושר</label>
            <div className="flex gap-2 mt-1">
              {(['beginner', 'intermediate', 'advanced'] as const).map(lvl => (
                <button
                  key={lvl}
                  onClick={() => handleProfileUpdate('fitnessLevel', lvl)}
                  className={`flex-1 py-2 text-sm font-semibold rounded-md transition-colors ${userProfile?.fitnessLevel === lvl ? 'bg-blue-600 text-white' : 'bg-gray-600 hover:bg-gray-500'}`}
                >
                  {lvl === 'beginner' ? 'מתחיל' : lvl === 'intermediate' ? 'בינוני' : 'מתקדם'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-300">הציוד שלי</label>
            <div className="flex gap-2 mt-1">
              <input
                type="text"
                value={newEquipment}
                onChange={e => setNewEquipment(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddEquipment()}
                placeholder="הוסף ציוד..."
                className="flex-grow bg-gray-700 p-2 rounded-md text-white text-sm"
              />
              <button onClick={handleAddEquipment} className="px-4 py-2 bg-blue-600 rounded-md font-semibold hover:bg-blue-700 text-white">+</button>
            </div>
            <div className="mt-3 space-y-2 max-h-60 overflow-y-auto pr-2">
              {(userProfile?.equipment || []).map(item => (
                <div key={item.name} className="flex items-center bg-gray-700/50 p-2 rounded-md">
                  <input
                    type="checkbox"
                    id={`equip-${item.name}`}
                    checked={item.available}
                    onChange={() => handleToggleEquipment(item.name)}
                    className="w-5 h-5 bg-gray-600 border-gray-500 text-blue-500 rounded focus:ring-blue-500"
                  />
                  <label htmlFor={`equip-${item.name}`} className="flex-grow mx-3 text-white truncate cursor-pointer text-sm">{item.name}</label>
                  <button onClick={() => handleRemoveEquipment(item.name)} className="p-1 text-gray-400 hover:text-red-500">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
