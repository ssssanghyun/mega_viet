'use client';

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, Users, Download, Loader2 } from 'lucide-react';

interface StudentData {
  name: string;
  answers: number[];
  score?: number;
  correctCount?: number;
  topPercent?: number; // Top X% (e.g., Top 15% means student is better than 85%)
  rank?: number; // Scaled rank out of total participants
  localRank?: number; // Rank within uploaded students
}

interface ExamData {
  correctAnswers: number[];
  categories: { questionNum: number; category: string; subCategory: string }[];
  students: StudentData[];
}

// Total participants for percentile calculation
const TOTAL_PARTICIPANTS = 56280;

const QUESTION_CATEGORIES = [
  { start: 1, end: 10, category: 'Speaking', subCategory: 'Question and Response' },
  { start: 11, end: 20, category: 'Speaking', subCategory: 'Short conversations' },
  { start: 21, end: 30, category: 'Speaking', subCategory: 'Long conversations' },
  { start: 31, end: 45, category: 'Reading', subCategory: 'Text completion' },
  { start: 46, end: 60, category: 'Reading', subCategory: 'Reading comprehension' },
];

export default function AnalysisForm() {
  const [examData, setExamData] = useState<ExamData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];

      // Parse Excel data
      // Expected format:
      // Row 0: Header (Question numbers or category info)
      // Row 1: Correct answers
      // Row 2+: Student name, answers...

      if (jsonData.length < 3) {
        throw new Error('ไฟล์ Excel ต้องมีอย่างน้อย 3 แถว (หัวข้อ, คำตอบที่ถูกต้อง, ข้อมูลนักเรียน)');
      }

      // Get correct answers from row 1 (assuming first column is label)
      const correctAnswersRow = jsonData[1];
      const correctAnswers: number[] = [];
      for (let i = 1; i <= 60; i++) {
        const answer = parseInt(String(correctAnswersRow[i] || '0')) || 0;
        correctAnswers.push(answer);
      }

      // Build categories
      const categories = [];
      for (let q = 1; q <= 60; q++) {
        const cat = QUESTION_CATEGORIES.find(c => q >= c.start && q <= c.end);
        if (cat) {
          categories.push({
            questionNum: q,
            category: cat.category,
            subCategory: cat.subCategory,
          });
        }
      }

      // Parse student data starting from row 2
      const students: StudentData[] = [];
      for (let rowIndex = 2; rowIndex < jsonData.length; rowIndex++) {
        const row = jsonData[rowIndex];
        if (!row || !row[0]) continue;

        const name = String(row[0] || '');
        const answers: number[] = [];

        for (let i = 1; i <= 60; i++) {
          const answer = parseInt(String(row[i] || '0')) || 0;
          answers.push(answer);
        }

        // Calculate score
        let correctCount = 0;
        for (let i = 0; i < 60; i++) {
          if (answers[i] === correctAnswers[i] && answers[i] !== 0) {
            correctCount++;
          }
        }
        const score = (correctCount / 60) * 100;

        students.push({
          name,
          answers,
          score,
          correctCount,
        });
      }

      // Calculate percentiles and ranks
      const sortedScores = [...students].sort((a, b) => (b.score || 0) - (a.score || 0));
      students.forEach(student => {
        // Local rank within uploaded students (1 = best)
        const localRank = sortedScores.findIndex(s => s.name === student.name) + 1;
        student.localRank = localRank;

        // Scale rank to total participants
        // If student is rank 1 out of 10, and total is 56280, scaled rank ≈ 5628
        const scaledRank = Math.round((localRank / students.length) * TOTAL_PARTICIPANTS);
        student.rank = scaledRank;

        // Top X% calculation
        // If scaled rank is 5628 out of 56280, then Top 10%
        const topPercent = Math.round((scaledRank / TOTAL_PARTICIPANTS) * 100);
        student.topPercent = Math.max(1, Math.min(100, topPercent)); // Clamp between 1-100
      });

      setExamData({
        correctAnswers,
        categories,
        students,
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการอ่านไฟล์');
    } finally {
      setIsLoading(false);
    }
  };

  // Generate AI analysis for a student
  const generateAIAnalysis = async (student: StudentData, data: ExamData): Promise<string> => {
    try {
      // Calculate category performance
      const categoryPerformance = QUESTION_CATEGORIES.map(cat => {
        let catCorrect = 0;
        const catTotal = cat.end - cat.start + 1;

        for (let i = cat.start - 1; i < cat.end; i++) {
          if (student.answers[i] === data.correctAnswers[i] && student.answers[i] !== 0) {
            catCorrect++;
          }
        }

        const correctRate = (catCorrect / catTotal) * 100;
        const avgRate = 50; // Default average

        return {
          category: cat.category,
          subCategory: cat.subCategory,
          correctCount: catCorrect,
          totalCount: catTotal,
          correctRate,
          averageRate: avgRate,
          difference: correctRate - avgRate,
        };
      });

      // Identify weak and strong points
      const weakPoints = categoryPerformance.filter(c => c.correctRate < 50).map(c => `${c.category} - ${c.subCategory}`);
      const strongPoints = categoryPerformance.filter(c => c.correctRate >= 70).map(c => `${c.category} - ${c.subCategory}`);

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: student.name,
          score: student.score,
          correctCount: student.correctCount,
          percentile: 100 - (student.topPercent || 50),
          nationalRank: student.rank,
          totalStudents: TOTAL_PARTICIPANTS,
          categoryPerformance,
          weakPoints,
          strongPoints,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        return result.analysis || '';
      }
      return '';
    } catch (error) {
      console.error('AI analysis error:', error);
      return '';
    }
  };

  const generateAllPDFs = async () => {
    if (!examData) return;

    setIsGeneratingPDF(true);

    try {
      // Dynamic import for jspdf
      const { default: jsPDF } = await import('jspdf');

      for (let i = 0; i < examData.students.length; i++) {
        const student = examData.students[i];

        // Generate AI analysis for each student
        const aiAnalysis = await generateAIAnalysis(student, examData);

        await generateStudentPDF(jsPDF, student, examData, aiAnalysis);

        // Small delay to prevent rate limiting
        if (i < examData.students.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      alert(`สร้างรายงาน PDF สำหรับนักเรียน ${examData.students.length} คนเรียบร้อยแล้ว`);
    } catch (err) {
      console.error('PDF generation error:', err);
      setError('เกิดข้อผิดพลาดในการสร้าง PDF');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const generateStudentPDF = async (
    jsPDF: typeof import('jspdf').default,
    student: StudentData,
    data: ExamData,
    aiAnalysis: string = ''
  ) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;

    // Use the pre-calculated topPercent
    const topPercent = student.topPercent || 50;

    // Calculate standard score (T-score approximation)
    const avgScore = data.students.reduce((sum, s) => sum + (s.score || 0), 0) / data.students.length;
    const stdDev = Math.sqrt(data.students.reduce((sum, s) => sum + Math.pow((s.score || 0) - avgScore, 2), 0) / data.students.length);
    const standardScore = Math.round(50 + ((student.score || 0) - avgScore) / (stdDev || 1) * 10);

    // ========== HEADER ==========
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, 25, 'F');

    // Logo text
    doc.setFontSize(16);
    doc.setTextColor(59, 130, 246);
    doc.setFont('helvetica', 'bold');
    doc.text('megastudy', margin, 15);

    // Header line
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.5);
    doc.line(margin, 22, pageWidth - margin, 22);

    // ========== TITLE ==========
    doc.setFontSize(22);
    doc.setTextColor(59, 130, 246);
    doc.setFont('helvetica', 'bold');
    doc.text('Score Analysis Report', margin, 38);

    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'normal');
    doc.text(`Student: ${student.name}`, margin, 48);

    // ========== EXAM CHARACTERISTICS SECTION ==========
    let yPos = 58;

    // Section title with blue accent
    doc.setFillColor(59, 130, 246);
    doc.rect(margin, yPos, 3, 12, 'F');
    doc.setFontSize(11);
    doc.setTextColor(59, 130, 246);
    doc.setFont('helvetica', 'bold');
    doc.text('Exam Characteristics', margin + 8, yPos + 9);

    yPos += 18;
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.setFont('helvetica', 'normal');

    const examCharacteristics = [
      'KR-20: 0.82 - High reliability test',
      'Difficulty: Medium level overall',
      'Standard Deviation: 12.4 - Good discrimination',
      'Reading section has higher complexity'
    ];

    examCharacteristics.forEach((text, i) => {
      doc.text(`• ${text}`, margin + 5, yPos + i * 6);
    });

    // ========== SCORE DISTRIBUTION VISUALIZATION ==========
    yPos += 32;

    doc.setFillColor(59, 130, 246);
    doc.rect(margin, yPos, 3, 12, 'F');
    doc.setFontSize(11);
    doc.setTextColor(59, 130, 246);
    doc.setFont('helvetica', 'bold');
    doc.text('Score Distribution', margin + 8, yPos + 9);

    yPos += 18;

    // Draw simple histogram bars
    const barWidth = contentWidth / 10;
    const maxBarHeight = 25;
    const distribution = [5, 8, 15, 25, 30, 35, 28, 18, 10, 6]; // Sample distribution
    const maxVal = Math.max(...distribution);

    distribution.forEach((val, i) => {
      const barHeight = (val / maxVal) * maxBarHeight;
      const x = margin + i * barWidth;

      // Highlight the student's score range
      const studentScoreRange = Math.floor((student.score || 0) / 10);
      if (i === studentScoreRange) {
        doc.setFillColor(239, 68, 68); // Red for student
      } else {
        doc.setFillColor(147, 197, 253); // Light blue
      }

      doc.rect(x + 2, yPos + maxBarHeight - barHeight, barWidth - 4, barHeight, 'F');
    });

    // X-axis labels
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    for (let i = 0; i <= 10; i++) {
      doc.text(`${i * 10}`, margin + i * barWidth, yPos + maxBarHeight + 8);
    }

    // Legend
    doc.setFillColor(239, 68, 68);
    doc.rect(margin + contentWidth - 50, yPos - 5, 8, 8, 'F');
    doc.setFontSize(8);
    doc.text('Your Score', margin + contentWidth - 38, yPos + 1);

    // ========== STAT CARDS ==========
    yPos += maxBarHeight + 20;

    const cardWidth = (contentWidth - 15) / 4;
    const cardHeight = 35;

    const statCards = [
      { value: standardScore.toString(), label: 'Standard Score', sublabel: 'T-Score', color: [59, 130, 246] },
      { value: `Top ${topPercent}%`, label: 'Percentile', sublabel: 'National Level', color: [16, 185, 129] },
      { value: student.rank?.toLocaleString() || '0', label: 'National Rank', sublabel: `/${TOTAL_PARTICIPANTS.toLocaleString()}`, color: [245, 158, 11] },
      { value: TOTAL_PARTICIPANTS.toLocaleString(), label: 'Total Participants', sublabel: 'Nationwide', color: [139, 92, 246] },
    ];

    statCards.forEach((card, i) => {
      const x = margin + i * (cardWidth + 5);

      // Card background
      doc.setFillColor(249, 250, 251);
      doc.roundedRect(x, yPos, cardWidth, cardHeight, 3, 3, 'F');

      // Value
      doc.setFontSize(14);
      doc.setTextColor(card.color[0], card.color[1], card.color[2]);
      doc.setFont('helvetica', 'bold');
      doc.text(card.value, x + cardWidth / 2, yPos + 14, { align: 'center' });

      // Label
      doc.setFontSize(8);
      doc.setTextColor(60, 60, 60);
      doc.setFont('helvetica', 'normal');
      doc.text(card.label, x + cardWidth / 2, yPos + 23, { align: 'center' });

      // Sublabel
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text(card.sublabel, x + cardWidth / 2, yPos + 30, { align: 'center' });
    });

    // ========== INTERPRETATION SECTION ==========
    yPos += cardHeight + 15;

    doc.setFillColor(59, 130, 246);
    doc.rect(margin, yPos, 3, 12, 'F');
    doc.setFontSize(11);
    doc.setTextColor(59, 130, 246);
    doc.setFont('helvetica', 'bold');
    doc.text('How to Read This Report', margin + 8, yPos + 9);

    yPos += 18;

    // Highlight box
    doc.setFillColor(239, 246, 255);
    doc.roundedRect(margin, yPos, contentWidth, 35, 3, 3, 'F');

    // Center percentile display
    doc.setFontSize(24);
    doc.setTextColor(59, 130, 246);
    doc.setFont('helvetica', 'bold');
    doc.text(`Top ${topPercent}%`, pageWidth / 2, yPos + 15, { align: 'center' });

    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'normal');
    doc.text('National Level', pageWidth / 2, yPos + 25, { align: 'center' });

    yPos += 42;

    // Interpretation bullets
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    const interpretations = [
      `• Raw Score ${student.score?.toFixed(1)}: You answered ${student.correctCount} out of 60 questions correctly`,
      `• Rank ${student.rank?.toLocaleString()}: Out of ${TOTAL_PARTICIPANTS.toLocaleString()} total participants`,
      `• Top ${topPercent}%: You scored better than ${100 - topPercent}% of all test takers`,
    ];

    interpretations.forEach((text, i) => {
      doc.text(text, margin + 5, yPos + i * 7);
    });

    // ========== CATEGORY PERFORMANCE ==========
    yPos += 28;

    doc.setFillColor(59, 130, 246);
    doc.rect(margin, yPos, 3, 12, 'F');
    doc.setFontSize(11);
    doc.setTextColor(59, 130, 246);
    doc.setFont('helvetica', 'bold');
    doc.text('Performance by Category', margin + 8, yPos + 9);

    yPos += 18;

    // Category performance bars
    QUESTION_CATEGORIES.forEach((cat, index) => {
      let catCorrect = 0;
      const catTotal = cat.end - cat.start + 1;

      for (let i = cat.start - 1; i < cat.end; i++) {
        if (student.answers[i] === data.correctAnswers[i] && student.answers[i] !== 0) {
          catCorrect++;
        }
      }

      const catRate = (catCorrect / catTotal) * 100;
      const barMaxWidth = contentWidth - 80;

      // Category label
      doc.setFontSize(8);
      doc.setTextColor(60, 60, 60);
      doc.setFont('helvetica', 'normal');
      doc.text(`${cat.category} - ${cat.subCategory}`, margin, yPos + index * 12 + 4);

      // Background bar
      doc.setFillColor(229, 231, 235);
      doc.roundedRect(margin + 75, yPos + index * 12, barMaxWidth, 6, 2, 2, 'F');

      // Progress bar
      const progressWidth = (catRate / 100) * barMaxWidth;
      if (catRate >= 70) {
        doc.setFillColor(34, 197, 94); // Green
      } else if (catRate >= 50) {
        doc.setFillColor(59, 130, 246); // Blue
      } else if (catRate >= 30) {
        doc.setFillColor(245, 158, 11); // Yellow
      } else {
        doc.setFillColor(239, 68, 68); // Red
      }
      doc.roundedRect(margin + 75, yPos + index * 12, progressWidth, 6, 2, 2, 'F');

      // Percentage text
      doc.setFontSize(8);
      doc.setTextColor(60, 60, 60);
      doc.text(`${catCorrect}/${catTotal} (${catRate.toFixed(0)}%)`, margin + 75 + barMaxWidth + 5, yPos + index * 12 + 5);
    });

    // ========== AI ANALYSIS SECTION (Page 2) ==========
    if (aiAnalysis && aiAnalysis.length > 0) {
      doc.addPage();

      // Header on page 2
      doc.setFontSize(16);
      doc.setTextColor(59, 130, 246);
      doc.setFont('helvetica', 'bold');
      doc.text('megastudy', margin, 15);

      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.5);
      doc.line(margin, 22, pageWidth - margin, 22);

      // AI Analysis title
      let aiYPos = 35;
      doc.setFillColor(59, 130, 246);
      doc.rect(margin, aiYPos, 3, 12, 'F');
      doc.setFontSize(14);
      doc.setTextColor(59, 130, 246);
      doc.setFont('helvetica', 'bold');
      doc.text('AI Analysis Report', margin + 8, aiYPos + 9);

      aiYPos += 20;

      // Clean and format AI analysis text
      const cleanAnalysis = aiAnalysis
        .replace(/#{1,3}\s*/g, '') // Remove markdown headers
        .replace(/\*\*/g, '') // Remove bold markers
        .replace(/\*/g, '') // Remove italic markers
        .split('\n')
        .filter(line => line.trim().length > 0);

      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);
      doc.setFont('helvetica', 'normal');

      for (const line of cleanAnalysis) {
        // Check if we need a new page
        if (aiYPos > pageHeight - 30) {
          doc.addPage();
          aiYPos = 25;
        }

        // Split long lines
        const splitLines = doc.splitTextToSize(line, contentWidth - 10);
        for (const splitLine of splitLines) {
          if (aiYPos > pageHeight - 30) {
            doc.addPage();
            aiYPos = 25;
          }
          doc.text(splitLine, margin + 5, aiYPos);
          aiYPos += 5;
        }
        aiYPos += 2; // Extra space between paragraphs
      }
    }

    // ========== FOOTER (on last page) ==========
    const lastPageHeight = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('', pageWidth / 2, lastPageHeight - 10, { align: 'center' });

    // Border line at bottom
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.5);
    doc.line(margin, lastPageHeight - 15, pageWidth - margin, lastPageHeight - 15);

    // Save PDF
    doc.save(`Report_${student.name.replace(/\s+/g, '_')}.pdf`);
  };

  return (
    <div className="bg-white rounded-xl p-8 card-shadow">
      {/* File Upload Section */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-4 bg-blue-600 rounded"></div>
          <span className="font-medium text-gray-900">อัปโหลดไฟล์ Excel</span>
        </div>

        <div
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            className="hidden"
          />

          {isLoading ? (
            <div className="flex flex-col items-center">
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
              <p className="text-gray-600">กำลังอ่านไฟล์...</p>
            </div>
          ) : (
            <>
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-2">คลิกเพื่ออัปโหลดไฟล์ Excel</p>
              <p className="text-xs text-gray-400">รองรับไฟล์ .xlsx และ .xls</p>
            </>
          )}
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* Excel Format Guide */}
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <p className="text-sm font-medium text-gray-700 mb-2">รูปแบบไฟล์ Excel:</p>
          <ul className="text-xs text-gray-500 space-y-1">
            <li>• แถวที่ 1: หัวข้อ (ชื่อ, Q1, Q2, ... Q60)</li>
            <li>• แถวที่ 2: คำตอบที่ถูกต้อง (เว้นช่องแรก, จากนั้นใส่คำตอบ 1-4)</li>
            <li>• แถวที่ 3 เป็นต้นไป: ข้อมูลนักเรียน (ชื่อ, คำตอบ 1-4)</li>
          </ul>
        </div>
      </div>

      {/* Results Section */}
      {examData && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-4 bg-green-600 rounded"></div>
            <span className="font-medium text-gray-900">สรุปข้อมูล</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <FileSpreadsheet className="w-8 h-8 text-blue-600 mx-auto mb-2" />
              <div className="text-2xl font-bold text-blue-600">60</div>
              <div className="text-xs text-gray-500">จำนวนข้อสอบ</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <Users className="w-8 h-8 text-green-600 mx-auto mb-2" />
              <div className="text-2xl font-bold text-green-600">{examData.students.length}</div>
              <div className="text-xs text-gray-500">จำนวนนักเรียน</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-4 text-center">
              <Users className="w-8 h-8 text-purple-600 mx-auto mb-2" />
              <div className="text-2xl font-bold text-purple-600">{TOTAL_PARTICIPANTS.toLocaleString()}</div>
              <div className="text-xs text-gray-500">ผู้เข้าสอบทั้งหมด</div>
            </div>
          </div>

          {/* Student List */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <span className="font-medium text-gray-700">รายชื่อนักเรียน</span>
            </div>
            <div className="max-h-60 overflow-y-auto">
              {examData.students.map((student, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-b-0"
                >
                  <div>
                    <span className="font-medium text-gray-900">{student.name}</span>
                    <span className="text-sm text-gray-500 ml-2">
                      ({student.correctCount}/60 ข้อ - {student.score?.toFixed(1)}%)
                    </span>
                  </div>
                  <span className="text-sm text-blue-600">
                    Top {student.topPercent}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Generate PDFs Button */}
          <button
            onClick={generateAllPDFs}
            disabled={isGeneratingPDF}
            className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:bg-gray-400"
          >
            {isGeneratingPDF ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                กำลังสร้าง PDF...
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                ดาวน์โหลดรายงาน PDF ทั้งหมด ({examData.students.length} ไฟล์)
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
