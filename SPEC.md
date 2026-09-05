\# \[SPEC] 산업용 장비 및 부속품 통합 렌탈·재고 관리 시스템



\## 1. 프로젝트 개요 및 기술 스택



\* \*\*목적\*\*: 발전기, 용접기, 콤프레셔 등 개별 관리 장비와 케이블, 게이지 등 벌크 부속품의 통합 출고 예약, 묶음 대여, 반납 및 정비 주기 관리.

\* \*\*사용 환경\*\*: 모바일(현장 입출고/조회) 및 PC(사무실 예약/캘린더) 겸용 반응형 웹 (PWA 지원).

\* \*\*기술 스택\*\*:

\* \*\*Frontend\*\*: Next.js 14+ (App Router), TypeScript, Tailwind CSS, shadcn/ui, Lucide Icons

\* \*\*Backend \& DB\*\*: Supabase (PostgreSQL, Row Level Security)

\* \*\*Hosting\*\*: Vercel (Free Tier)

\* \*\*타임존 규격\*\*: 한국 표준시 (KST / `Asia/Seoul`, UTC+9) 일괄 적용







\---



\## 2. 데이터베이스 스키마 설계



```sql

\-- 1. 품목 및 카테고리 마스터

CREATE TABLE item\_categories (

&#x20;   id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

&#x20;   name TEXT NOT NULL,                  -- 발전기, CO2용접기, 티그용접기, 콤프레셔, 홀더선, 어스선 등

&#x20;   type VARCHAR NOT NULL,               -- 'SERIALIZED'(개별번호장비) | 'BULK'(수량부속품)

&#x20;   unit VARCHAR DEFAULT '대',           -- 단위 ('대', 'EA', 'm', '세트')

&#x20;   is\_active BOOLEAN DEFAULT true,

&#x20;   created\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);



\-- 2. 거래처 / 현장 마스터 (자동 누적 및 드롭다운 선택)

CREATE TABLE clients (

&#x20;   id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

&#x20;   name TEXT NOT NULL UNIQUE,          -- 거래처/현장명 (예: 현대중공업 울산야드, OO이엔지 등)

&#x20;   contact\_person TEXT,                 -- 현장 담당자

&#x20;   phone TEXT,                          -- 연락처

&#x20;   last\_used\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), -- 최근 사용 순 정렬용

&#x20;   is\_active BOOLEAN DEFAULT true

);



\-- 3. 보관 장소 마스터 (자동 누적 및 드롭다운 선택)

CREATE TABLE locations (

&#x20;   id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

&#x20;   name TEXT NOT NULL UNIQUE,          -- 예: 본사 마당, 1번 야적장, 정비 샵, 외부 수리처

&#x20;   last\_used\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

&#x20;   is\_active BOOLEAN DEFAULT true

);



\-- 4. 개별 번호 관리 장비 (SERIALIZED)

CREATE TABLE equipments (

&#x20;   id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

&#x20;   category\_id UUID REFERENCES item\_categories(id),

&#x20;   custom\_name TEXT NOT NULL,          -- 현장 호칭 (예: '도요 450', '에어맨 750')

&#x20;   code\_number VARCHAR NOT NULL,       -- 페인트 번호 (예: '450', '12')

&#x20;   status VARCHAR DEFAULT 'AVAILABLE', -- 'AVAILABLE'(대기), 'RENTED'(출고중), 'MAINTENANCE'(점검/수리중)

&#x20;   current\_location TEXT DEFAULT '본사 마당', -- 현재 보관 위치

&#x20;   total\_hours INTEGER DEFAULT 0,      -- 현재 누적 아워미터

&#x20;   next\_service\_hours INTEGER,         -- 다음 정비 목표 아워미터

&#x20;   is\_deleted BOOLEAN DEFAULT false,   -- Soft Delete 플래그

&#x20;   created\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);



\-- 5. 수량 관리 부속품 (BULK)

CREATE TABLE bulk\_items (

&#x20;   id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

&#x20;   category\_id UUID REFERENCES item\_categories(id),

&#x20;   name TEXT NOT NULL,                 -- 예: '홀더선 30m', '어스선 20m', '아르곤 게이지'

&#x20;   total\_stock INTEGER DEFAULT 0,      -- 총 보유 수량

&#x20;   available\_stock INTEGER DEFAULT 0,  -- 사내 잔여 수량

&#x20;   rented\_stock INTEGER DEFAULT 0,     -- 현장 대여 중 수량

&#x20;   created\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);



\-- 6. 부속품 재고 변동 로그 (구매, 폐기, 가공, 실사 조정)

CREATE TABLE bulk\_stock\_logs (

&#x20;   id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

&#x20;   item\_id UUID REFERENCES bulk\_items(id),

&#x20;   change\_type VARCHAR NOT NULL,       -- 'PURCHASE'(신규구매), 'DISCARD'(폐기), 'SPLIT\_REUSE'(가공전환), 'ADJUST'(실사조정), 'RENTAL'(출고/반납)

&#x20;   quantity\_change INTEGER NOT NULL,   -- 변동량 (+N / -N)

&#x20;   reason TEXT,                        -- 사유 (예: '50m 단선 케이블 20m 어스선 가공', '신규 10EA 입고')

&#x20;   user\_email TEXT,

&#x20;   created\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);



\-- 7. 대여 주문(전표) 마스터 - 묶음 관리

CREATE TABLE rental\_orders (

&#x20;   id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

&#x20;   order\_number TEXT NOT NULL UNIQUE,  -- 전표번호 (예: R-20260901-001)

&#x20;   client\_id UUID REFERENCES clients(id),

&#x20;   client\_name\_raw TEXT NOT NULL,      -- 거래처/현장명 (직접 입력값 보존)

&#x20;   start\_date DATE NOT NULL,           -- 출고 (예정)일

&#x20;   end\_date DATE NOT NULL,             -- 반납 (예정)일

&#x20;   actual\_return\_date DATE,            -- 최종 전량 반납 완료일

&#x20;   status VARCHAR DEFAULT 'RESERVED',  -- 'RESERVED'(예약), 'ACTIVE'(현장출고), 'COMPLETED'(완료), 'CANCELLED'(취소)

&#x20;   notes TEXT,

&#x20;   created\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);



\-- 8. 대여 주문 매핑 장비 (1:N)

CREATE TABLE rental\_order\_equipments (

&#x20;   id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

&#x20;   order\_id UUID REFERENCES rental\_orders(id) ON DELETE CASCADE,

&#x20;   equipment\_id UUID REFERENCES equipments(id),

&#x20;   status VARCHAR DEFAULT 'RESERVED',  -- 'RESERVED', 'DISPATCHED', 'RETURNED'

&#x20;   dispatch\_date DATE,                 -- 실제 출고일

&#x20;   return\_date DATE,                   -- 실제 반납일

&#x20;   start\_hours INTEGER,                -- 출고 시 아워미터

&#x20;   end\_hours INTEGER,                  -- 반납 시 아워미터

&#x20;   return\_location TEXT                -- 반납 후 보관 위치

);



\-- 9. 대여 주문 매핑 부속품 (1:N)

CREATE TABLE rental\_order\_bulk\_items (

&#x20;   id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

&#x20;   order\_id UUID REFERENCES rental\_orders(id) ON DELETE CASCADE,

&#x20;   bulk\_item\_id UUID REFERENCES bulk\_items(id),

&#x20;   dispatched\_qty INTEGER NOT NULL,    -- 출고 수량

&#x20;   returned\_qty INTEGER DEFAULT 0      -- 실제 반납 수량

);



\-- 10. 정비 이력 로그

CREATE TABLE maintenance\_logs (

&#x20;   id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

&#x20;   equipment\_id UUID REFERENCES equipments(id),

&#x20;   service\_date DATE DEFAULT CURRENT\_DATE,

&#x20;   service\_type TEXT NOT NULL,         -- 엔진오일 교환, 필터 청소, 부품 수리 등

&#x20;   service\_hours INTEGER NOT NULL,     -- 정비 시점 아워미터

&#x20;   next\_target\_hours INTEGER,          -- 갱신된 목표 아워미터

&#x20;   notes TEXT,

&#x20;   user\_email TEXT,

&#x20;   created\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);



\-- 11. 작업 감사 로그 (Audit Log)

CREATE TABLE activity\_logs (

&#x20;   id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

&#x20;   user\_email TEXT,

&#x20;   action VARCHAR NOT NULL,            -- 'CREATE', 'UPDATE', 'DELETE', 'DISPATCH', 'RETURN', 'SWAP'

&#x20;   target\_type VARCHAR NOT NULL,        -- 'EQUIPMENT', 'ORDER', 'BULK\_ITEM'

&#x20;   target\_id UUID,

&#x20;   description TEXT NOT NULL,

&#x20;   created\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);



```



