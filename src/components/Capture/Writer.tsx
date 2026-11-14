/**
 * The writing page — a blank page, not a form. Words and photos in one place:
 * opening "Photos" lands here too, with the pictures at the top. Dictate drops
 * what you say at the cursor. Drafts of pure writing autosave locally.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { format, isThisYear } from 'date-fns';
import { ImagePlus, Loader2, Mic, Square, X } from 'lucide-react';
import { toast } from 'sonner';
import { resolveDefaultCollectionId } from '@/lib/client/device';
import { type PreparedFile, formatDuration, prepareFile } from '@/lib/client/media';
import { trpc } from '@/lib/client/trpc';
import { cn } from '@/lib/utils';
import { useOnline } from '@/hooks/useOnline';
import { useRecorder } from '@/hooks/useRecorder';
import { useViewer } from '@/hooks/useViewer';
import MarkdownEditor from '@/components/MarkdownEditor';
import { useOutbox } from '@/components/Outbox/OutboxProvider';
import { Button } from '@/components/ui/button';
import CaptureDialog from './CaptureDialog';
import CollectionSelect from './CollectionSelect';
import DateField from './DateField';

export interface WriterEdit {
  storyId: string;
  /** The text media item being edited (null = add a text block to the memory). */
  mediaId: string | null;
  markdown: string;
  title: string | null;
}

interface Props {
  collectionId?: string;
  edit?: WriterEdit;
  /** Photos/videos picked before opening (the Photos button). */
  initialFiles?: File[];
  onClose: () => void;
}

const DRAFT_KEY = 'lore:draft';

interface Draft {
  title: string;
  markdown: string;
  savedAt: number;
}

