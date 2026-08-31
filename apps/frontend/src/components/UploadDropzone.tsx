import { useRef, useState } from 'react';
import { CloudUpload, Loader2 } from 'lucide-react';
import { formatBytes } from '../lib/format';

const MAX_BYTES = 10 * 1024 * 1024;

interface Props {
  uploading: boolean;
  onFile: (file: File) => void;
  onReject: (reason: string) => void;
}

/**
 * PDF dropzone.
 *
 * Implemented as a <button> wrapping a hidden file input rather than a clickable
 * <div>: the div version could not be reached by keyboard at all, and screen
 * readers had no idea it was actionable.
 *
 * Size and type are checked here so the user gets an instant, specific message
 * instead of waiting for a 10 MB upload to be rejected by the server.
 */
export function UploadDropzone({ uploading, onFile, onReject }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const validate = (file: File): string | null => {
    if (file.type !== 'application/pdf') {
      return 'Only PDF files are supported.';
    }
    if (file.size > MAX_BYTES) {
      return `That file is ${formatBytes(file.size)}. The limit is 10 MB.`;
    }
    if (file.size === 0) {
      return 'That file is empty.';
    }
    return null;
  };

  const accept = (file: File | undefined) => {
    if (!file) return;
    const problem = validate(file);
    if (problem) {
      onReject(problem);
      return;
    }
    onFile(file);
  };

  const handleDrag = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === 'dragenter' || event.type === 'dragover') setDragActive(true);
    if (event.type === 'dragleave') setDragActive(false);
  };

  return (
    <div
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={(event) => {
        handleDrag(event);
        setDragActive(false);
        accept(event.dataTransfer.files?.[0]);
      }}
      className="mb-10"
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="sr-only"
        onChange={(event) => {
          accept(event.target.files?.[0]);
          // Reset so selecting the same file twice still fires onChange.
          event.target.value = '';
        }}
        disabled={uploading}
        tabIndex={-1}
        aria-hidden="true"
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        aria-label="Upload a PDF. Click to browse, or drop a file here."
        className={`w-full rounded-4xl border-2 border-dashed px-6 py-12 text-center transition-all
          ${
            dragActive
              ? 'border-brand-500 bg-brand-50/60 scale-[1.01]'
              : 'border-slate-300 bg-white/50 hover:border-brand-400 hover:bg-white/80'
          }
          ${uploading ? 'cursor-wait opacity-60' : 'cursor-pointer'}`}
      >
        <span
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-100"
          aria-hidden="true"
        >
          {uploading ? (
            <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
          ) : (
            <CloudUpload className="h-8 w-8 text-brand-600" />
          )}
        </span>

        <span className="block text-lg font-semibold text-slate-800">
          {uploading ? 'Uploading...' : dragActive ? 'Drop to upload' : 'Upload a PDF'}
        </span>
        <span className="mt-1 block text-sm text-slate-500">
          Drag and drop, or click to browse. Up to 10 MB.
        </span>
      </button>
    </div>
  );
}
