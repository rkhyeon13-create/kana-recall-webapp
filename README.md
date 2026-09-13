# 가나 떠올리기

기본 히라가나 46자와 가타카나 46자를 연상 Trigger 또는 소리로 떠올리는 독립 브라우저 웹앱입니다. 로그인, 서버, 데이터베이스, PWA 설치 기능 없이 정적 파일로 동작합니다.

공개 앱: <https://rkhyeon13-create.github.io/kana-recall-webapp/>

## 실행

Node.js 20 이상과 npm이 필요합니다.

```bash
npm install
npm run dev
```

프로덕션 빌드와 로컬 미리보기:

```bash
npm run build
npm run preview
```

## 데이터와 저장

- `src/data/kana.ts`: 제공된 히라가나·가타카나 PDF의 92자, 로마자 소리, 이모지가 포함된 연상 Trigger와 설명
- `localStorage`: 문자별 출제·정답·오답·마지막 학습 시각과 현재 세션만 이 기기에 저장
- 원본 PDF와 기존 Sites 프로젝트는 수정하지 않음

## 배포

`npm run build`로 생성되는 `dist/`를 GitHub Pages, Vercel, Cloudflare Pages 같은 정적 호스팅에 배포할 수 있습니다. `vite.config.ts`의 상대 base 설정으로 하위 경로 배포도 지원합니다.

### GitHub Pages

`main` 브랜치에 푸시하면 `.github/workflows/deploy-pages.yml`이 앱을 빌드해 GitHub Pages에 자동 배포합니다. 저장소의 **Settings → Pages → Source**는 **GitHub Actions**로 설정합니다.