function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export default function Writer({
  collectionId: initialCollectionId,
  edit,
  initialFiles,
  onClose,
}: Props) {
  const utils = trpc.useUtils();
  const { viewer } = useViewer();
  const { data: caps } = trpc.me.capabilities.useQuery();
  // Drafts are for pure writing; a photo memory starts fresh.
  const usesDraft = !edit && !initialFiles?.length;
  const draft = useMemo(() => (usesDraft ? loadDraft() : null), [usesDraft]);
  const [title, setTitle] = useState(edit?.title ?? draft?.title ?? '');
  const [markdown, setMarkdown] = useState(edit?.markdown ?? draft?.markdown ?? '');
  const [occurredAt, setOccurredAt] = useState(() => new Date());
  const [dateTouched, setDateTouched] = useState(false);
  const [collectionId, setCollectionId] = useState(
    () => initialCollectionId ?? resolveDefaultCollectionId(viewer?.id),
  );
  const [photos, setPhotos] = useState<PreparedFile[]>([]);
  const [preparing, setPreparing] = useState(!!initialFiles?.length);
  const [saving, setSaving] = useState(false);
  /** Set once a new memory is safe on this device, so you can close mid-upload. */
  const [keptId, setKeptId] = useState<string | null>(null);
  const outbox = useOutbox();
  const online = useOnline();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);

  const updateStory = trpc.stories.update.useMutation();
  const updateText = trpc.media.updateText.useMutation();
  const addToStory = trpc.media.addToStory.useMutation();

  useEffect(() => {
    if (draft && (draft.markdown.trim() || draft.title.trim())) {
      toast('Picked up your draft where you left off');
    }
  }, [draft]);

  // Autosave pure-writing drafts.
  useEffect(() => {
    if (!usesDraft) return;
    const handle = setTimeout(() => {
      if (markdown.trim() || title.trim()) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, markdown, savedAt: Date.now() }));
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [usesDraft, markdown, title]);

  const addPhotos = useCallback(
    async (files: File[]) => {
      setPreparing(true);
      const prepared = await Promise.all(files.map(prepareFile));
      setPreparing(false);
      setPhotos((current) => [...current, ...prepared]);
      // The memory happened when the earliest photo was taken (unless you set the date).
      const taken = prepared.map((p) => p.takenAt?.getTime()).filter((t): t is number => !!t);
      if (taken.length && !dateTouched) {
        setOccurredAt((current) => new Date(Math.min(current.getTime(), ...taken)));
      }
    },
    [dateTouched],
  );

  const startedWithFiles = useRef(false);
  useEffect(() => {
    if (startedWithFiles.current || !initialFiles?.length) return;
    startedWithFiles.current = true;
    addPhotos(initialFiles);
  }, [initialFiles, addPhotos]);

  // ---------- Dictation ----------
  const recorder = useRecorder({ meter: false });
  const [transcribing, setTranscribing] = useState(false);
  const dictating =
    recorder.state === 'recording' ||
    recorder.state === 'paused' ||
    recorder.state === 'requesting';

  const stopDictation = async () => {
    const { blob } = await recorder.stop();
    setTranscribing(true);
    try {
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': blob.type || 'audio/webm' },
        body: blob,
      });
      const body = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || body.text === undefined)
        throw new Error(body.error ?? 'Couldn’t write that down');
      const text = body.text.trim();
      if (!text) {
        toast('Didn’t catch any words — try again');
      } else if (editorRef.current && !editorRef.current.isDestroyed) {
        const editor = editorRef.current;
        const needsSpace =
          !editor.isEmpty &&
          !/\s$/.test(editor.state.doc.textBetween(0, editor.state.selection.from, '\n'));
        editor
          .chain()
          .focus()
          .insertContent(`${needsSpace ? ' ' : ''}${text} `)
          .run();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Couldn’t write that down');
    } finally {
      setTranscribing(false);
    }
  };

  useEffect(() => {
    if (recorder.state === 'error' && recorder.error) toast.error(recorder.error);
  }, [recorder.state, recorder.error]);

  // ---------- Save / close ----------
  const hasText = markdown.trim().length > 0;
  const canSave =
    (hasText || photos.length > 0) && !saving && !preparing && !dictating && !transcribing;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      if (edit) {
        if (edit.mediaId) {
          await updateText.mutateAsync({ id: edit.mediaId, text: markdown });
        } else if (hasText) {
          await addToStory.mutateAsync({
            storyId: edit.storyId,
            media: [{ kind: 'text', text: markdown }],
          });
        }
        if ((title || null) !== (edit.title || null)) {
          await updateStory.mutateAsync({ id: edit.storyId, title: title.trim() || null });
        }
      } else {
        // Kept on this device first, then uploaded: no signal doesn't lose it.
        const result = await outbox.save(
          {
            kind: 'write',
            collectionId,
            title: title.trim() || undefined,
            occurredAt: occurredAt.getTime(),
            media: [
              ...(hasText ? [{ kind: 'text' as const, text: markdown }] : []),
              ...photos.map((photo) => ({
                kind: photo.kind,
                blob: photo.blob,
                width: photo.width,
                height: photo.height,
                durationMs: photo.durationMs,
              })),
            ],
          },
          {
            onKept: (id) => {
              setKeptId(id);
              if (usesDraft) localStorage.removeItem(DRAFT_KEY);
            },
          },
        );
        if (usesDraft) localStorage.removeItem(DRAFT_KEY);
        if (result.status === 'failed') {
          toast.error(`Couldn’t upload: ${result.error}`, {
            description: 'It’s kept on this device. Retry it from Home.',
          });
        } else if (result.status === 'queued') {
          toast.success('Saved on this device', {
            description: online
              ? 'It’ll upload by itself.'
              : 'It’ll upload when you’re back online.',
          });
        } else {
          toast.success('Saved');
        }
        onClose();
        return;
      }
      toast.success('Saved');
      utils.stories.invalidate();
      utils.collections.list.invalidate();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Couldn’t save — try again');
      setSaving(false);
    }
  };

  const requestClose = () => {
    if (saving) {
      // Safe on this device already: let it finish uploading without you.
      if (keptId) {
        outbox.detach(keptId);
        toast('Uploading — it’s safe on this device');
        onClose();
      }
      return;
    }
    if (dictating) recorder.discard();
    if (edit && markdown !== edit.markdown && !window.confirm('Discard your changes?')) return;
    if (
      !usesDraft &&
      !edit &&
      (photos.length || hasText) &&
      !window.confirm('Discard this memory?')
    )
      return;
    if (usesDraft && (hasText || title.trim())) toast('Draft kept — it’ll be here next time');
    onClose();
  };

  return (
    <CaptureDialog
      title={edit ? 'Edit memory' : 'Write a memory'}
      onRequestClose={requestClose}
      variant="page"
    >
      {/* Quiet top bar */}
      <header className="flex items-center gap-2 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={requestClose}
          aria-label="Close"
          disabled={saving && !keptId}
        >
          <X className="size-5" />
        </Button>
        {!edit && (
          <>
            <DateField
              value={occurredAt}
              onChange={(date) => {
                setDateTouched(true);
                setOccurredAt(date);
              }}
              className="hidden sm:inline-flex"
            >
              {format(occurredAt, isThisYear(occurredAt) ? 'EEE, MMM d' : 'EEE, MMM d, yyyy')}
            </DateField>
            <CollectionSelect value={collectionId} onChange={setCollectionId} />
          </>
        )}
        <div className="flex-1" />
        <Button onClick={save} disabled={!canSave} className="rounded-full px-5">
          {saving && <Loader2 className="animate-spin" />}
          Save
        </Button>
      </header>

      {/* The page */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[680px] px-6 pb-40 pt-6 sm:pt-14">
          {!edit && (
            <DateField
              value={occurredAt}
              onChange={(date) => {
                setDateTouched(true);
                setOccurredAt(date);
              }}
              className="mb-4 sm:hidden"
            >
              {format(occurredAt, isThisYear(occurredAt) ? 'EEEE, MMMM d' : 'EEEE, MMMM d, yyyy')}
            </DateField>
          )}

          {(photos.length > 0 || preparing) && (
            <div
              className={cn(
                'mb-8 grid gap-2',
                photos.length === 1
                  ? 'grid-cols-1'
                  : photos.length === 2
                    ? 'grid-cols-2'
                    : 'grid-cols-3',
              )}
            >
              {photos.map((photo, index) => (
                <div
                  key={photo.previewUrl}
                  className={cn(
                    'group relative overflow-hidden rounded-xl bg-muted',
                    photos.length === 1 ? 'aspect-[4/3]' : 'aspect-square',
                  )}
                >
                  {photo.kind === 'video' ? (
                    <video
                      src={photo.previewUrl}
                      className="size-full object-cover"
                      muted
                      playsInline
                    />
                  ) : (
                    <img src={photo.previewUrl} alt="" className="size-full object-cover" />
                  )}
                  <button
                    type="button"
                    onClick={() => setPhotos((list) => list.filter((_, i) => i !== index))}
                    className="absolute right-2 top-2 rounded-full bg-background/90 p-1.5 opacity-90 shadow-sm"
                    aria-label="Remove photo"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
              {preparing && (
                <div className="flex aspect-square items-center justify-center rounded-xl bg-muted">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          )}

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            maxLength={200}
            aria-label="Title"
            className="mb-3 w-full bg-transparent font-serif text-4xl font-medium leading-tight tracking-tight outline-none placeholder:text-muted-foreground/40 sm:text-5xl"
          />
          <MarkdownEditor
            initialMarkdown={markdown}
            onChange={setMarkdown}
            onReady={(editor) => {
              editorRef.current = editor;
            }}
            placeholder={
              photos.length || initialFiles?.length
                ? 'Say something about this…'
                : 'Tell the story…'
            }
            autoFocus={!initialFiles?.length}
            contentClassName="text-[1.2rem] sm:text-[1.3rem] leading-[1.75] min-h-[40vh]"
          />
        </div>
      </div>

      {/* Floating toolbar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] flex justify-center">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border bg-background/95 p-1.5 shadow-lg backdrop-blur">
          {dictating ? (
            <>
              <span className="flex items-center gap-2 px-3 text-sm tabular-nums">
                <span className="size-2 animate-recording-pulse rounded-full bg-destructive" />
                {recorder.state === 'requesting'
                  ? 'Allow the microphone…'
                  : formatDuration(recorder.elapsedMs)}
              </span>
              <Button
                size="sm"
                className="rounded-full"
                onClick={stopDictation}
                disabled={recorder.state === 'requesting'}
              >
                <Square className="size-3 fill-current" /> Done
              </Button>
            </>
          ) : transcribing ? (
            <span className="flex items-center gap-2 px-4 py-1.5 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Writing it down…
            </span>
          ) : (
            <>
              {!edit && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full"
                  onClick={() => photoInputRef.current?.click()}
                >
                  <ImagePlus /> Photos
                </Button>
              )}
              {caps?.transcription && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full"
                  onClick={() => recorder.start()}
                >
                  <Mic /> Dictate
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) addPhotos(files);
        }}
      />
    </CaptureDialog>
  );
}
