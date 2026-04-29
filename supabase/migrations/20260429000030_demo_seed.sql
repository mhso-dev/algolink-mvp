-- DEMO-SEED-001 — 고객 컨셉 확인용 대량 더미데이터 (add-only / idempotent)
-- 강사 30 / 고객사 15 / 프로젝트 50 / 정산 100 / 데모 admin 계정
-- 데모 로그인: demo@algolink.com / Demo2026!
-- 모든 INSERT는 ON CONFLICT DO NOTHING으로 멱등성 보장.
-- PII는 app.encrypt_pii()로 암호화. 운영 환경에서도 안전.

SET LOCAL search_path TO pg_catalog, public, extensions, auth, pg_temp;

-- 안전: seed 키가 없으면 placeholder 주입 (dev only).
DO $$
BEGIN
  PERFORM current_setting('app.pii_encryption_key', false);
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'app.pii_encryption_key not set — seeding placeholder for dev';
    PERFORM set_config('app.pii_encryption_key', 'dev-only-32byte-secret-XXXXXXXXXXXX', true);
END $$;

-- ===========================================
-- PRE-SEED: 데모 admin auth.users 생성
-- ===========================================
DO $auth_seed$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) VALUES
      (
        '00000000-0000-0000-0000-000000000000',
        '00000000-0000-0000-0000-0000000ddd00',
        'authenticated', 'authenticated',
        'demo@algolink.com',
        crypt('Demo2026!', gen_salt('bf')),
        NOW(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"role":"admin"}'::jsonb,
        NOW(), NOW(),
        '', '', '', ''
      )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO auth.identities (
      id, user_id, provider_id, provider, identity_data,
      last_sign_in_at, created_at, updated_at
    ) VALUES
      (
        gen_random_uuid(),
        '00000000-0000-0000-0000-0000000ddd00',
        'demo@algolink.com',
        'email',
        jsonb_build_object('sub', '00000000-0000-0000-0000-0000000ddd00', 'email', 'demo@algolink.com', 'email_verified', true, 'phone_verified', false),
        NOW(), NOW(), NOW()
      )
    ON CONFLICT (provider_id, provider) DO NOTHING;
  END IF;
END
$auth_seed$;

