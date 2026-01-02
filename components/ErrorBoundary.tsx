
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { useLogger } from '../contexts/LoggingContext';

const CRASH_FLAG_KEY = 'app_crash_detected';

interface Props {
  children: ReactNode;
  logError: (error: Error, componentStack: string) => void;
}

interface State {
  hasError: boolean;
}

// Fixed ErrorBoundaryInternal by explicitly extending React.Component and declaring the state property
// to ensure that the TypeScript compiler recognizes 'props' and 'state'.
class ErrorBoundaryInternal extends React.Component<Props, State> {
  // Explicitly declared state property with a property initializer.
  public state: State = {
    hasError: false
  };

  constructor(props: Props) {
    super(props);
  }

  public static getDerivedStateFromError(_: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    // logError is accessed through this.props, which is inherited from React.Component
    this.props.logError(error, errorInfo.componentStack || '');
    // Set a flag in localStorage so we can detect this crash on the next app load.
    try {
        localStorage.setItem(CRASH_FLAG_KEY, 'true');
    } catch (e) {
        console.error("Could not set crash flag in localStorage:", e);
    }
  }

  public render() {
    // hasError is accessed through this.state, which is inherited from React.Component
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

    // children is accessed through this.props, which is inherited from React.Component
    return this.props.children;
  }
}

// Wrapper component to inject the logger context function into the class component
export const ErrorBoundary: React.FC<{children: ReactNode}> = ({ children }) => {
    const { logError } = useLogger();
    // Pass children and logError as props to the class-based internal component.
    return <ErrorBoundaryInternal logError={logError}>{children}</ErrorBoundaryInternal>;
};
