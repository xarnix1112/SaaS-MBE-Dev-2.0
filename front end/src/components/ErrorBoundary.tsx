import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Erreur capturée:", error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="max-w-lg w-full bg-white rounded-lg shadow-lg p-6 border border-red-200">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <AlertTriangle className="h-8 w-8 flex-shrink-0" />
              <h1 className="text-xl font-semibold">Une erreur s&apos;est produite</h1>
            </div>
            <p className="text-sm text-slate-600 mb-3">
              Consulte la console du navigateur (F12 → Console) pour plus de détails.
            </p>
            <pre className="text-xs bg-slate-100 p-3 rounded overflow-auto max-h-40 text-red-700">
              {this.state.error.message}
            </pre>
            <details className="mt-3">
              <summary className="text-sm text-slate-500 cursor-pointer hover:text-slate-700">
                Stack trace
              </summary>
              <pre className="text-xs bg-slate-100 p-3 rounded overflow-auto max-h-32 mt-2 text-slate-600">
                {this.state.error.stack}
              </pre>
            </details>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 text-sm font-medium"
            >
              Recharger la page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
