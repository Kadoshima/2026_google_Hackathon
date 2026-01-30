'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UploadDropzoneProps {
  onFileSelect: (file: File) => void;
  className?: string;
}

export function UploadDropzone({ onFileSelect, className }: UploadDropzoneProps) {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      onFileSelect(acceptedFiles[0]);
    }
  }, [onFileSelect]);

  const { getRootProps, getInputProps, isDragActive, acceptedFiles } = useDropzone({
    onDrop,
    accept: {
      'application/zip': ['.zip'],
      'application/pdf': ['.pdf'],
      'application/x-zip-compressed': ['.zip'],
    },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024, // 50MB
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
        isDragActive
          ? 'border-indigo-500 bg-indigo-50'
          : 'border-gray-300 hover:border-gray-400',
        className
      )}
    >
      <input {...getInputProps()} />
      <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
      <p className="text-lg font-medium text-gray-900 mb-2">
        {isDragActive ? 'ファイルをドロップしてください' : 'ファイルをドラッグ＆ドロップ'}
      </p>
      <p className="text-sm text-gray-500">
        または クリックしてファイルを選択
      </p>
      <p className="text-xs text-gray-400 mt-2">
        対応形式: .zip, .pdf (最大 50MB)
      </p>
      
      {acceptedFiles.length > 0 && (
        <div className="mt-4 p-3 bg-gray-100 rounded flex items-center gap-2">
          <File className="w-5 h-5 text-indigo-600" />
          <span className="text-sm text-gray-700">{acceptedFiles[0].name}</span>
        </div>
      )}
    </div>
  );
}
