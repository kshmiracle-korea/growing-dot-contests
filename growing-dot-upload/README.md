# 그로잉 닷 · AI 공모전

기존 카드 디자인과 공식 포스터 / 요약 썸네일을 사용하는 반응형 홈페이지입니다.

- 홈페이지: https://kshmiracle-korea.github.io/growing-dot-contests/index.html
- PC·모바일 미리보기: https://kshmiracle-korea.github.io/growing-dot-contests/preview.html
- 원본: [1번 Google Sheet](https://docs.google.com/spreadsheets/d/1avQQiH13UvHJ2pbxTvbjbSTQmUOHuc-YHx_01DUu3iw/edit)의 `공모전 관리` 탭.
- `snapshot.js`: 2026-10-11에 확인한 37건 전체를 보존합니다. 화면의 최신 스냅샷 날짜는 `updatedAt`에서 읽습니다.
- 카드: 공모전명, 마감일, 분야/주제, 참가 대상, 상세보기 링크, 상태, 주최/주관, 접수 시작일, D-day.

## 날짜와 마감 기록

한국 시간(Asia/Seoul)의 달력 날짜로 상태를 계산합니다. 마감 당일은 `D-DAY`이고 다음날부터 `마감`입니다. 화면을 열어 둔 경우 30초 이내에 날짜 변경을 반영하며, 화면으로 돌아오면 다시 계산합니다. 공고의 정확한 마감 시각은 상세보기에서 확인하세요.

기본 목록은 마감 공모전을 제외하고 접수 중 → 접수 예정 → 일정 확인 순으로 표시합니다. 같은 상태 안에서는 마감일이 가까운 순입니다. `마감 공모전 보기`를 누르면 별도 영역에 최근 마감일 순으로 과거 기록을 표시합니다. 시트와 스냅샷에서 마감 기록을 삭제하지 않습니다.

유효한 마감일·시작일이 있으면 저장된 상태보다 날짜 계산을 우선합니다. 날짜가 없으면 저장된 상태를 참고하고 일정이 불명확하면 `일정 확인`을 표시합니다.

## 이미지

시트의 `이미지 URL`을 우선 사용하고, 비어 있거나 유효하지 않으면 `poster-map.js`의 동일 공고 URL에 연결된 포스터를 사용합니다. 포스터가 없거나 로딩에 실패하면 기존 요약 썸네일을 표시합니다. 이미지 출처는 `image-sources.json`이며 권리는 각 권리자에게 있습니다.

## 데이터 갱신

현재 `config.js`의 `apiUrl`은 비어 있으므로 시트의 신규 행과 내용 수정이 실시간 반영되지는 않습니다. 새로고침은 배포된 스냅샷을 다시 읽고 날짜 상태를 계산합니다. 최신 원본을 읽어 `snapshot.js`의 `items`와 `updatedAt`을 함께 갱신하고 main에 반영하면 재배포됩니다.

스냅샷/선택적 실시간 피드 형식:

```js
{ok: true, updatedAt: 'YYYY-MM-DD', items: [
  {title: '공모전명', deadline: 'YYYY-MM-DD', topic: '분야/주제',
   eligibility: '참가 대상', url: 'https://공식공고', status: '접수 중',
   organizer: '주최/주관', startDate: 'YYYY-MM-DD', image: ''}
]}
```

자동 연결이 필요하면 같은 시트의 공개할 항목만 반환하는 Apps Script JSONP 웹 앱을 배포하고, `config.js`의 `apiUrl`에 `/exec` URL을 등록합니다. `callback`으로 전달한 함수 이름을 사용해야 하며 위 카드 필드를 모두 반환해야 합니다. 연결 후 5분 간격으로 조회하며 실패하면 마지막 목록 또는 스냅샷을 유지합니다. 내부 메모나 중복키는 공개 피드에 포함하지 않습니다.

## 검증과 배포

`node --test tests/contests.test.cjs`로 오늘/다음날 경계, 한국 시간, 접수 예정 정렬, 마감 보관함, 이미지 fallback, 스냅샷 날짜를 검증합니다.

`.github/workflows/static.yml`이 main 변경 시 `growing-dot-upload` 폴더를 GitHub Pages에 배포합니다. 별도 빌드 도구가 필요 없습니다.
