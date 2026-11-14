/**
 * One place that owns the ways to capture a memory, so any screen can open
 * them: `useCapture().record()`, `.write()`, `.photos()` (photos open the
 * writing page with the pictures at the top) and `.vibe()` (today's second).
 * Each takes an optional collection; otherwise memories land in Moments.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import SecondCapture from './SecondCapture';
import VoiceRecorder from './VoiceRecorder';
import Writer, { type WriterEdit } from './Writer';

interface CaptureApi {
  record: (collectionId?: string) => void;
  write: (collectionId?: string) => void;
  /** Must be called from a click handler (it opens the file picker). */
  photos: (collectionId?: string) => void;
  /** Today's vibe: opens the camera for a few seconds of video (replaces today's if there is one). */
  vibe: (collectionId?: string) => void;
  editText: (edit: WriterEdit) => void;
}

const CaptureContext = createContext<CaptureApi | null>(null);

export function useCapture() {
  const api = useContext(CaptureContext);
  if (!api) throw new Error('useCapture must be used inside CaptureProvider');
  return api;
}

type Open =
  | { mode: 'voice'; collectionId?: string }
  | { mode: 'write'; collectionId?: string; edit?: WriterEdit; files?: File[] }
  | { mode: 'vibe'; collectionId?: string }
  | null;

interface Props {
  children: React.ReactNode;
}

export default function CaptureProvider({ children }: Props) {
  const [open, setOpen] = useState<Open>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoTargetRef = useRef<string | undefined>(undefined);

  const close = useCallback(() => setOpen(null), []);

  const api = useMemo<CaptureApi>(
    () => ({
      record: (collectionId) => setOpen({ mode: 'voice', collectionId }),
      write: (collectionId) => setOpen({ mode: 'write', collectionId }),
      photos: (collectionId) => {
        photoTargetRef.current = collectionId;
        fileInputRef.current?.click();
      },
      vibe: (collectionId) => setOpen({ mode: 'vibe', collectionId }),
      editText: (edit) => setOpen({ mode: 'write', edit }),
    }),
    [],
  );

  return (
    <CaptureContext.Provider value={api}>
      {children}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          // Photos open the writing page with the pictures at the top.
          if (files.length) setOpen({ mode: 'write', collectionId: photoTargetRef.current, files });
        }}
      />
      {open?.mode === 'voice' && <VoiceRecorder collectionId={open.collectionId} onClose={close} />}
      {open?.mode === 'write' && (
        <Writer
          collectionId={open.collectionId}
          edit={open.edit}
          initialFiles={open.files}
          onClose={close}
        />
      )}
      {open?.mode === 'vibe' && <SecondCapture collectionId={open.collectionId} onClose={close} />}
    </CaptureContext.Provider>
  );
}
