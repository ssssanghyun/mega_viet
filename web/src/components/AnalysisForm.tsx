'use client';

import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, Loader2, CheckCircle2 } from 'lucide-react';

interface UploadResult {
  reportCount: number;
  statsPath: string;
  skippedSubjects?: string[];
  files?: { filename: string; data: string }[];
}

export default function AnalysisForm() {
  const [math1File, setMath1File] = useState<File | null>(null);
  const [math2File, setMath2File] = useState<File | null>(null);
  const [engFile, setEngFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const math1InputRef = useRef<HTMLInputElement>(null);
  const math2InputRef = useRef<HTMLInputElement>(null);
  const engInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (
    setter: (file: File | null) => void,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0] || null;
    setter(file);
  };

  const handleSubmit = async () => {
    setError(null);
    setResult(null);

    if (!math1File && !math2File && !engFile) {
      setError('กรุณาอัปโหลดไฟล์ OMR อย่างน้อย 1 วิชา');
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      if (math1File) formData.append('math1', math1File);
      if (math2File) formData.append('math2', math2File);
      if (engFile) formData.append('eng', engFile);

      const response = await fetch('/api/reports', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'เกิดข้อผิดพลาดในการประมวลผลไฟล์');
      }

      if (Array.isArray(data.files)) {
        data.files.forEach((file: { filename: string; data: string }) => {
          const byteCharacters = atob(file.data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = file.filename;
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(link.href);
        });
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการประมวลผลไฟล์');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl p-8 card-shadow">
      {/* File Upload Section */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-4 bg-blue-600 rounded"></div>
          <span className="font-medium text-gray-900">อัปโหลดไฟล์ OMR (3 วิชา)</span>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            { label: 'Math 1 OMR', ref: math1InputRef, file: math1File, setter: setMath1File },
            { label: 'Math 2 OMR', ref: math2InputRef, file: math2File, setter: setMath2File },
            { label: 'ENG OMR', ref: engInputRef, file: engFile, setter: setEngFile },
          ].map((item) => (
            <div
              key={item.label}
              className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-500 transition-colors cursor-pointer"
              onClick={() => item.ref.current?.click()}
            >
              <input
                ref={item.ref}
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => handleFileChange(item.setter, e)}
                className="hidden"
              />
              <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-900">{item.label}</p>
              <p className="text-xs text-gray-400 mt-1">
                {item.file ? item.file.name : 'คลิกเพื่ออัปโหลด'}
              </p>
            </div>
          ))}
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}

        <div className="mt-4 p-4 bg-gray-50 rounded-lg text-xs text-gray-500">
          สามารถอัปโหลดไฟล์ OMR แยกแต่ละวิชาได้ (Math1, Math2, ENG) ระบบจะสร้างรายงานเฉพาะวิชาที่อัปโหลด
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={isSubmitting}
        className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:bg-gray-400"
      >
        {isSubmitting ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <FileSpreadsheet className="w-5 h-5" />
        )}
        {isSubmitting ? 'กำลังสร้างรายงาน...' : 'สร้างรายงาน PDF ทั้งหมด'}
      </button>

      {result && (
        <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-4 w-4" />
            รายงานสร้างสำเร็จ {result.reportCount} ไฟล์
          </div>
          <div className="mt-2 text-xs text-green-600">
            บันทึกไว้ที่ {result.statsPath}
          </div>
          {result.skippedSubjects && result.skippedSubjects.length > 0 && (
            <div className="mt-2 text-xs text-green-600">
              ข้ามวิชา: {result.skippedSubjects.join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
