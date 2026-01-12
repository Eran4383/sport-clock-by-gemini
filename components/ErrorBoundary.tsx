import React, { ErrorInfo, ReactNode } from 'react';
import { useLogger } from '../contexts/LoggingContext';

const CRASH_FLAG_KEY = 'app_crash_detected';

interface Props {
  children?: ReactNode;
  logError: (error: Error, componentStack: string) => void;
}

interface State {
  hasError: boolean;
}

/**
 * Internal class-based ErrorBoundary to use lifecycle methods.
 * Fixed by extending Component directly and ensuring props/state are correctly typed.
 */
class ErrorBoundaryInternal extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.props.logError(error, errorInfo.componentStack || '');
    
    try {
        localStorage.setItem(CRASH_FLAG_KEY, 'true');
    } catch (e) {
        console.error("Could not set crash flag in localStorage:", e);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-red-900 text-white flex flex-col items-center justify-center p-4 text-center">
            <h1 className="text-4xl font-bold">התרחשה שגיאה</h1>
            <p className="mt-4 text-lg">אפליקציית השעון נתקלה בבעיה בלתי צפויה.</p>
            <p className="mt-2 text-md text-red-200">
                נסה לרענן את הדף. אם הבעיה נמשכת, אנא פתח את תפריט ההגדרות, עבור לקטע 'מפתחים' והעתק את פרטי ניפוי השגיאות כדי לדווח על הבעיה.
            </p>
            <button
                onClick={() => window.location.reload()}
                className="mt-8 px-6 py-3 bg-red-600 rounded-lg font-semibold hover:bg-red-700 transition-colors"
            >
                רענן דף
            </button>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Functional wrapper for the ErrorBoundary to consume hooks.
 */
export const ErrorBoundary: React.FC<{children: ReactNode}> = ({ children }) => {
    const { logError } = useLogger();
    return <ErrorBoundaryInternal logError={logError}>{children}</ErrorBoundaryInternal>;
};