INSERT INTO users (id, role, name_kr, email) VALUES
  ('00000000-0000-0000-0000-0000000ddd00', 'admin', '데모 관리자', 'demo@algolink.com')
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- 강사 30명 + 부속 데이터 (educations / work_experiences / certifications / skills)
-- ===========================================
DO $demo_inst$
DECLARE
  v_names_kr text[] := ARRAY[
    '홍길동','김민수','이서연','박지훈','최유진','정도윤','강하늘','조서아','윤재현','임수빈',
    '한지원','오민재','서현우','신예린','권태호','황보라','배성준','문지아','구도현','노아인',
    '송지호','류가람','백나래','심우진','전은채','고지석','남유나','하은수','진소율','마건우'
  ];
  v_names_en text[] := ARRAY[
    'Gildong Hong','Minsoo Kim','Seoyeon Lee','Jihoon Park','Yujin Choi','Doyoon Jung','Haneul Kang','Seoa Cho','Jaehyun Yoon','Subin Lim',
    'Jiwon Han','Minjae Oh','Hyunwoo Seo','Yerin Shin','Taeho Kwon','Bora Hwang','Seongjun Bae','Jia Moon','Dohyun Koo','Ain Noh',
    'Jiho Song','Garam Ryu','Narae Baek','Woojin Shim','Eunchae Jeon','Jiseok Ko','Yuna Nam','Eunsoo Ha','Soyul Jin','Geonwoo Ma'
  ];
  v_cities text[] := ARRAY[
    '서울 강남구','서울 마포구','서울 송파구','경기 성남시','경기 수원시','경기 고양시','부산 해운대구','부산 수영구','대구 수성구','인천 연수구',
    '대전 유성구','광주 서구','울산 남구','세종특별자치시','강원 춘천시','충북 청주시','충남 천안시','전북 전주시','전남 여수시','경북 포항시',
    '경남 창원시','제주 제주시','서울 종로구','서울 영등포구','경기 안양시','경기 용인시','부산 부산진구','대구 달서구','인천 부평구','경기 화성시'
  ];
  v_schools text[] := ARRAY['서울대학교','연세대학교','고려대학교','KAIST','POSTECH','성균관대학교','한양대학교','중앙대학교','경희대학교','서강대학교'];
  v_majors  text[] := ARRAY['컴퓨터공학','전자공학','산업공학','데이터사이언스','정보통신공학','수학','통계학','경영학','소프트웨어학','인공지능학과'];
  v_companies text[] := ARRAY['네이버','카카오','쿠팡','라인','우아한형제들','당근마켓','토스','삼성SDS','LG CNS','SK텔레콤'];
  v_positions text[] := ARRAY['시니어 엔지니어','테크리드','수석연구원','책임연구원','선임연구원','매니저','개발팀장','아키텍트','컨설턴트','프린시플 엔지니어'];
  v_certs text[] := ARRAY['AWS Solutions Architect','Google Cloud Professional','정보처리기사','SQLD','ADsP','PMP','CKA','TOPCIT 우수','OCP','Azure Administrator'];
  v_issuers text[] := ARRAY['AWS','Google','한국산업인력공단','한국데이터산업진흥원','PMI','CNCF','과학기술정보통신부','Oracle','Microsoft','한국정보통신기술협회'];
  -- 스킬 후보: SPEC-SKILL-ABSTRACT-001 — 9개 추상 카테고리
  v_skills uuid[] := ARRAY[
    '30000000-0000-0000-0000-000000000001'::uuid, -- 데이터 분석
    '30000000-0000-0000-0000-000000000002'::uuid, -- 데이터 사이언스
    '30000000-0000-0000-0000-000000000003'::uuid, -- AI·ML
    '30000000-0000-0000-0000-000000000004'::uuid, -- 백엔드
    '30000000-0000-0000-0000-000000000005'::uuid, -- 프론트엔드
    '30000000-0000-0000-0000-000000000006'::uuid, -- 풀스택
    '30000000-0000-0000-0000-000000000007'::uuid, -- 모바일
    '30000000-0000-0000-0000-000000000008'::uuid, -- 인프라·DevOps
    '30000000-0000-0000-0000-000000000009'::uuid  -- 클라우드
  ];
  v_banks text[] := ARRAY['국민은행','신한은행','우리은행','하나은행','농협은행','기업은행','SC제일은행','카카오뱅크'];
  i int;
  j int;
  v_id uuid;
  v_skill_count int;
  v_skill_idx int;
  v_picked uuid[];
