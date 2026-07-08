import { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizes = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl' };

export function Modal({ open, onClose, title, subtitle, children, size = 'md' }: Props) {
  const backdrop = useRef<HTMLDivElement>(null);
  const downOnBackdrop = useRef(false);
  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
          onMouseDown={(e) => { downOnBackdrop.current = e.target === backdrop.current; }}
          onClick={(e) => { if (downOnBackdrop.current && e.target === backdrop.current) onClose(); }}
        >
          <motion.div
            ref={backdrop}
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          />
          <motion.div
            className={`relative w-full ${sizes[size]} glass rounded-t-3xl sm:rounded-3xl shadow-glass max-h-[92vh] overflow-hidden flex flex-col`}
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.98 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          >
            {title && (
              <div className="flex items-start justify-between px-6 pt-5 pb-3 border-b border-white/20 dark:border-white/10">
                <div>
                  {title && <h3 className="text-lg font-semibold">{title}</h3>}
                  {subtitle && <p className="text-sm text-ink-400 mt-0.5">{subtitle}</p>}
                </div>
                <button onClick={onClose} className="btn-ghost !p-2 rounded-full -mr-2">
                  <X size={18} />
                </button>
              </div>
            )}
            <div className="overflow-y-auto px-6 py-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
