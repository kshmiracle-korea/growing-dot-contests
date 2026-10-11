# 매일 시트 → GitHub Pages 갱신

2026-10-12 인증 연결과 실제 읽기·저장·배포 시험을 완료했습니다. GitHub Actions가 매일 한국 시간 **낮 12:17**에 한 번 실행합니다. 사용자 PC나 브라우저, Codex를 열어 둘 필요가 없습니다. Apps Script는 사용하지 않습니다.

## 실행 시점

오전 9시 수집 작업 이후 여유를 두고 정해진 시각에 시트를 읽습니다. 수집 완료 이벤트에 연결된 방식은 아닙니다. 수집이 낮 12:17 이후 끝나는 날에는 다음 날 반영됩니다. GitHub 실행 자체도 지연될 수 있습니다.

## 동작과 공개 범위

1. 비공개 원본 시트 `1avQQiH13UvHJ2pbxTvbjbSTQmUOHuc-YHx_01DUu3iw`의 `공모전 관리` 탭 B:I와 R열만 읽습니다.
2. 공모전명·마감일·분야/주제·참가 대상·URL·상태·주최/주관·접수 시작일·이미지 URL만 공개 파일에 저장합니다. 작성일, 시트 D-day, 상금/혜택, 출처, 공고일, 관심도, 중복키, 메모, 최종 확인일은 요청·저장하지 않습니다.
3. 원본 시트는 수정하거나 삭제하지 않습니다. 서비스 계정에는 원본 시트 뷰어 권한만 부여했고 Cloud 자원 역할은 부여하지 않았습니다. 인증 범위는 `spreadsheets.readonly`입니다.
4. 연속 두 번 읽은 결과와 형식을 검사합니다. 빈 목록, 행 수 감소, 잘못된 열/날짜/수식, 인증 실패가 있으면 기존 홈페이지를 유지하고 실행을 실패로 표시합니다. 연속 읽기는 편집 도중의 불일치를 확인할 뿐 수집 완료를 증명하지 않습니다.
5. 공개 내용이 바뀌면 `snapshot.js`와 `index.html`의 데이터 버전을 갱신하고 같은 작업에서 Pages를 배포합니다. 내용이 같으면 재배포하지 않으며 스냅샷 날짜도 마지막 내용 갱신일을 유지합니다.
6. 시트 이미지 URL이 비어 있으면 기존에 확인한 포스터 연결 목록을 사용합니다. 새 포스터 검색은 이 예약의 기능에 포함되지 않습니다.
7. D-day와 마감 보관함은 홈페이지가 한국 시간으로 계산합니다. 마감 기록은 시트에 보존합니다.

## 운영 설정

- Actions secret: `GOOGLE_SERVICE_ACCOUNT_JSON` — 인증 JSON은 비밀 설정에만 저장합니다. 공개 코드·채팅·로그에 넣지 않습니다.
- Actions variable: `DAILY_SHEET_SYNC_ENABLED=true` — 매일 예약 활성화. `false`로 바꾸면 예약 실행을 중지합니다.
- 수동 실행: Actions → Daily sheet to website → Run workflow. 수동 실행은 예약 중지 여부와 관계없이 실행할 수 있습니다.
- 실행 실패는 Actions 실행 기록에서 확인합니다. 실패할 때 기존 홈페이지는 유지됩니다.
- 공개 저장소에 장기간 활동이 없으면 GitHub가 예약을 비활성화할 수 있습니다. [GitHub 예약 실행 안내](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

## 검증

- `node --test tests/daily-sync.test.mjs`: 4개 통과.
- [최초 실제 실행 성공](https://github.com/kshmiracle-korea/growing-dot-contests/actions/runs/38156405621): 시트 읽기, 37건 공개 스냅샷 저장, Pages 배포 완료.
- 최초 갱신 스냅샷 날짜: 2026-10-12.

기존 ChatGPT 수집 예약 자체는 이 설정으로 변경되지 않습니다. 홈페이지는 반드시 위 원본 시트를 사용하므로, 수집 결과가 다른 시트에만 저장되면 그 내용은 반영되지 않습니다.
