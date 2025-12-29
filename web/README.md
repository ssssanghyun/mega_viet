# Megastudy - AI 점수 분석 시스템

Next.js 기반의 AI 점수 분석 시스템입니다.

## 배포 전 확인 사항

### 1. 환경 변수 설정

Vercel 대시보드에서 다음 환경 변수를 설정해야 합니다:

- `OPENAI_API_KEY`: OpenAI API 키 (필수)

### 2. 배포 설정

1. Vercel에 프로젝트를 import 합니다
2. Root Directory를 `web`으로 설정합니다 (프로젝트 루트가 상위 디렉토리인 경우)
3. 환경 변수 `OPENAI_API_KEY`를 설정합니다
4. 배포를 시작합니다

### 3. 로컬 테스트

배포 전 로컬에서 빌드 테스트를 권장합니다:

```bash
cd web
npm install
npm run build
```

## 기술 스택

- Next.js 16.1.0
- React 19.2.3
- TypeScript
- Tailwind CSS 4
- OpenAI API
- Recharts (차트 라이브러리)