BEGIN
  FOR i IN 1..30 LOOP
    v_id := ('30000000-0000-0000-0000-0000000d' || lpad(to_hex(i), 4, '0'))::uuid;

    INSERT INTO instructors (
      id, user_id, name_kr, name_en, email, phone, address,
      resident_number_enc, bank_account_enc, business_number_enc, withholding_tax_rate_enc,
      created_by
    )
    VALUES (
      v_id,
      NULL,
      v_names_kr[i],
      v_names_en[i],
      'demo.inst' || lpad(i::text, 2, '0') || '@algolink.example',
      '010-' || lpad(((i*131) % 10000)::text, 4, '0') || '-' || lpad(((i*977) % 10000)::text, 4, '0'),
      v_cities[i],
      app.encrypt_pii(
        (CASE WHEN i % 2 = 0 THEN '88' ELSE '90' END)
          || lpad(((i*7) % 12 + 1)::text, 2, '0')
          || lpad(((i*13) % 28 + 1)::text, 2, '0')
          || '-'
          || (CASE WHEN i % 2 = 0 THEN '2' ELSE '1' END)
          || lpad(((i*419) % 1000000)::text, 6, '0')
      ),
      app.encrypt_pii(
        lpad(((100 + i*3) % 999)::text, 3, '0') || '-'
        || lpad(((i*37) % 1000)::text, 3, '0') || '-'
        || lpad(((i*673) % 1000000)::text, 6, '0')
        || ' ' || v_banks[((i-1) % array_length(v_banks,1)) + 1]
      ),
      NULL,
      NULL,
      '00000000-0000-0000-0000-00000000bbbb'
    )
    ON CONFLICT (id) DO NOTHING;

    -- educations: 1-2건
    INSERT INTO educations (instructor_id, school, major, degree, start_date, end_date, sort_order)
    VALUES (
      v_id,
      v_schools[((i-1) % array_length(v_schools,1)) + 1],
      v_majors[((i-1) % array_length(v_majors,1)) + 1],
      'Bachelor',
      DATE '2008-03-01' + ((i % 6) || ' years')::interval,
      DATE '2012-02-28' + ((i % 6) || ' years')::interval,
      0
    )
    ON CONFLICT DO NOTHING;

    IF i % 2 = 0 THEN
      INSERT INTO educations (instructor_id, school, major, degree, start_date, end_date, sort_order)
      VALUES (
        v_id,
        v_schools[((i+3) % array_length(v_schools,1)) + 1],
        v_majors[((i+5) % array_length(v_majors,1)) + 1],
        'Master',
        DATE '2014-03-01' + ((i % 4) || ' years')::interval,
        DATE '2016-02-28' + ((i % 4) || ' years')::interval,
        1
      )
      ON CONFLICT DO NOTHING;
    END IF;

    -- work_experiences: 1-2건
    INSERT INTO work_experiences (instructor_id, company, position, start_date, end_date, description, sort_order)
    VALUES (
      v_id,
      v_companies[((i-1) % array_length(v_companies,1)) + 1],
      v_positions[((i-1) % array_length(v_positions,1)) + 1],
      DATE '2016-04-01' + ((i % 5) || ' years')::interval,
      DATE '2020-03-31' + ((i % 5) || ' years')::interval,
      '대규모 서비스 개발 및 운영 경험',
      0
    )
    ON CONFLICT DO NOTHING;

    IF i % 3 <> 0 THEN
      INSERT INTO work_experiences (instructor_id, company, position, start_date, end_date, description, sort_order)
      VALUES (
        v_id,
        v_companies[((i+4) % array_length(v_companies,1)) + 1],
        v_positions[((i+2) % array_length(v_positions,1)) + 1],
        DATE '2020-04-01' + ((i % 4) || ' years')::interval,
        NULL,
        '아키텍처 설계 및 기술 리딩',
        1
      )
      ON CONFLICT DO NOTHING;
    END IF;

    -- certifications: 1-2건
    INSERT INTO certifications (instructor_id, name, issuer, issued_date, sort_order)
    VALUES (
      v_id,
      v_certs[((i-1) % array_length(v_certs,1)) + 1],
      v_issuers[((i-1) % array_length(v_issuers,1)) + 1],
      DATE '2020-06-15' + ((i % 36) || ' months')::interval,
      0
    )
    ON CONFLICT DO NOTHING;

    IF i % 2 = 1 THEN
      INSERT INTO certifications (instructor_id, name, issuer, issued_date, sort_order)
      VALUES (
        v_id,
        v_certs[((i+5) % array_length(v_certs,1)) + 1],
        v_issuers[((i+3) % array_length(v_issuers,1)) + 1],
        DATE '2022-09-01' + ((i % 24) || ' months')::interval,
        1
      )
      ON CONFLICT DO NOTHING;
    END IF;

    -- publications: i % 4 == 0 일 때만 1건
    IF i % 4 = 0 THEN
      INSERT INTO publications (instructor_id, title, publisher, published_date, sort_order)
      VALUES (
        v_id,
        '실전 ' || v_majors[((i-1) % array_length(v_majors,1)) + 1] || ' 가이드 ' || i::text || '판',
        '한빛미디어',
        DATE '2021-05-01' + ((i % 30) || ' months')::interval,
        0
      )
      ON CONFLICT DO NOTHING;
    END IF;

    -- instructor_skills: 2-4건, 9개 추상 카테고리에서 선택 (UNIQUE(instructor_id, skill_id))
    v_skill_count := 2 + (i % 3);  -- 2, 3, 4
    v_picked := ARRAY[]::uuid[];
    FOR j IN 1..v_skill_count LOOP
      v_skill_idx := ((i * 7 + j * 11) % array_length(v_skills,1)) + 1;
      IF NOT (v_skills[v_skill_idx] = ANY(v_picked)) THEN
        v_picked := array_append(v_picked, v_skills[v_skill_idx]);
        INSERT INTO instructor_skills (instructor_id, skill_id)
        VALUES (
          v_id,
          v_skills[v_skill_idx]
        )
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
END
$demo_inst$;

