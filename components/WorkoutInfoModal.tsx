import React, { useMemo } from 'react';
import { WorkoutPlan, WorkoutLogEntry, StepStatus } from '../types';
import { useWorkout } from '../contexts/WorkoutContext';
import { getStepDisplayName } from '../utils/workout';

interface WorkoutInfoModalProps {
  plan: WorkoutPlan;
  onClose: () => void;
}

export const WorkoutInfoModal: React.FC<WorkoutInfoModalProps> = ({ plan, onClose }) => {
    const { workoutHistory } = useWorkout();

    const relevantLogs = useMemo(() => {
        return workoutHistory
            .filter(log => log.planIds?.includes(plan.id))
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [workoutHistory, plan.id]);

    const timesPerformed = relevantLogs.length;

    const skipStats = useMemo(() => {
        if (timesPerformed === 0) {
            return { totalSkips: 0, mostSkipped: null };
        }

        const skipCounts = new Map<string, number>();
        let totalSkips = 0;

        relevantLogs.forEach(log => {
            if (log.performedSteps) {
                log.performedSteps.forEach(pStep => {
                    if (pStep.status === StepStatus.Skipped && pStep.step.type === 'exercise') {
                        totalSkips++;
                        const stepName = getStepDisplayName(pStep.step);
                        skipCounts.set(stepName, (skipCounts.get(stepName) || 0) + 1);
                    }
                });
            }
        });

        if (skipCounts.size === 0) {
            return { totalSkips: 0, mostSkipped: null };
        }

        const mostSkipped = [...skipCounts.entries()].reduce((a, b) => b[1] > a[1] ? b : a);

        return { totalSkips, mostSkipped: { name: mostSkipped[0], count: mostSkipped[1] }};

    }, [relevantLogs, timesPerformed]);
    
    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}m ${secs}s`;
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-[101] flex items-center justify-center p-4" onClick={onClose} aria-modal="true" role="dialog">
            <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-start mb-4">
                    <h3 className="text-xl font-bold text-white break-all pr-4">Statistics for "{plan.name}"</h3>
                    <button onClick={onClose} className="p-1 -mt-2 -mr-2 rounded-full hover:bg-gray-700">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Times Performed</h4>
                            <p className="text-2xl font-bold text-white">{timesPerformed}</p>
                        </div>
                         <div>
                            <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Total Skips</h4>
                            <p className="text-2xl font-bold text-white">{skipStats.totalSkips}</p>
                        </div>
                    </div>
                    
                    {skipStats.mostSkipped && (
                         <div>
                            <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Most Skipped Exercise</h4>
                             <p className="text-lg font-semibold text-white truncate" title={skipStats.mostSkipped.name}>
                                {skipStats.mostSkipped.name} 
                                <span className="text-base font-normal text-gray-400 ml-2">({skipStats.mostSkipped.count} times)</span>
                            </p>
                        </div>
                    )}

                    <div>
                        <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Performance History</h4>
                        {timesPerformed > 0 ? (
                            <div className="mt-2 bg-gray-900/50 rounded-lg max-h-48 overflow-y-auto">
                                <ul className="divide-y divide-gray-700">
                                    {relevantLogs.map(log => (
                                        <li key={log.id} className="p-3 text-sm">
                                            <div className="flex justify-between items-center">
                                                <span className="font-medium text-gray-200">{new Date(log.date).toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                                                <span className="text-gray-400">{new Date(log.date).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                            <div className="text-xs text-gray-500 mt-1">
                                                Duration: {formatDuration(log.durationSeconds)}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <p className="text-gray-400 italic mt-2">This workout has not been performed yet.</p>
                        )}
                    </div>
                </div>

                <div className="mt-6 flex justify-end">
                     <button onClick={onClose} className="px-4 py-2 rounded-md text-white bg-gray-600 hover:bg-gray-500 font-semibold">
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};