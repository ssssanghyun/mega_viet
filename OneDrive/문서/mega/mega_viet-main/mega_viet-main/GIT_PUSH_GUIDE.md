# 다른 Git 계정으로 Push하기 가이드

## 현재 설정
- 원격 저장소: https://github.com/ssssanghyun/mega_viet.git
- 사용자: Jeonghyun-pp

## 시나리오별 방법

### 시나리오 1: 새로운 GitHub 저장소로 Push (가장 일반적)

1. **새로운 GitHub 저장소 생성**
   - GitHub에 로그인 (새 계정)
   - "New repository" 클릭
   - 저장소 이름 입력 (예: `mega_viet` 또는 다른 이름)
   - Public/Private 선택
   - "Create repository" 클릭

2. **원격 저장소 변경**
```bash
cd "C:\Users\pjhic\OneDrive\문서\mega\mega_viet-main\mega_viet-main"
git remote set-url origin https://새계정명@github.com/새계정명/새저장소명.git
```

3. **Push**
```bash
git push -u origin main
```
- Username: 새 GitHub 계정명 입력
- Password: Personal Access Token 입력 (GitHub → Settings → Developer settings → Personal access tokens)

### 시나리오 2: 같은 저장소, 다른 계정 인증

1. **원격 URL에 계정명 포함**
```bash
cd "C:\Users\pjhic\OneDrive\문서\mega\mega_viet-main\mega_viet-main"
git remote set-url origin https://새계정명@github.com/ssssanghyun/mega_viet.git
```

2. **Push 시 인증**
```bash
git push origin main
```
- Username: 새 계정명
- Password: Personal Access Token

### 시나리오 3: Personal Access Token 사용 (권장)

1. **GitHub에서 Token 생성**
   - GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
   - "Generate new token (classic)"
   - Note: "mega_viet project" 등 입력
   - Expiration: 원하는 기간 선택
   - 권한: `repo` 체크 (전체 권한)
   - "Generate token" 클릭 후 토큰 복사 (한 번만 보여줌!)

2. **원격 URL에 Token 포함**
```bash
cd "C:\Users\pjhic\OneDrive\문서\mega\mega_viet-main\mega_viet-main"
git remote set-url origin https://토큰값@github.com/계정명/저장소명.git
```

3. **Push (인증 없이 가능)**
```bash
git push origin main
```

### 시나리오 4: Git Credential Manager 사용

Windows에서 여러 계정 관리:

1. **Credential Manager에서 기존 인증 정보 제거**
   - Windows → 제어판 → 자격 증명 관리자
   - Windows 자격 증명 → git:https://github.com 찾아서 제거

2. **Push 시 새 인증 정보 입력**
```bash
git push origin main
```
- 새 계정의 Username과 Token 입력
- Windows가 자동으로 저장

## 빠른 참조 명령어

```bash
# 현재 원격 저장소 확인
git remote -v

# 원격 저장소 URL 변경
git remote set-url origin https://계정명@github.com/계정명/저장소명.git

# 또는 Token 사용
git remote set-url origin https://토큰@github.com/계정명/저장소명.git

# Push
git push origin main

# Git 사용자 정보 변경 (선택사항)
git config user.name "새사용자명"
git config user.email "새이메일@example.com"
```

## 주의사항

⚠️ Personal Access Token은 비밀번호처럼 안전하게 보관하세요
⚠️ 토큰이 코드나 공개된 곳에 노출되지 않도록 주의하세요
⚠️ 더 이상 필요하지 않은 토큰은 GitHub에서 삭제하세요

