import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      studentName,
      score,
      correctCount,
      percentile,
      nationalRank,
      totalStudents,
      categoryPerformance,
      weakPoints,
      strongPoints,
      difficultyPerformance,
      statistics,
      advancedStatistics,
      standardScore,
      incorrectQuestions,
    } = body;

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key is not configured' },
        { status: 500 }
      );
    }

    // 통계 데이터를 기반으로 프롬프트 구성
    // 안전한 값 추출
    const safeScore = typeof score === 'number' && !isNaN(score) ? score : 0;
    const safeCorrectCount = typeof correctCount === 'number' && !isNaN(correctCount) ? correctCount : 0;
    const safePercentile = typeof percentile === 'number' && !isNaN(percentile) ? percentile : 0;
    const safeStandardScore = typeof standardScore === 'number' && !isNaN(standardScore) ? standardScore : null;
    const safeNationalRank = typeof nationalRank === 'number' && !isNaN(nationalRank) ? nationalRank : 0;
    const safeTotalStudents = typeof totalStudents === 'number' && !isNaN(totalStudents) ? totalStudents : 0;
    
    const percentileDisplay = Math.round(100 - safePercentile);
    
    // 데이터 검증
    if (!studentName || !categoryPerformance || !Array.isArray(categoryPerformance)) {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    }
    
    const prompt = `당신은 교육 전문가이자 학습 상담사입니다. 다음 시험 결과 데이터를 종합적으로 분석하여 학생에게 상세한 분석 보고서를 작성해주세요.

# 학생 기본 정보
- 이름: ${studentName || 'N/A'}
- 총점: ${safeScore.toFixed(1)}점 (${safeCorrectCount}/60 정답, 정답률 ${((safeCorrectCount/60)*100).toFixed(1)}%)
- 백분위: 상위 ${percentileDisplay}%
- 전국 순위: ${safeNationalRank}위 / ${safeTotalStudents}명
- 표준점수 (T-Score): ${safeStandardScore != null ? safeStandardScore.toFixed(1) : 'N/A'}

# 과목별 상세 성취도
${categoryPerformance && Array.isArray(categoryPerformance) && categoryPerformance.length > 0 ? categoryPerformance.map((cat: any) => {
  const correctRate = typeof cat.correctRate === 'number' ? cat.correctRate : 0;
  const averageRate = typeof cat.averageRate === 'number' ? cat.averageRate : 0;
  const difference = typeof cat.difference === 'number' ? cat.difference : 0;
  return `- ${cat.category || 'N/A'} - ${cat.subCategory || 'N/A'}: ${cat.correctCount || 0}/${cat.totalCount || 0} 정답 (${correctRate.toFixed(1)}%)
  * 평균 대비: ${difference > 0 ? '+' : ''}${difference.toFixed(1)}%p (전체 평균: ${averageRate.toFixed(1)}%)`;
}).join('\n') : '- 데이터 없음'}

# 강점 및 약점 분석
${strongPoints && Array.isArray(strongPoints) && strongPoints.length > 0 ? `## 강점 영역
${strongPoints.map((p: string) => `- ${p}`).join('\n')}` : '## 강점 영역\n- 특별히 두드러지는 강점 영역이 없습니다.'}

${weakPoints && Array.isArray(weakPoints) && weakPoints.length > 0 ? `## 보완이 필요한 영역
${weakPoints.map((p: string) => `- ${p}`).join('\n')}` : '## 보완이 필요한 영역\n- 모든 영역에서 평균 이상의 성적을 보이고 있습니다.'}

# 난이도 구간별 성취도 분석
${difficultyPerformance && Array.isArray(difficultyPerformance) && difficultyPerformance.length > 0 ? difficultyPerformance.map((d: any) => {
  const levelName = d.level === 'easy' ? '쉬움' : d.level === 'medium' ? '중간' : '어려움';
  const levelDesc = d.level === 'easy' ? '(p-value ≥ 0.7)' : d.level === 'medium' ? '(0.3 < p-value < 0.7)' : '(p-value ≤ 0.3)';
  const studentRate = typeof d.studentCorrectRate === 'number' && !isNaN(d.studentCorrectRate) ? d.studentCorrectRate : 0;
  const avgRate = typeof d.averageCorrectRate === 'number' && !isNaN(d.averageCorrectRate) ? d.averageCorrectRate : 0;
  return `- ${levelName} ${levelDesc}: ${d.correctCount || 0}/${d.questionCount || 0} 정답 (${studentRate.toFixed(1)}%)
  * 전체 평균: ${avgRate.toFixed(1)}%
  * 차이: ${(studentRate - avgRate).toFixed(1)}%p`;
}).join('\n') : '- 데이터 없음'}

# 전체 시험 통계
- 평균 점수: ${statistics?.averageScore != null ? statistics.averageScore.toFixed(1) : 'N/A'}점
- 표준편차: ${statistics?.standardDeviation != null ? statistics.standardDeviation.toFixed(1) : 'N/A'}
- 중앙값: ${statistics?.medianScore != null ? statistics.medianScore.toFixed(1) : 'N/A'}점
- 최고점: ${statistics?.maxScore != null ? statistics.maxScore.toFixed(1) : 'N/A'}점
- 최저점: ${statistics?.minScore != null ? statistics.minScore.toFixed(1) : 'N/A'}점
- 상위 10% 평균: ${statistics?.top10PercentAverage != null ? statistics.top10PercentAverage.toFixed(1) : 'N/A'}점

# 시험 품질 지표
${advancedStatistics && typeof advancedStatistics.kr20 === 'number' && !isNaN(advancedStatistics.kr20) ? `- KR-20 신뢰도: ${advancedStatistics.kr20.toFixed(3)} ${advancedStatistics.kr20 >= 0.8 ? '(매우 안정적)' : advancedStatistics.kr20 >= 0.6 ? '(보통)' : '(개선 필요)'}
- 난이도 분포:
  * 쉬움 (p≥0.7): ${advancedStatistics.difficultyDistribution?.easy || 0}개
  * 중간 (0.3<p<0.7): ${advancedStatistics.difficultyDistribution?.medium || 0}개
  * 어려움 (p≤0.3): ${advancedStatistics.difficultyDistribution?.hard || 0}개` : '- 데이터 없음'}

# 점수 분포
${statistics?.scoreDistribution ? statistics.scoreDistribution.map((dist: any) => 
  `- ${dist.range}점: ${dist.count}명`
).join('\n') : '- 데이터 없음'}

---

위의 모든 통계 데이터를 종합하여 다음 형식으로 **상세한 분석 보고서**를 작성해주세요:

## 종합 분석 보고서

### 1. 전체 성취도 평가
다음 통계 수치를 반드시 포함하여 학생의 전반적인 성취 수준을 분석해주세요:

통계 수치:
- 총점: ${safeScore.toFixed(1)}점 (정답 수: ${safeCorrectCount}/60문제, 정답률 ${((safeCorrectCount/60)*100).toFixed(1)}%)
- 백분위: 상위 ${percentileDisplay}% (전국 ${safeTotalStudents}명 중 ${safeNationalRank}위)
- 표준점수: ${safeStandardScore != null ? safeStandardScore.toFixed(1) : 'N/A'}점
- 전체 평균 점수: ${statistics?.averageScore != null ? statistics.averageScore.toFixed(1) : 'N/A'}점
- 전체 표준편차: ${statistics?.standardDeviation != null ? statistics.standardDeviation.toFixed(1) : 'N/A'}

위의 모든 통계 수치를 명시적으로 언급하면서 학생의 전반적인 성취 수준을 상세하게 분석해주세요. 점수, 순위, 백분위, 표준점수 등을 구체적으로 비교하고 해석해주세요. (5-6문장)

### 2. 과목별 성취도 분석
각 과목별로 다음 통계 수치를 반드시 포함하여 분석해주세요:
${categoryPerformance && Array.isArray(categoryPerformance) && categoryPerformance.length > 0 ? categoryPerformance.map((cat: any, idx: number) => {
  const correctRate = typeof cat.correctRate === 'number' ? cat.correctRate : 0;
  const averageRate = typeof cat.averageRate === 'number' ? cat.averageRate : 0;
  const difference = typeof cat.difference === 'number' ? cat.difference : 0;
  return `
