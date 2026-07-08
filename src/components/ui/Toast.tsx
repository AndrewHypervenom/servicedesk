import { create } from 'zustand';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type Kind = 'success' | 'error' | 'info';
interface Toast { id: number; kind: Kind; msg: string; }
interface ToastState {
  toasts: Toast[];
  push: (kind: Kind, msg: string) => void;
  remove: (id: number) => void;
}

export const useToast = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, msg) => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts, { id, kind, msg }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (m: string) => useToast.getState().push('success', m),
  error: (m: string) => useToast.getState().push('error', m),
  info: (m: string) => useToast.getState().push('info', m),
};

const icons = { success: CheckCircle2, error: AlertCircle, info: Info };
const colors = {
  success: 'text-emerald-600 dark:text-success',
  error: 'text-red-600 dark:text-danger',
  info: 'text-brand-600 dark:text-brand-400',
};

export function ToastHost() {
  const { toasts, remove } = useToast();
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[min(92vw,360px)]">
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = icons[t.kind];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.9 }}
              transition={{ type: 'spring', damping: 24, stiffness: 320 }}
              className="glass rounded-2xl shadow-glass px-4 py-3 flex items-center gap-3"
            >
              <Icon size={20} className={colors[t.kind]} />
              <span className="text-sm flex-1">{t.msg}</span>
              <button onClick={() => remove(t.id)} className="text-ink-400 hover:text-ink-600"><X size={16} /></button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
