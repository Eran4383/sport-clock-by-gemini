import React, { useState, useMemo } from 'react';
import { useWorkout } from '../contexts/WorkoutContext';

export const WorkoutLog: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { workoutHistory, clearWorkoutHistory } = useWorkout();
    const [currentDate, setCurrentDate] = useState(new Date());

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
                                <li key={entry.id} className="bg-gray-700/50 p-3 rounded-lg flex justify-between items-center">
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
