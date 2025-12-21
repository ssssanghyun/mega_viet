# Vercel 배포 가이드

## 배포 준비 완료 ✅

프로젝트가 Vercel 배포 준비가 완료되었습니다.

## 배포 방법

### 방법 1: Vercel CLI로 배포 (권장)

1. Vercel CLI 설치 (아직 설치하지 않은 경우)
```bash
npm install -g vercel
```

2. 프로젝트 디렉토리로 이동
```bash
cd web
```

3. Vercel 로그인 및 배포
```bash
vercel login
vercel
```

4. 배포 과정에서:
   - 프로젝트 이름 설정
   - 환경 변수 `OPENAI_API_KEY` 입력 (또는 나중에 Vercel 대시보드에서 설정)

### 방법 2: GitHub 연동 배포

1. GitHub에 프로젝트 푸시
```bash
git add .
git commit -m "Prepare for Vercel deployment"
git push origin main
```

2. Vercel 웹사이트 접속
   - https://vercel.com 접속
   - GitHub 계정으로 로그인

3. 새 프로젝트 생성
   - "New Project" 클릭
   - GitHub 저장소 선택
   - **Root Directory를 `web`으로 설정** (중요!)
   - Framework Preset: Next.js (자동 감지)

4. 환경 변수 설정
   - Environment Variables 섹션에서:
   - Key: `OPENAI_API_KEY`
   - Value: 실제 OpenAI API 키 입력
   - Production, Preview, Development 모두에 적용

5. 배포 실행
   - "Deploy" 버튼 클릭

## 환경 변수 설정

### 필수 환경 변수
- `OPENAI_API_KEY`: OpenAI API 키 (https://platform.openai.com/api-keys 에서 발급)

### Vercel 대시보드에서 환경 변수 설정 방법
1. 프로젝트 선택
2. Settings → Environment Variables
3. "Add New" 클릭
4. Key: `OPENAI_API_KEY`
5. Value: 실제 API 키 입력
6. Environment: Production, Preview, Development 선택
7. Save

## 배포 후 확인 사항

1. 배포된 URL로 접속 확인
2. 홈페이지 로드 확인
3. 점수 분석 기능 테스트
4. API 엔드포인트 `/api/analyze` 정상 작동 확인

## 문제 해결

### 빌드 에러가 발생하는 경우
- Root Directory가 `web`으로 설정되었는지 확인
- 환경 변수가 올바르게 설정되었는지 확인
- 로컬에서 `npm run build`가 성공하는지 확인

### API가 작동하지 않는 경우
- `OPENAI_API_KEY` 환경 변수가 올바르게 설정되었는지 확인
- Vercel 대시보드의 Functions 로그 확인

## 추가 정보

- Next.js 버전: 16.1.0
- Node.js 버전: 18.x 이상 권장
- 빌드 시간: 약 2-3분

