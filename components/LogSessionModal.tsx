import React, { useState } from 'react';

interface LogSessionModalProps {
  onSave: (name: string) => void;
  onClose: () => void;
}

export const LogSessionModal: React.FC<LogSessionModalProps> = ({ onSave, onClose }) => {
  const defaultName = `Manual Session - ${new Date().toLocaleDateString('he-IL')}`;
  const [name, setName] = useState(defaultName);

  const handleSave = () => {
    onSave(name.trim() === '' ? defaultName : name.trim());
  };

  return (
    <div 
      className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4 animate-fadeIn"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div 
        className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-xl font-bold text-white">Log Manual Session</h3>
        <p className="text-gray-300 mt-2">Give this session a name to save it to your history.</p>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full mt-4 p-2 bg-gray-900 text-gray-300 rounded-md focus:outline-none focus:ring-2 ring-blue-500"
          placeholder={defaultName}
        />
        <div className="mt-6 flex justify-end gap-4">
          <button onClick={onClose} className="px-4 py-2 rounded-md text-white bg-gray-600 hover:bg-gray-500 font-semibold">
            Cancel
          </button>
          <button onClick={handleSave} className="px-4 py-2 rounded-md text-white bg-blue-600 hover:bg-blue-700 font-semibold">
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