${idx + 1}. ${cat.category || 'N/A'} - ${cat.subCategory || 'N/A'}
   반드시 포함할 통계: 정답 ${cat.correctCount || 0}/${cat.totalCount || 0} (정답률 ${correctRate.toFixed(1)}%), 전체 평균 ${averageRate.toFixed(1)}%, 평균 대비 ${difference > 0 ? '+' : ''}${difference.toFixed(1)}%p
   위 통계 수치를 명시적으로 언급하면서 이 영역의 강점과 약점을 상세하게 분석해주세요. 정답률이 높거나 낮은 이유, 평균 대비 차이가 의미하는 바, 향후 개선 방향 등을 구체적으로 설명해주세요. (3-4문장)`;
}).join('\n') : ''}

${difficultyPerformance && Array.isArray(difficultyPerformance) && difficultyPerformance.length > 0 ? `### 3. 난이도별 실력 구조 분석
다음 통계 수치를 반드시 포함하여 학생의 실력 구조를 분석해주세요:

통계 수치:
${difficultyPerformance.map((d: any) => {
  const levelName = d.level === 'easy' ? '쉬움' : d.level === 'medium' ? '중간' : '어려움';
  const studentRate = typeof d.studentCorrectRate === 'number' ? d.studentCorrectRate : 0;
  const avgRate = typeof d.averageCorrectRate === 'number' ? d.averageCorrectRate : 0;
  const diff = studentRate - avgRate;
  return `- ${levelName} (${d.questionCount || 0}문제): 정답 ${d.correctCount || 0}개 (정답률 ${studentRate.toFixed(1)}%), 전체 평균 정답률 ${avgRate.toFixed(1)}%, 평균 대비 ${diff > 0 ? '+' : ''}${diff.toFixed(1)}%p`;
}).join('\n')}

