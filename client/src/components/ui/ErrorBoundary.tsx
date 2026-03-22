import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Card, CardContent, CardTitle } from "./Card";
import { Button } from "./Button";

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    fallbackRender?: (args: { error: Error | null; retry: () => void }) => ReactNode;
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
        console.error("ErrorBoundary caught an error:", error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallbackRender) {
                return this.props.fallbackRender({
                    error: this.state.error,
                    retry: this.handleReset,
                });
            }

            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="min-h-screen flex items-center justify-center p-6">
                    <Card className="max-w-lg w-full">
                        <CardTitle className="text-red-400 mb-4">Something went wrong</CardTitle>
                        <CardContent>
                            <p className="text-white/70 mb-4">
                                An unexpected error occurred. Please try refreshing the page.
                            </p>
                            {this.state.error && (
                                <details className="mb-4">
                                    <summary className="text-white/60 cursor-pointer hover:text-white/80 mb-2">
                                        Error details
                                    </summary>
                                    <pre className="text-xs text-red-300 bg-black/30 p-3 rounded overflow-auto">
                                        {this.state.error.toString()}
                                    </pre>
                                </details>
                            )}
                            <div className="flex gap-3">
                                <Button onClick={this.handleReset} variant="primary" size="md">
                                    Try Again
                                </Button>
                                <Button
                                    onClick={() => window.location.reload()}
                                    variant="secondary"
                                    size="md"
                                >
                                    Reload Page
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            );
        }

        return this.props.children;
    }
}