-- ===========================================
-- 고객사 15개 (corporate 10 + government 5) + 1-2 contacts each
-- ===========================================
DO $demo_clients$
DECLARE
  v_company_names text[] := ARRAY[
    '주식회사 알파테크','베타솔루션 주식회사','감마이노베이션','델타시스템즈','입실론데이터',
    '제타클라우드','에타AI연구소','쎄타파트너스','이오타컨설팅','카파엔지니어링',
    '한국정보통신연구원','국가인공지능센터','경기도교육청','부산광역시청','과학기술정보통신부 산하기관'
  ];
  v_addresses text[] := ARRAY[
    '서울특별시 강남구 테헤란로 123','서울특별시 종로구 율곡로 45','경기 성남시 분당구 판교역로 89','서울 마포구 월드컵북로 12','서울 영등포구 여의대로 56',
    '부산 해운대구 센텀중앙로 78','대전 유성구 대학로 99','인천 송도국제도시','경기 안양시 동안구','광주 서구 상무지구',
    '대전 유성구 가정로 218','서울 강서구 마곡중앙로','경기 수원시 영통구','부산 연제구 중앙대로','세종특별자치시 도움5로'
  ];
  v_contact_names text[] := ARRAY['김교육','이연수','박인재','최채용','정개발','홍교무','안기획','오연구','류전략','강총무'];
  v_positions text[] := ARRAY['교육팀장','이사','부장','과장','대리','사무관','연구원','수석','매니저','팀장'];
  i int;
  v_id uuid;
  v_is_gov boolean;
  v_phone_prefix text;
  v_email_domain text;
  v_settlement_kind text;
