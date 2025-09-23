import React, { useState, useMemo } from 'react';
import { useWorkout } from '../contexts/WorkoutContext';
import { WorkoutLogEntry, WorkoutStep } from '../types';

const WorkoutLogDetailModal: React.FC<{
    entry: WorkoutLogEntry;
    onClose: () => void;
}> = ({ entry, onClose }) => {
    const [copyButtonText, setCopyButtonText] = useState('Copy');
    
    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const handleCopy = () => {
        let textToCopy = `Workout: ${entry.planName}\n`;
        textToCopy += `Date: ${new Date(entry.date).toLocaleString()}\n`;
        textToCopy += `Duration: ${formatDuration(entry.durationSeconds)}\n\n`;
        textToCopy += `Steps:\n`;
        entry.steps.forEach((step, index) => {
            const detail = step.isRepBased ? `${step.reps} reps` : `${step.duration}s`;
            textToCopy += `${index + 1}. ${step.name} - ${detail}\n`;
        });

        navigator.clipboard.writeText(textToCopy).then(() => {
            setCopyButtonText('Copied!');
            setTimeout(() => setCopyButtonText('Copy'), 2000);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            setCopyButtonText('Failed!');
            setTimeout(() => setCopyButtonText('Copy'), 2000);
        });
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center" onClick={onClose} aria-modal="true" role="dialog">
            <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-white break-all">{entry.planName}</h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-700">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="text-sm text-gray-400 mb-4">
                    <p>{new Date(entry.date).toLocaleString()}</p>
                    <p>Duration: {formatDuration(entry.durationSeconds)}</p>
                </div>
                <div className="max-h-60 overflow-y-auto pr-2">
                    <h4 className="font-semibold text-gray-200 mb-2">Steps Performed:</h4>
                    <ol className="list-decimal list-inside space-y-1 text-gray-300">
                        {entry.steps.map((step: WorkoutStep) => (
                            <li key={step.id} className="truncate">
                                {step.name} - <span className="text-gray-400">{step.isRepBased ? `${step.reps} reps` : `${step.duration}s`}</span>
                            </li>
                        ))}
                    </ol>
                </div>
                <div className="mt-6 flex justify-end gap-4">
                    <button onClick={handleCopy} className="px-4 py-2 rounded-md text-white bg-blue-600 hover:bg-blue-700 font-semibold w-24">
                        {copyButtonText}
                    </button>
                    <button onClick={onClose} className="px-4 py-2 rounded-md text-white bg-gray-600 hover:bg-gray-500 font-semibold">
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export const WorkoutLog: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { workoutHistory, clearWorkoutHistory } = useWorkout();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedEntry, setSelectedEntry] = useState<WorkoutLogEntry | null>(null);

    const daysInMonth = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        return new Date(year, month + 1, 0).getDate();
    }, [currentDate]);

    const firstDayOfMonth = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        return new Date(year, month, 1).getDay();
    }, [currentDate]);

    const workoutsByDay = useMemo(() => {
        const map = new Map<number, typeof workoutHistory>();
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();

        workoutHistory.forEach(entry => {
            const entryDate = new Date(entry.date);
            if (entryDate.getFullYear() === year && entryDate.getMonth() === month) {
                const day = entryDate.getDate();
                if (!map.has(day)) {
                    map.set(day, []);
                }
                map.get(day)!.push(entry);
            }
        });
        return map;
    }, [workoutHistory, currentDate]);
    
    const [selectedDay, setSelectedDay] = useState<number | null>(null);
    const selectedDayWorkouts = selectedDay ? workoutsByDay.get(selectedDay) : null;

    const changeMonth = (delta: number) => {
        setCurrentDate(prev => {
            const newDate = new Date(prev);
            newDate.setMonth(prev.getMonth() + delta);
            return newDate;
        });
        setSelectedDay(null);
    };

    const calendarDays = [];
    for (let i = 0; i < firstDayOfMonth; i++) {
        calendarDays.push(<div key={`empty-${i}`} className="p-2"></div>);
    }
    for (let day = 1; day <= daysInMonth; day++) {
        const hasWorkout = workoutsByDay.has(day);
        calendarDays.push(
            <div 
                key={day} 
                className={`p-2 text-center rounded-full cursor-pointer transition-colors ${selectedDay === day ? 'bg-blue-500 text-white' : 'hover:bg-gray-700'} ${hasWorkout && selectedDay !== day ? 'relative' : ''}`}
                onClick={() => hasWorkout && setSelectedDay(day)}
            >
                {day}
                {hasWorkout && selectedDay !== day && (
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1.5 w-1.5 bg-green-400 rounded-full"></span>
                )}
            </div>
        );
    }
    
    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div>
            {selectedEntry && <WorkoutLogDetailModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />}
            <div className="flex items-center mb-6">
                <button onClick={onBack} className="p-2 rounded-full hover:bg-gray-500/30 mr-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <h2 className="text-2xl font-bold text-white">Workout Log</h2>
            </div>

            <div className="bg-gray-700/50 p-4 rounded-lg">
                <div className="flex justify-between items-center mb-4">
                    <button onClick={() => changeMonth(-1)} className="p-2 rounded-full hover:bg-gray-600">&lt;</button>
                    <h3 className="text-lg font-semibold">{currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</h3>
                    <button onClick={() => changeMonth(1)} className="p-2 rounded-full hover:bg-gray-600">&gt;</button>
                </div>
                <div className="grid grid-cols-7 gap-1 text-sm text-gray-400 mb-2">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div key={day} className="text-center">{day}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                    {calendarDays}
                </div>
            </div>
            
            <div className="mt-4">
                {selectedDayWorkouts ? (
                    <div>
                        <h4 className="font-bold text-lg mb-2">Workouts for {currentDate.toLocaleString('default', { month: 'long' })} {selectedDay}</h4>
                        <ul className="space-y-2 max-h-48 overflow-y-auto">
                            {selectedDayWorkouts.map(entry => (
                                <li 
                                    key={entry.id} 
                                    className="bg-gray-700/50 p-3 rounded-lg flex justify-between items-center cursor-pointer hover:bg-gray-700"
                                    onClick={() => setSelectedEntry(entry)}
                                >
                                    <div>
                                        <p className="font-semibold">{entry.planName}</p>
                                        <p className="text-sm text-gray-400">{new Date(entry.date).toLocaleTimeString()}</p>
                                    </div>
                                    <p className="font-mono">{formatDuration(entry.durationSeconds)}</p>
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : (
                    <p className="text-gray-400 text-center mt-6">Select a highlighted day to see workout details.</p>
                )}
            </div>

            {workoutHistory.length > 0 && (
                 <div className="mt-8 text-center">
                    <button 
                        onClick={clearWorkoutHistory}
                        className="px-4 py-2 text-sm text-red-400 bg-red-900/50 rounded-lg hover:bg-red-800/50 hover:text-red-300"
                    >
                        Clear All History
                    </button>
                </div>
            )}
        </div>
    );
};