\---



\## 3. 핵심 비즈니스 로직 및 운영 규칙



\### 1) 거래처 및 보관 장소 자동 학습 (Auto-Learning Dropdown)



\* 거래처명 및 보관 장소 입력 시, 기존 `clients`, `locations` 테이블의 목록을 드롭다운으로 우선 노출.

\* 목록에 없는 신규 명칭을 직접 타이핑하여 등록하면, 백엔드에서 해당 테이블에 즉시 신규 레코드로 저장하여 다음 입력 시 자동 드롭다운 항목으로 제공.



\### 2) 묶음 출고(Multi-Item Order) 및 부분 반납(Partial Return)



\* \*\*묶음 출고\*\*: 1개의 대여 전표에 \[발전기 2대 + 용접기 3대 + 홀더선 5개]를 묶어 한 번에 예약/출고 처리.

\* \*\*부분 반납\*\*: 현장에서 사용이 먼저 끝난 일부 장비만 먼저 입고 처리 가능. 모든 장비와 부속품이 회수되면 전표 상태가 자동으로 `COMPLETED`로 전환.



\### 3) 당일 즉시 출고 (Fast-Track Flow)



\* 사전 예약 없이 트럭이 바로 들어온 경우:

1\. 장비 목록에서 번호 검색 후 `\[당일 즉시 출고]` 클릭.