BEGIN
  FOR i IN 1..15 LOOP
    v_id := ('20000000-0000-0000-0000-0000000d' || lpad(to_hex(i), 4, '0'))::uuid;
    v_is_gov := i > 10;
    v_settlement_kind := CASE WHEN v_is_gov THEN '정부 발주. 원천세 적용.' ELSE '대기업 / 중견기업 교육. 결제 30일.' END;

    INSERT INTO clients (id, company_name, address, handover_memo, created_by)
    VALUES (
      v_id,
      v_company_names[i],
      v_addresses[i],
      v_settlement_kind || ' 데모 클라이언트 #' || i::text,
      '00000000-0000-0000-0000-00000000bbbb'
    )
    ON CONFLICT (id) DO NOTHING;

    -- 첫 번째 contact
    v_phone_prefix := CASE WHEN v_is_gov THEN '044' ELSE '02' END;
    v_email_domain := CASE WHEN v_is_gov THEN 'gov.kr' ELSE 'example.com' END;
    INSERT INTO client_contacts (client_id, name, position, email, phone)
    VALUES (
      v_id,
      v_contact_names[((i-1) % array_length(v_contact_names,1)) + 1],
      v_positions[((i-1) % array_length(v_positions,1)) + 1],
      'demo.client' || lpad(i::text,2,'0') || '@' || v_email_domain,
      v_phone_prefix || '-' || lpad(((i*89) % 10000)::text,4,'0') || '-' || lpad(((i*373) % 10000)::text,4,'0')
    )
    ON CONFLICT DO NOTHING;

    -- 두 번째 contact (i % 2 == 0)
    IF i % 2 = 0 THEN
      INSERT INTO client_contacts (client_id, name, position, email, phone)
      VALUES (
        v_id,
        v_contact_names[(i % array_length(v_contact_names,1)) + 1],
        v_positions[(i % array_length(v_positions,1)) + 1],
        'demo.client' || lpad(i::text,2,'0') || '.sub@' || v_email_domain,
        v_phone_prefix || '-' || lpad(((i*601) % 10000)::text,4,'0') || '-' || lpad(((i*149) % 10000)::text,4,'0')
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END
$demo_clients$;

-- ===========================================
-- 프로젝트 50개 — 13개 status 골고루 분배 + corporate/government 혼합
-- ===========================================
DO $demo_projects$
DECLARE
  v_statuses project_status[] := ARRAY[
    'proposal','contract_confirmed','lecture_requested','instructor_sourcing','assignment_review',
    'assignment_confirmed','education_confirmed','recruiting','progress_confirmed','in_progress',
    'education_done','settlement_in_progress','task_done'
  ]::project_status[];
  v_titles text[] := ARRAY[
    'React 19 실전 마스터 과정','Next.js 16 App Router 심화','FastAPI 백엔드 부트캠프','Kubernetes 운영 워크숍','PyTorch 딥러닝 기초',
    'AWS 솔루션 아키텍트 양성','LLM 프롬프트 엔지니어링','데이터 분석 SQL 마스터','Tableau 시각화 실무','Docker Compose 운영',
    'TypeScript 고급 패턴','Go 언어 백엔드 입문','MLOps 파이프라인 구축','Claude API 활용 워크숍','GraphQL 설계 실무',
    'Spring Boot 마이크로서비스','Vue 3 Composition API','Flutter 모바일 개발','iOS Swift UI 실무','Android Jetpack Compose',
    'PostgreSQL 성능 튜닝','MongoDB 데이터 모델링','Redis 캐싱 전략','GitHub Actions CI/CD','Terraform IaC 실무',
    '머신러닝 기초 from scratch','XGBoost 실무 적용','LangChain 에이전트 구축','OpenAI API 통합','RAG 시스템 설계',
    '시스템 디자인 인터뷰 대비','Clean Architecture 워크숍','DDD 도메인 모델링','마이크로서비스 패턴','Event-Driven 아키텍처',
    'OAuth2 / OIDC 인증 설계','웹 보안 OWASP 실무','Pen Test 모의해킹','Lighthouse 성능 최적화','Core Web Vitals 개선',
    'A/B 테스트 데이터 분석','정부 공공데이터 활용','금융권 클라우드 마이그레이션','제조업 스마트팩토리','HR 데이터 분석 자동화',
    '교사 대상 AI 교육','초중등 SW 교육 커리큘럼','대학 캡스톤 멘토링','연구원 R 통계 워크숍','임원 대상 디지털 트랜스포메이션'
  ];
  i int;
  v_id uuid;
  v_status_idx int;
  v_status project_status;
  v_client_idx int;
  v_inst_idx int;
  v_client_id uuid;
  v_inst_id uuid;
  v_is_gov boolean;
  v_flow_hint text;
  v_business bigint;
  v_fee bigint;
  v_scheduled date;
  v_edu_start timestamptz;
  v_edu_end timestamptz;
BEGIN
  FOR i IN 1..50 LOOP
    v_id := ('40000000-0000-0000-0000-0000000d' || lpad(to_hex(i), 4, '0'))::uuid;

    -- status 분배: i = 1..50 -> ((i-1) % 13)
    v_status_idx := ((i - 1) % 13) + 1;
    v_status := v_statuses[v_status_idx];

    -- client (1~15): 1~10 corporate / 11~15 government
    v_client_idx := ((i - 1) % 15) + 1;
    v_client_id := ('20000000-0000-0000-0000-0000000d' || lpad(to_hex(v_client_idx), 4, '0'))::uuid;
    v_is_gov := v_client_idx > 10;
    v_flow_hint := CASE WHEN v_is_gov THEN 'government' ELSE 'corporate' END;

    -- instructor (1~30)
    v_inst_idx := ((i - 1) % 30) + 1;
    v_inst_id := ('30000000-0000-0000-0000-0000000d' || lpad(to_hex(v_inst_idx), 4, '0'))::uuid;

    -- 금액: 5M ~ 25M
    v_business := 5000000 + ((i * 437) % 20) * 1000000;
    v_fee := (v_business * 60 / 100);  -- 60%

    v_scheduled := DATE '2026-01-15' + ((i * 5) || ' days')::interval;
    v_edu_start := (v_scheduled::timestamptz) + INTERVAL '9 hours';
    v_edu_end   := v_edu_start + INTERVAL '8 hours';

    INSERT INTO projects (
      id, title, project_type, status, client_id, operator_id, instructor_id,
      education_start_at, education_end_at, scheduled_at,
      business_amount_krw, instructor_fee_krw, settlement_flow_hint,
      notes, created_by
    )
    VALUES (
      v_id,
      '[데모] ' || v_titles[i] || ' (' || lpad(i::text, 2, '0') || ')',
      (CASE WHEN i % 7 = 0 THEN 'material_development' ELSE 'education' END)::project_type,
      v_status,
      v_client_id,
      '00000000-0000-0000-0000-00000000bbbb',
      v_inst_id,
      v_edu_start,
      v_edu_end,
      v_scheduled,
      v_business,
      v_fee,
      v_flow_hint,
      '데모 프로젝트 — 컨셉 확인용 시드 데이터',
      '00000000-0000-0000-0000-00000000bbbb'
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END
$demo_projects$;

-- ===========================================
-- 정산 100개 — pending 40 / requested 30 / paid 20 / held 10
-- settlement_flow는 프로젝트의 settlement_flow_hint와 일치해야 함
-- corporate -> withholding 0
-- government -> withholding 3.30 또는 8.80
-- ===========================================
DO $demo_settlements$
DECLARE
  i int;
  v_settle_id uuid;
  v_proj_idx int;
  v_proj_id uuid;
  v_client_idx int;
  v_inst_idx int;
  v_inst_id uuid;
  v_is_gov boolean;
  v_flow settlement_flow;
  v_status settlement_status;
  v_business bigint;
  v_fee bigint;
  v_rate numeric(5,2);
  v_payment_recv timestamptz;
  v_payout_sent timestamptz;
BEGIN
  FOR i IN 1..100 LOOP
    v_settle_id := ('50000000-0000-0000-0000-0000000d' || lpad(to_hex(i), 4, '0'))::uuid;

    -- project 매핑: 1..50 cycle (2회씩)
    v_proj_idx := ((i - 1) % 50) + 1;
    v_proj_id  := ('40000000-0000-0000-0000-0000000d' || lpad(to_hex(v_proj_idx), 4, '0'))::uuid;

    -- 같은 client_idx / inst_idx 계산 (project 생성 로직과 동일)
    v_client_idx := ((v_proj_idx - 1) % 15) + 1;
    v_inst_idx   := ((v_proj_idx - 1) % 30) + 1;
    v_inst_id    := ('30000000-0000-0000-0000-0000000d' || lpad(to_hex(v_inst_idx), 4, '0'))::uuid;
    v_is_gov     := v_client_idx > 10;
    v_flow       := (CASE WHEN v_is_gov THEN 'government' ELSE 'corporate' END)::settlement_flow;

    -- 금액 (project 로직과 동일)
    v_business := 5000000 + ((v_proj_idx * 437) % 20) * 1000000;
    v_fee := (v_business * 60 / 100);
    -- 두 번째 정산은 분할 결제 (50%)
    IF i > 50 THEN
      v_business := v_business / 2;
      v_fee := v_fee / 2;
    END IF;

    -- withholding rate
    IF v_is_gov THEN
      v_rate := CASE WHEN i % 2 = 0 THEN 3.30 ELSE 8.80 END;
    ELSE
      v_rate := 0;
    END IF;

    -- status 분배: pending 40, requested 30, paid 20, held 10
    IF i <= 40 THEN
      v_status := 'pending';
      v_payment_recv := NULL;
      v_payout_sent  := NULL;
    ELSIF i <= 70 THEN
      v_status := 'requested';
      v_payment_recv := NULL;
      v_payout_sent  := NULL;
    ELSIF i <= 90 THEN
      v_status := 'paid';
      v_payment_recv := NOW() - ((i || ' days')::interval);
      v_payout_sent  := NOW() - (((i % 7) || ' days')::interval);
    ELSE
      v_status := 'held';
      v_payment_recv := NULL;
      v_payout_sent  := NULL;
    END IF;

    INSERT INTO settlements (
      id, project_id, instructor_id, settlement_flow, status,
      business_amount_krw, instructor_fee_krw, withholding_tax_rate,
      payment_received_at, payout_sent_at,
      tax_invoice_issued, tax_invoice_issued_at,
      notes, created_by
    )
    VALUES (
      v_settle_id,
      v_proj_id,
      v_inst_id,
      v_flow,
      v_status,
      v_business,
      v_fee,
      v_rate,
      v_payment_recv,
      v_payout_sent,
      (v_status = 'paid'),
      CASE WHEN v_status = 'paid' THEN (CURRENT_DATE - ((i % 14) || ' days')::interval)::date ELSE NULL END,
      '데모 정산 #' || i::text || ' — ' || v_status::text,
      '00000000-0000-0000-0000-00000000bbbb'
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END
$demo_settlements$;

-- ===========================================
-- schedule_items — in_progress 프로젝트 30개 강의 일정
-- in_progress 상태 프로젝트는 i where ((i-1) % 13) + 1 == 10  -> i = 10, 23, 36, 49 (4개)
-- 강사 중복 시 EXCLUDE 충돌 방지 위해 날짜를 다양화
-- ===========================================
DO $demo_sched$
DECLARE
  i int;
  v_inst_idx int;
  v_inst_id uuid;
  v_proj_idx int;
  v_proj_id uuid;
  v_starts timestamptz;
  v_ends timestamptz;
BEGIN
  -- 30개의 system_lecture: 강사 i (1..30) -> in_progress 프로젝트 cycle
  -- in_progress 프로젝트 후보: 10, 23, 36, 49
  FOR i IN 1..30 LOOP
    v_inst_idx := i;
    v_inst_id := ('30000000-0000-0000-0000-0000000d' || lpad(to_hex(v_inst_idx), 4, '0'))::uuid;

    v_proj_idx := CASE (i % 4) WHEN 0 THEN 10 WHEN 1 THEN 23 WHEN 2 THEN 36 ELSE 49 END;
    v_proj_id := ('40000000-0000-0000-0000-0000000d' || lpad(to_hex(v_proj_idx), 4, '0'))::uuid;

    -- 강사별 날짜 다르게 (i 가 강사를 결정 -> 강사별 1건이라 EXCLUDE 충돌 없음)
    v_starts := (DATE '2026-05-01' + ((i * 2) || ' days')::interval)::timestamptz + INTERVAL '10 hours';
    v_ends   := v_starts + INTERVAL '6 hours';

    INSERT INTO schedule_items (
      instructor_id, schedule_kind, project_id, title, starts_at, ends_at, notes, created_by
    )
    VALUES (
      v_inst_id,
      'system_lecture',
      v_proj_id,
      '[데모] 강의 일정 #' || i::text,
      v_starts,
      v_ends,
      '데모 시드',
      '00000000-0000-0000-0000-00000000bbbb'
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END
$demo_sched$;

-- ===========================================
-- satisfaction_reviews — 30건
-- UNIQUE(instructor_id, project_id) 보장 위해 distinct 강사-프로젝트 페어
-- ===========================================
DO $demo_reviews$
DECLARE
  i int;
  v_inst_idx int;
  v_proj_idx int;
  v_inst_id uuid;
  v_proj_id uuid;
  v_score smallint;
  v_comments text[] := ARRAY[
    '강의가 매우 유익했습니다.','실무에 바로 적용 가능한 내용이 많았어요.','강사님 설명이 명료하고 좋았습니다.',
    '난이도가 적절했고 만족스럽습니다.','심화 내용을 다뤄줘서 좋았어요.','예제가 풍부해서 도움이 됐습니다.',
    '시간 배분이 잘 되었습니다.','질문에 친절히 답해주셨어요.','다음 강의도 듣고 싶습니다.','전반적으로 만족합니다.'
  ];
BEGIN
  FOR i IN 1..30 LOOP
    -- 강사별로 다른 프로젝트 매핑하여 unique 보장
    v_inst_idx := i;  -- 1..30 instructor 모두 사용
    v_proj_idx := ((i - 1) % 50) + 1;  -- 강사별 1개 프로젝트 -> (instructor_id, project_id) unique
    v_inst_id := ('30000000-0000-0000-0000-0000000d' || lpad(to_hex(v_inst_idx), 4, '0'))::uuid;
    v_proj_id := ('40000000-0000-0000-0000-0000000d' || lpad(to_hex(v_proj_idx), 4, '0'))::uuid;

    -- score 1..5, 대부분 4-5
    v_score := CASE
      WHEN i % 10 = 0 THEN 3
      WHEN i % 7 = 0 THEN 2
      WHEN i % 13 = 0 THEN 1
      WHEN i % 2 = 0 THEN 5
      ELSE 4
    END;

    INSERT INTO satisfaction_reviews (instructor_id, project_id, score, comment, created_by)
    VALUES (
      v_inst_id,
      v_proj_id,
      v_score,
      v_comments[((i - 1) % array_length(v_comments,1)) + 1],
      '00000000-0000-0000-0000-00000000bbbb'
    )
    ON CONFLICT (instructor_id, project_id) DO NOTHING;
  END LOOP;
END
$demo_reviews$;

-- ===========================================
-- notifications — 20건 (operator + admin 대상)
-- ===========================================
DO $demo_notifs$
DECLARE
  i int;
  v_recipient uuid;
  v_types notification_type[] := ARRAY[
    'assignment_overdue','schedule_conflict','low_satisfaction_assignment','dday_unprocessed','settlement_requested'
  ]::notification_type[];
  v_type notification_type;
  v_titles text[] := ARRAY[
    '배정 지연 알림','일정 충돌 감지','만족도 낮은 배정','D-day 미처리 항목','정산 요청 도착'
  ];
  v_bodies text[] := ARRAY[
    '강사 배정이 지연되고 있습니다. 확인 부탁드립니다.',
    '동일 시간대 일정이 중복됩니다. 검토 필요.',
    '만족도 점수가 평균 이하인 강사 배정이 있습니다.',
    '교육 시작 D-day 임박, 미처리 항목 확인 필요.',
    '신규 정산 요청이 등록되었습니다.'
  ];
  v_recipients uuid[] := ARRAY[
    '00000000-0000-0000-0000-00000000aaaa'::uuid,  -- admin
    '00000000-0000-0000-0000-00000000bbbb'::uuid,  -- operator
    '00000000-0000-0000-0000-0000000ddd00'::uuid   -- demo admin
  ];
BEGIN
  FOR i IN 1..20 LOOP
    v_type := v_types[((i - 1) % 5) + 1];
    v_recipient := v_recipients[((i - 1) % 3) + 1];

    INSERT INTO notifications (recipient_id, type, title, body, link_url, read_at, created_at)
    VALUES (
      v_recipient,
      v_type,
      '[데모] ' || v_titles[((i - 1) % 5) + 1] || ' #' || i::text,
      v_bodies[((i - 1) % 5) + 1],
      '/dashboard?demo=' || i::text,
      CASE WHEN i % 3 = 0 THEN NOW() - INTERVAL '1 hour' ELSE NULL END,
      NOW() - ((i || ' hours')::interval)
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END
$demo_notifs$;