위의 모든 통계 수치를 명시적으로 언급하면서 학생의 실력 구조를 상세하게 분석해주세요. 각 난이도 구간별 정답률을 비교하고, 쉬운 문제를 틀렸다면 기초 부족 가능성, 어려운 문제를 잘 맞혔다면 상위권 잠재력 등을 구체적으로 설명해주세요. 또한 평균 대비 차이를 분석하여 학생의 강점과 약점이 어떤 난이도 구간에 있는지 명확히 제시해주세요. (6-8문장)` : ''}

### 4. 강점 및 약점 종합 분석
${strongPoints && Array.isArray(strongPoints) && strongPoints.length > 0 ? `**강점 영역:** ${strongPoints.join(', ')}` : '**강점 영역:** 특별히 두드러지는 강점이 없습니다.'}

${weakPoints && Array.isArray(weakPoints) && weakPoints.length > 0 ? `**보완 필요 영역:** ${weakPoints.join(', ')}` : '**보완 필요 영역:** 모든 영역에서 평균 이상입니다.'}

${incorrectQuestions && Array.isArray(incorrectQuestions) && incorrectQuestions.length > 0 ? `
**틀린 문제 상세 분석:**
틀린 문제 번호와 해당 분야/유형:
${incorrectQuestions.map((q: any) => `- Q${q.questionNumber}: ${q.category} - ${q.subCategory}`).join('\n')}

