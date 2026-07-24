import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';
import i18n from '@/i18n';

interface Props {
  children: ReactNode;
  /** Se llama al pulsar "Reintentar", antes de volver a montar el árbol. */
  onReset?: () => void;
}

interface State {
  error: Error | null;
  stack?: string;
}

/**
 * Red de seguridad para los errores de render.
 *
 * Sin esto, cualquier excepción dentro de una página desmonta TODO el árbol de
 * React y la pantalla se queda en blanco, sin ningún indicio de qué falló salvo
 * la consola. Con el límite puesto alrededor del contenido de la ruta, el
 * armazón (barra lateral y superior) sobrevive, se puede navegar a otra vista y
 * el mensaje real queda a la vista para reportarlo.
 *
 * Tiene que ser una clase: `componentDidCatch` no tiene equivalente en hooks.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // El stack de componentes es lo que de verdad localiza el fallo; el stack
    // de JS apunta al bundle. Se deja en consola para poder copiarlo.
    console.error('[ErrorBoundary]', error, info.componentStack);
    this.setState({ stack: info.componentStack ?? undefined });
  }

  private reset = () => {
    this.props.onReset?.();
    this.setState({ error: null, stack: undefined });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="card p-6 max-w-2xl mx-auto my-8">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-danger/10 text-danger grid place-items-center">
            <AlertOctagon size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-ink-800 dark:text-ink-100">
              {i18n.t('common.crashTitle')}
            </h3>
            <p className="mt-1 text-sm text-ink-400">{i18n.t('common.crashDesc')}</p>

            <pre className="mt-4 max-h-52 overflow-auto rounded-xl bg-ink-50 dark:bg-white/5 p-3 text-xs font-mono text-ink-500 dark:text-ink-300 whitespace-pre-wrap break-words">
              {error.message || String(error)}
              {this.state.stack}
            </pre>

            <button className="btn-primary mt-4" onClick={this.reset}>
              <RotateCcw size={16} /> {i18n.t('common.retry')}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
