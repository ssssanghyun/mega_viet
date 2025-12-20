# 다른 Git 계정으로 Push하기

## 현재 Git 설정
- 원격 저장소: https://github.com/ssssanghyun/mega_viet.git
- 사용자 이름: Jeonghyun-pp
- 이메일: pjh_0331@yonsei.ac.kr

## 방법 1: 원격 저장소 URL 변경 (같은 저장소, 다른 계정)

### HTTPS 인증 방식

1. 원격 저장소 URL 변경:
```bash
cd mega_viet-main/mega_viet-main
git remote set-url origin https://새계정명@github.com/새계정명/저장소명.git
```

또는 GitHub Personal Access Token 사용:
```bash
git remote set-url origin https://토큰@github.com/새계정명/저장소명.git
```

2. Push 시 인증 정보 입력:
```bash
git push origin main
```

### SSH 키 방식 (권장)

1. 새로운 SSH 키 생성 (새 계정용):
```bash
ssh-keygen -t ed25519 -C "새계정이메일@example.com" -f ~/.ssh/id_ed25519_새계정
```

2. SSH 키를 GitHub에 등록

3. SSH config 파일 설정 (~/.ssh/config):
```
Host github.com-새계정
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_새계정
```

4. 원격 저장소 URL을 SSH로 변경:
```bash
cd mega_viet-main/mega_viet-main
git remote set-url origin git@github.com-새계정:새계정명/저장소명.git
```

## 방법 2: 완전히 새로운 저장소로 Push

1. 새로운 GitHub 저장소 생성

2. 새로운 원격 저장소 추가:
```bash
cd mega_viet-main/mega_viet-main
git remote add 새원격이름 https://새계정명@github.com/새계정명/새저장소명.git
```

3. Push:
```bash
git push 새원격이름 main
```

기존 origin을 제거하고 싶다면:
```bash
git remote remove origin
git remote add origin https://새계정명@github.com/새계정명/새저장소명.git
```

## 방법 3: Git 사용자 정보 변경 (로컬만)

현재 프로젝트에서만 다른 계정 정보 사용:

```bash
cd mega_viet-main/mega_viet-main
git config user.name "새사용자명"
git config user.email "새이메일@example.com"
```

전역 설정 변경:
```bash
git config --global user.name "새사용자명"
git config --global user.email "새이메일@example.com"
```

## GitHub Personal Access Token 사용법

1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)

2. "Generate new token" 클릭

3. 권한 선택 (최소: repo)

4. 토큰 생성 후 복사

5. 원격 URL에 토큰 포함:
```bash
git remote set-url origin https://토큰@github.com/계정명/저장소명.git
```

또는 Push 시 입력:
- Username: GitHub 사용자명
- Password: Personal Access Token

## 주의사항

- Personal Access Token은 비밀번호처럼 안전하게 보관하세요
- 토큰이 노출되면 즉시 GitHub에서 삭제하세요
- SSH 키 방식이 더 안전합니다