2\. 거래처 선택, 현재 아워미터 입력, 필요 부속품 수량 입력 후 원터치로 즉시 `ACTIVE(출고중)` 상태 반영.







\### 4) 느슨한 점검 규칙 (Soft Warning) \& 순환 배정



\* \*\*소프트 경고\*\*: 누적 아워미터가 `next\_service\_hours`를 초과했거나 반납 직후인 장비도 시스템 차단 없이 `⚠️ 점검 권장` 라벨만 노출하고 출고 허용.

\* \*\*자동 추천\*\*: 예약 시 해당 기간에 스케줄이 비어 있는 장비 중 '최근 점검 후 미가동 일수가 길고 누적 아워미터가 적은 장비'를 1순위로 자동 선택 (수동 변경 가능).



\### 5) 일정 연장 및 충돌 대체(Swap)



\* 대여 기간 연장 시 후속 예약과 날짜가 겹치면 경고 팝업 출력.

\* 동일 카테고리 내 다른 대기 장비를 탐색하여 클릭 한 번으로 후속 예약의 대상 장비를 대체(Swap)하고 현재 장비 연장 승인.



\### 6) 케이블 가공 분할 및 폐기 (Stock Transformation)



\* 케이블 파손 시: `\[가공/폐기]` 모달에서 원본 품목(예: 50m 세트) 수량 -1, 파생 품목(예: 20m 어스선) 수량 +1 처리 및 사유를 `bulk\_stock\_logs`에 단일 트랜잭션으로 기록.



\---



\## 4. 화면(UI) 구성 요구사항



\### 1) 메인 대시보드 (월간 캘린더)



\* \*\*상단 요약 바\*\*: 오늘 출고 예정 N건 / 오늘 반납 예정 N건 / ⚠️ 점검 필요 장비 N대.

\* \*\*월간 캘린더\*\*: 날짜별 출고·반납 건수 뱃지 표시. 날짜 터치 시 당일 출고/반납 전표 목록 사이드 드로어 오픈.

\* \*\*긴급 점검 리스트\*\*: 목표 아워미터 초과 장비 목록 및 원클릭 `\[점검 완료 등록]` 버튼.



\### 2) 장비 현황 및 빠른 번호 검색



\* 카테고리 필터 탭(`전체`, `발전기`, `용접기`, `콤프`, `부속품`) + 숫자 패드/검색창.

\* 카드 UI: 관리 번호(450), 현재 상태 뱃지, 현재 보관 위치, 누적 아워미터, `\[상세]`, `\[즉시출고]` 액션 버튼.

\* 상세 모달: 장비 스펙, 현재 위치 변경, 향후 30일 타임라인, 과거 입출고/정비 이력.



\### 3) 대여 주문 등록 (예약 / 출고)



\* 거래처 선택(자동완성/신규입력), 대여 기간 설정.

\* 장비 추가 섹션: 카테고리 선택 시 가용 장비 자동 추천 및 복수 추가.

\* 부속품 추가 섹션: 사내 잔여 재고를 확인하며 필요 수량 입력.

\* 등록 모드 분기: `\[예약 저장]` vs `\[당일 즉시 출고]`.



\### 4) 반납 처리 모달



\* 대여 전표 내 장비별 반납 체크박스.

\* 반납 아워미터 입력, 입고 보관 장소 선택(드롭다운/직접입력).

\* 함께 나간 부속품의 실제 회수 수량 입력.



\### 5) 부속품(벌크) 재고 관리 뷰



\* 부속품별 총 보유량 / 사내 잔여 / 현장 대여 중 수량 테이블.

\* `\[+ 재고 입고]`, `\[- 손실/폐기]`, `\[✂️ 분할/가공]` 액션 버튼.

\* 최근 재고 변동 로그 타임라인.



\### 6) 환경설정 및 마스터 관리



\* 카테고리 추가/수정 (장비형 vs 부속품형 지정).

\* 거래처 및 보관 장소 마스터 편집.

\* 작업 감사 로그(Audit Log) 검색 및 삭제된 장비 복구(Soft Delete 해제).