틀린 문제를 분야별로 그룹화:
${(() => {
  const grouped: { [key: string]: number[] } = {};
  incorrectQuestions.forEach((q: any) => {
    const key = `${q.category} - ${q.subCategory}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(q.questionNumber);
  });
  return Object.entries(grouped).map(([key, questions]) => 
    `- ${key}: ${questions.join(', ')}번 문제 (총 ${questions.length}문제)`
  ).join('\n');
})()}
` : ''}

위 강점과 약점 목록${incorrectQuestions && Array.isArray(incorrectQuestions) && incorrectQuestions.length > 0 ? ', 그리고 틀린 문제 분석' : ''}을 반드시 언급하면서, 각 영역이 전체 성적에 미치는 영향을 상세하게 분석해주세요. 

${incorrectQuestions && Array.isArray(incorrectQuestions) && incorrectQuestions.length > 0 ? `틀린 문제 분석을 바탕으로:
- 틀린 문제가 가장 많은 분야: ${(() => {
  const categoryCount: { [key: string]: number } = {};
  incorrectQuestions.forEach((q: any) => {
    categoryCount[q.category] = (categoryCount[q.category] || 0) + 1;
  });
  return Object.entries(categoryCount).sort((a, b) => b[1] - a[1]).map(([cat, count]) => `${cat} (${count}문제)`).join(', ');
})()}
- 틀린 문제가 가장 많은 유형: ${(() => {
  const subCategoryCount: { [key: string]: number } = {};
  incorrectQuestions.forEach((q: any) => {
    subCategoryCount[q.subCategory] = (subCategoryCount[q.subCategory] || 0) + 1;
  });
  return Object.entries(subCategoryCount).sort((a, b) => b[1] - a[1]).map(([sub, count]) => `${sub} (${count}문제)`).join(', ');
})()}
- 틀린 문제 패턴이 무엇을 의미하는지 구체적으로 분석
` : ''}

강점 영역이 전체 점수에 얼마나 기여했는지, 약점 영역이 어떤 식으로 점수를 낮췄는지, 각 영역의 중요도와 개선 필요성을 구체적으로 설명해주세요. (8-10문장)

### 5. 시험 품질 및 고급 통계 분석
다음 통계 수치를 반드시 포함하여 이번 시험의 난이도와 품질을 종합적으로 평가해주세요:

**시험 품질 지표:**
${advancedStatistics && typeof advancedStatistics.kr20 === 'number' ? `- KR-20 신뢰도: ${advancedStatistics.kr20.toFixed(3)} ${advancedStatistics.kr20 >= 0.8 ? '(매우 안정적)' : advancedStatistics.kr20 >= 0.6 ? '(보통)' : '(개선 필요)'}
- 난이도 분포: 쉬움 ${advancedStatistics.difficultyDistribution?.easy || 0}개, 중간 ${advancedStatistics.difficultyDistribution?.medium || 0}개, 어려움 ${advancedStatistics.difficultyDistribution?.hard || 0}개` : '- 시험 품질 데이터 없음'}

**시험 점수 통계:**
- 최고점: ${statistics?.maxScore != null ? statistics.maxScore.toFixed(1) : 'N/A'}점
- 최저점: ${statistics?.minScore != null ? statistics.minScore.toFixed(1) : 'N/A'}점
- 중앙값: ${statistics?.medianScore != null ? statistics.medianScore.toFixed(1) : 'N/A'}점
- 상위 10% 평균: ${statistics?.top10PercentAverage != null ? statistics.top10PercentAverage.toFixed(1) : 'N/A'}점

${advancedStatistics && advancedStatistics.questionDiscriminations && Array.isArray(advancedStatistics.questionDiscriminations) && advancedStatistics.questionDiscriminations.length > 0 ? `
**문항 품질 분석:**
- 변별도가 높은 문항 (D-index ≥ 0.3): ${advancedStatistics.questionDiscriminations.filter((q: any) => q.dIndex >= 0.3).length}개
- 변별도가 보통인 문항 (0.1 ≤ D-index < 0.3): ${advancedStatistics.questionDiscriminations.filter((q: any) => q.dIndex >= 0.1 && q.dIndex < 0.3).length}개
- 변별도가 낮은 문항 (D-index < 0.1): ${advancedStatistics.questionDiscriminations.filter((q: any) => q.dIndex < 0.1).length}개
- 상위/하위 10% 평균 Gap: ${(advancedStatistics.questionDiscriminations.reduce((sum: number, q: any) => sum + (q.gap || 0), 0) / advancedStatistics.questionDiscriminations.length).toFixed(2)}
` : ''}

${advancedStatistics && advancedStatistics.questionDifficulties && Array.isArray(advancedStatistics.questionDifficulties) && advancedStatistics.questionDifficulties.length > 0 ? `
**문항 난이도 분석 (p-value 기준):**

p-value는 전체 학생 중 해당 문항을 맞춘 학생의 비율로, 0-1 사이의 값입니다. 1에 가까울수록 쉬운 문항, 0에 가까울수록 어려운 문항입니다.

**가장 쉬운 문항 상위 5개 (높은 p-value):**
${advancedStatistics.questionDifficulties
  .sort((a: any, b: any) => b.pValue - a.pValue)
  .slice(0, 5)
  .map((q: any, idx: number) => `${idx + 1}. Q${q.questionNumber}: p-value ${(q.pValue * 100).toFixed(1)}% (${q.category} - ${q.subCategory})`)
  .join('\n')}

**가장 어려운 문항 상위 5개 (낮은 p-value):**
${advancedStatistics.questionDifficulties
  .sort((a: any, b: any) => a.pValue - b.pValue)
  .slice(0, 5)
  .map((q: any, idx: number) => `${idx + 1}. Q${q.questionNumber}: p-value ${(q.pValue * 100).toFixed(1)}% (${q.category} - ${q.subCategory})`)
  .join('\n')}

**p-value 해석 기준:**
- p-value ≥ 0.7 (70% 이상): 쉬운 문항 - 기초 지식 확인용
- 0.3 < p-value < 0.7 (30-70%): 중간 난이도 - 표준 수준
- p-value ≤ 0.3 (30% 이하): 어려운 문항 - 변별력을 높이는 핵심 문항
` : ''}

위의 모든 통계 수치(KR-20 신뢰도, 난이도 분포, 문항 품질, p-value 분석 등)를 명시적으로 언급하면서 이번 시험의 난이도와 품질을 상세하게 평가해주세요. 

시험 품질 평가:
- KR-20 신뢰도가 시험의 안정성을 어떻게 나타내는지 구체적으로 설명
- 난이도 분포가 적절한지, 시험의 변별력에 미치는 영향 분석
- 문항 품질(변별도)이 시험의 신뢰성에 미치는 영향 설명

학생 점수 해석:
- 학생의 점수(${safeScore.toFixed(1)}점)가 시험 품질을 고려했을 때 어떤 의미인지 상세 분석
- p-value 분석 결과를 바탕으로 학생이 쉬운 문항을 많이 맞췄는지, 어려운 문항을 맞췄는지 등 실력 구조 평가
- 가장 쉬운/어려운 문항 목록을 참고하여 학생의 기초 실력과 심화 실력 수준을 평가
- 시험 난이도가 학생에게 유리했는지 불리했는지 판단

(8-10문장)

### 6. 구체적 학습 권장사항
위에서 분석한 모든 통계 데이터(과목별 성취도, 난이도별 성취도, 강점/약점, 문항 품질 분석)를 바탕으로 구체적이고 실행 가능한 학습 전략을 제시해주세요. 

${advancedStatistics && advancedStatistics.questionDifficulties && Array.isArray(advancedStatistics.questionDifficulties) ? `특히 다음을 고려해주세요:
- 가장 쉬운 문항(기초 문제) 중 틀린 문제가 있다면 기초 학습 강화
- 가장 어려운 문항(심화 문제) 중 맞춘 문제가 있다면 상위권 잠재력 인정
` : ''}

약점 영역(${weakPoints && Array.isArray(weakPoints) && weakPoints.length > 0 ? weakPoints.join(', ') : '없음'})에 대한 구체적인 개선 방법을 상세하게 제시해주세요. 

${incorrectQuestions && Array.isArray(incorrectQuestions) && incorrectQuestions.length > 0 ? `
틀린 문제 번호를 구체적으로 언급하면서:
- 틀린 문제 번호: ${incorrectQuestions.map((q: any) => `Q${q.questionNumber}`).join(', ')}
- 각 틀린 문제가 속한 분야와 유형을 명시
- 어떤 분야(${[...new Set(incorrectQuestions.map((q: any) => q.category))].join(', ')})에서 약한지
- 어떤 유형(${[...new Set(incorrectQuestions.map((q: any) => q.subCategory))].join(', ')})에서 약한지
- 틀린 문제 패턴을 바탕으로 한 구체적인 학습 전략 제시
` : ''}

각 약점 영역별로:
- 왜 해당 영역이 약점인지 원인 분석 (틀린 문제 번호를 구체적으로 언급)
- 구체적인 학습 방법과 자료 제안
- 일일/주간 학습 계획 제시
- 학습 효과를 측정할 수 있는 방법 제안

강점 영역 유지 및 향상:
- 현재 강점을 어떻게 유지할지 방안 제시
- 더 높은 수준으로 향상시키기 위한 방법 제안

${advancedStatistics && advancedStatistics.questionDifficulties && Array.isArray(advancedStatistics.questionDifficulties) ? `
특히 문항 난이도 분석을 바탕으로:
- 가장 쉬운 문항(기초 문제) 중 틀린 문제가 있다면 기초 학습 강화 방법 제시
- 가장 어려운 문항(심화 문제) 중 맞춘 문제가 있다면 상위권 잠재력 인정 및 심화 학습 방향 제시
` : ''}

(10-12문장)

### 7. 목표 설정 및 향후 계획
현재 위치(상위 ${percentileDisplay}%, ${safeNationalRank}위)를 바탕으로 단기 및 중장기 목표를 상세하게 제시하고, 단계별 학습 계획을 구체적으로 제안해주세요. 

목표 설정:
- 단기 목표 (1-2개월): 구체적인 점수 향상 목표 및 달성 방법
- 중기 목표 (3-6개월): 백분위 향상 목표 및 순위 목표
- 장기 목표 (6개월 이상): 최종 목표와 비전

단계별 학습 계획:
- 1단계: 기초 다지기 (기간, 방법, 평가 기준)
- 2단계: 실력 향상 (기간, 방법, 평가 기준)
- 3단계: 목표 달성 (기간, 방법, 평가 기준)

각 단계별로 학습 시간, 학습 내용, 연습 방법, 성취도 평가 방법을 구체적으로 제시해주세요. (6-8문장)

---

**작성 요청사항:**
- 위에 명시된 모든 통계 수치를 반드시 보고서에 포함해야 합니다
- 숫자와 퍼센트를 정확히 언급하여 보고서를 구체적으로 작성하세요
- 통계를 단순 나열이 아닌 해석과 분석으로 연결하세요
- 객관적이고 구체적인 피드백 제공
- 긍정적이고 격려하는 톤 유지
- 보고서 형식으로 구조화하여 작성
- 각 섹션을 명확히 구분하여 가독성 높게 작성`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: '당신은 친절하고 전문적인 교육 상담사이자 교육 통계 분석 전문가입니다. 학생의 시험 결과를 종합적으로 분석하여 상세한 분석 보고서를 작성합니다. 모든 통계 수치를 정확히 해석하고, 학생이 이해하기 쉽게 설명합니다.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 4000,
    });

    const analysis = completion.choices[0]?.message?.content || '분석을 생성할 수 없습니다.';

    return NextResponse.json({ analysis });
  } catch (error: any) {
    console.error('OpenAI API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate analysis' },
      { status: 500 }
    );
  }
}

