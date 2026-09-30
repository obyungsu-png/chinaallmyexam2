/* 중국대학 One Stop — 콘텐츠 관리(CMS) · '메뉴편집'에서 열림
 *
 * - 편집 내용은 이 브라우저(localStorage)에 자동 임시저장되고, 사이트에 미리보기로 바로 반영됩니다.
 * - [게시하기]는 GitHub API로 data/content.js 를 커밋합니다. 저장소 Contents 쓰기 권한이 있는 토큰이 필요합니다.
 * - 파일 업로드는 같은 저장소의 uploads/ 폴더에 커밋되고, 사이트에서는 'uploads/파일명' 경로로 사용합니다.
 */
(function () {
  'use strict';

  const DRAFT_KEY = 'cms.draft.v1';
  const PREVIEW_KEY = 'cms.preview';
  const CFG_KEY = 'cms.github';
  const TOKEN_KEY = 'cms.token';
  const CONTENT_PATH = 'data/content.js';
  const UPLOAD_DIR = 'uploads';
  const MAX_UPLOAD = 20 * 1024 * 1024;
  const DEFAULT_CFG = { owner: 'obyungsu-png', repo: 'chinaallmyexam2', branch: 'main' };

  const esc = window.esc;
  const clone = o => JSON.parse(JSON.stringify(o));
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => [...(el || document).querySelectorAll(sel)];
  const stripTags = s => String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  /* ---------- 브라우저 저장소 ---------- */
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { toast('브라우저 저장공간에 쓸 수 없습니다: ' + e.message, 'error'); } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* 무시 */ } },
  };
  function getToken() {
    try { return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }
  function setToken(token, remember) {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);
      if (token) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
    } catch (e) { toast('토큰을 저장하지 못했습니다: ' + e.message, 'error'); }
  }
  function tokenRemembered() { try { return !!localStorage.getItem(TOKEN_KEY); } catch (e) { return false; } }
  function getCfg() {
    try { return Object.assign({}, DEFAULT_CFG, JSON.parse(store.get(CFG_KEY) || '{}')); } catch (e) { return clone(DEFAULT_CFG); }
  }

  /* ---------- 임시저장본 ---------- */
  let draft = null;
  const state = { section: 'dashboard', index: 0, filter: '', blockKey: '' };

  function published() { return window.SITE_CONTENT || {}; }
  function loadDraft() {
    const d = window.readCmsDraft();
    if (d) return d;
    return { content: clone(published()), baseUpdatedAt: published().updatedAt || '', savedAt: '' };
  }
  function changedKeys() {
    const p = published(), c = draft.content;
    const keys = new Set([...Object.keys(p), ...Object.keys(c)]);
    keys.delete('updatedAt');
    return [...keys].filter(k => JSON.stringify(p[k]) !== JSON.stringify(c[k]));
  }
  function isDirty() { return changedKeys().length > 0; }

  let renderTimer = null;
  function commit(immediate) {
    draft.savedAt = new Date().toISOString();
    store.set(DRAFT_KEY, JSON.stringify(draft));
    store.set(PREVIEW_KEY, isDirty() ? '1' : '0');
    clearTimeout(renderTimer);
    const run = () => { window.setSiteContent(draft.content); updateStatus(); };
    if (immediate) run(); else renderTimer = setTimeout(run, 250);
  }

  /* ---------- 경로 헬퍼 (guide.site, buttons.0.text …) ---------- */
  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }
  function setPath(obj, path, val) {
    const ks = path.split('.');
    let o = obj;
    ks.slice(0, -1).forEach((k, i) => {
      if (o[k] == null || typeof o[k] !== 'object') o[k] = /^\d+$/.test(ks[i + 1]) ? [] : {};
      o = o[k];
    });
    o[ks[ks.length - 1]] = val;
  }

  /* ---------- 링크 선택지 ---------- */
  const PAGE_LINKS = [
    ['page:cscaOverlay', 'CSCA 시험 안내'], ['page:admGuideOverlay', '입시 핵심가이드'], ['page:admGuideOverlay#ag-schedule', '전형일정'],
    ['page:admGuideOverlay#ag-lang', '어학 기준'], ['page:admGuideOverlay#ag-nation', '국적 심사'], ['page:admGuideOverlay#ag-sites', '공식 사이트 모음'],
    ['page:admGuideOverlay#ag-scholar', '장학금'], ['page:univOverlay', '대학정보'], ['page:deptOverlay', '학과정보'], ['page:admOverlay', '전형정보'],
    ['page:univGradeOverlay', '합격분석'], ['page:gradeOverlay', '성적입력'], ['page:dataOverlay', '유학자료실'], ['page:compOverlay', '서류·면접 상담'],
    ['page:consultOverlay', '온라인 유학상담'], ['page:jobOverlay', '직업정보'], ['page:loginOverlay', '로그인'], ['page:admGuideOverlay#ag-top', '명문대 전형 비교'], ['home:', '홈'],
  ];
  const WIDGET_LINKS = [
    ['modal:csca', 'CSCA 가이드'], ['modal:csca#4', 'CSCA 가이드 · 내 과목 찾기'], ['modal:guide', '자격요건 가이드'], ['modal:guide#1', '자격요건 가이드 · 국적·거주 계산기'],
    ['modal:novice', '초보자 가이드'], ['modal:novice#5', '초보자 가이드 · 입학도우미'], ['modal:hsk', 'HSK 준비 가이드'], ['modal:hsk#2', 'HSK 가이드 · 대학별 요구 수준'],
    ['modal:docs', '서류준비 가이드'], ['modal:menu', '전체메뉴'], ['modal:cms', '콘텐츠 관리(CMS)'],
  ];
  function linkOptions() {
    const univs = (draft.content.univs || []).map(u => `<option value="univ:${esc(u.cn)}">${esc(u.ko)} 모집요강</option>`).join('');
    const pages = (draft.content.pages || []).filter(pg => pg.slug).map(pg => `<option value="custom:${esc(pg.slug)}">${esc(pg.title || pg.slug)}</option>`).join('');
    const opt = ([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`;
    return `<option value="">사이트 안 페이지 선택…</option><optgroup label="페이지">${PAGE_LINKS.map(opt).join('')}</optgroup>`
      + `<optgroup label="오른쪽 위젯 창">${WIDGET_LINKS.map(opt).join('')}</optgroup>`
      + (pages ? `<optgroup label="추가 페이지">${pages}</optgroup>` : '')
      + `<optgroup label="대학 모집요강 창">${univs}</optgroup>`;
  }
  const LINK_HINT = '비우면 클릭 없음 · https://… 외부 주소 · 오른쪽 목록에서 사이트 안 페이지 선택';

  /* ---------- 편집 화면 정의 ---------- */
  const THEMES = [
    ['slide-csca', '청록 (CSCA)'], ['slide-1', '파랑'], ['slide-2', '하늘'], ['slide-3', '노랑'], ['slide-4', '연노랑'],
    ['slide-5', '밤하늘'], ['slide-6', '밝은 회색'], ['slide-7', '보라'], ['custom', '직접 색상 지정'],
  ];
  const SECTIONS = [
    { id: 'dashboard', label: '대시보드 · 게시', icon: 'fa-rocket' },
    { id: 'banners', key: 'banners', type: 'list', label: '메인 배너', icon: 'fa-images',
      help: '홈 상단 슬라이드입니다. 순서는 ▲▼로 바꾸고, 잠시 숨기려면 "표시"를 끄세요. 제목·설명에는 &lt;br&gt;, &lt;strong&gt; 같은 HTML을 쓸 수 있습니다.',
      title: b => stripTags(b.title) + ' ' + stripTags(b.em), sub: b => (b.enabled === false ? '숨김 · ' : '') + (THEMES.find(t => t[0] === b.theme) || ['', ''])[1],
      create: () => ({ enabled: true, theme: 'slide-2', icon: 'fa-star', title: '새 배너 제목', em: '', desc: '', extraHtml: '', buttons: [] }),
      fields: [
        { path: 'enabled', label: '홈에 표시', type: 'checkbox' },
        { path: 'theme', label: '색상 테마', type: 'select', options: THEMES },
        { path: 'bg1', label: '배경색 1', type: 'color', hint: '"직접 색상 지정" 테마에서만 사용' },
        { path: 'bg2', label: '배경색 2', type: 'color' },
        { path: 'textColor', label: '글자색', type: 'color' },
        { path: 'emColor', label: '강조 제목 글자색', type: 'color' },
        { path: 'tag', label: '작은 태그 (선택)', type: 'text' },
        { path: 'title', label: '제목', type: 'html', rows: 2 },
        { path: 'em', label: '강조 제목 (큰 글씨, 다음 줄)', type: 'html', rows: 1 },
        { path: 'desc', label: '설명', type: 'html', rows: 4 },
        { path: 'buttons', label: '버튼', type: 'sublist', addLabel: '버튼 추가',
          create: () => ({ text: '', link: '', bg: '#2db4a8', color: '#ffffff' }),
          sub: [{ key: 'text', ph: '버튼 문구' }, { key: 'link', type: 'link', ph: '링크' }, { key: 'bg', type: 'color', title: '버튼 색', def: '#2db4a8' }, { key: 'color', type: 'color', title: '글자색', def: '#ffffff' }] },
        { path: 'icon', label: '오른쪽 아이콘', type: 'text', hint: 'Font Awesome 이름 (예: fa-star, fab fa-youtube)' },
        { path: 'image', label: '오른쪽 이미지 (아이콘 대신)', type: 'image' },
        { path: 'bgImage', label: '배경 이미지 (선택)', type: 'image' },
        { path: 'extraHtml', label: '추가 HTML (고급)', type: 'html', rows: 4 },
      ] },
    { id: 'notices', key: 'notices', type: 'list', label: '공지사항', icon: 'fa-bullhorn',
      help: '홈 오른쪽 공지사항 목록입니다. 위에서 3~4개가 보기 좋습니다.',
      title: n => n.text, sub: n => n.badge,
      create: () => ({ badge: '일반', style: 'general', text: '새 공지', link: '' }),
      fields: [
        { path: 'badge', label: '말머리', type: 'text' },
        { path: 'style', label: '말머리 색상', type: 'select', options: [['main', '강조(청록)'], ['general', '일반(초록)']] },
        { path: 'text', label: '공지 제목', type: 'text' },
        { path: 'link', label: '클릭 시 이동', type: 'link' },
      ] },
    { id: 'news', key: 'news', type: 'list', label: '유학 주요자료', icon: 'fa-newspaper',
      help: '홈 "유학 주요자료" 목록입니다.', title: n => n.title, sub: n => n.meta,
      create: () => ({ icon: 'fa-newspaper', title: '새 소식', meta: '', link: '' }),
      fields: [
        { path: 'title', label: '제목', type: 'text' },
        { path: 'meta', label: '분류 (작은 글씨)', type: 'text' },
        { path: 'icon', label: '아이콘', type: 'text', hint: '예: fa-newspaper, fa-pen-alt' },
        { path: 'link', label: '클릭 시 이동', type: 'link' },
      ] },
    { id: 'officialSites', key: 'officialSites', type: 'list', label: '공식 사이트 바로가기', icon: 'fa-globe-asia',
      help: '홈 "공식 사이트 바로가기" 목록입니다.', title: o => o.name, sub: o => o.url,
      create: () => ({ icon: 'fa-globe', name: '새 사이트', desc: '', url: 'https://' }),
      fields: [
        { path: 'name', label: '이름', type: 'text' },
        { path: 'desc', label: '설명', type: 'text' },
        { path: 'url', label: '주소', type: 'text' },
        { path: 'icon', label: '아이콘', type: 'text' },
      ] },
    { id: 'univs', key: 'univs', type: 'list', label: '대학정보 · 모집요강', icon: 'fa-university',
      help: '대학정보 표와 "招生简章 확인" 창의 내용입니다. 새 모집요강이 나오면 접수 기간·어학 기준·신청비 등을 고치고 기본 설정의 "모집요강 기준 문구"도 바꿔 주세요.',
      title: u => `${u.ko} ${u.cn}`, sub: u => `${TIER_LABEL_CMS[u.tier] || u.tier} · ${u.region}`,
      create: () => ({ ko: '새 대학교', cn: '新大学', region: '', tier: '211', strength: '', guide: {} }),
      fields: [
        { path: 'ko', label: '대학명 (한글)', type: 'text' },
        { path: 'cn', label: '대학명 (中文)', type: 'text', hint: '전형정보·학과정보가 이 이름으로 연결됩니다. 바꾸면 그쪽도 함께 고치세요.' },
        { path: 'region', label: '지역', type: 'text' },
        { path: 'tier', label: '구분', type: 'select', options: [['985', '985·211'], ['211', '211'], ['dbl', '双一流'], ['etc', '일반']] },
        { path: 'strength', label: '강점 분야', type: 'text' },
        { heading: '유학생 모집요강 (招生简章)' },
        { path: 'guide.site', label: '유학생 입학처 사이트', type: 'text' },
        { path: 'guide.brochure', label: '모집요강 원문 링크', type: 'text' },
        { path: 'guide.apply', label: '온라인 지원시스템', type: 'text' },
        { path: 'guide.period', label: '접수 기간', type: 'textarea', rows: 2 },
        { path: 'guide.lang', label: '어학 기준', type: 'textarea', rows: 3 },
        { path: 'guide.csca', label: 'CSCA', type: 'textarea', rows: 2 },
        { path: 'guide.selection', label: '선발 방식', type: 'text' },
        { path: 'guide.fee', label: '신청비', type: 'text' },
        { path: 'guide.tuition', label: '학비', type: 'textarea', rows: 2 },
        { path: 'guide.age', label: '지원 연령', type: 'text' },
        { path: 'guide.notes', label: '참고 사항', type: 'textarea', rows: 3 },
        { heading: '성적입력 자동 점검 기준 (비우면 "모집요강 확인"으로 표시)' },
        { path: 'req.hsk', label: 'HSK 기준', type: 'text', hint: '급수:총점[:쓰기] 를 | 로 나열 — 하나만 충족하면 통과 (예: 5:200:60|6:180)' },
        { path: 'req.hskHum', label: 'HSK 기준 (인문 계열이 다를 때)', type: 'text', hint: '예: 6:180' },
        { path: 'req.eng', label: '영어 기준 (영어 授课)', type: 'text', hint: '예: ielts:6.0|toefl:80' },
        { path: 'req.csca', label: 'CSCA', type: 'select', options: [['', '모집요강 확인 (장학생은 필수)'], ['required', '자비생도 필수'], ['alt', '자체 시험 등으로 대체 가능'], ['intl', '국제공인성적 중 하나로 제출']] },
        { path: 'req.age', label: '지원 연령', type: 'text', hint: '최소-최대, 입학 연도 9월 1일 기준 (예: 18-25, 18-, -25)' },
      ] },
    { id: 'depts', key: 'depts', type: 'list', label: '학과정보', icon: 'fa-book-open',
      help: '학과정보 표의 전공 목록입니다.', title: d => `${d.ko} ${d.cn}`, sub: d => d.univ,
      create: () => ({ ko: '새 전공', cn: '', univ: '', field: '', lang: '중국어', years: '4년' }),
      fields: [
        { path: 'ko', label: '전공명 (한글)', type: 'text' },
        { path: 'cn', label: '전공명 (中文)', type: 'text' },
        { path: 'univ', label: '대학', type: 'univ' },
        { path: 'field', label: '계열', type: 'text' },
        { path: 'lang', label: '수업언어', type: 'select', options: [['중국어', '중국어'], ['영어', '영어']] },
        { path: 'years', label: '학제', type: 'text' },
      ] },
    { id: 'admissions', key: 'admissions', type: 'list', label: '전형정보', icon: 'fa-file-alt',
      help: '전형정보 표의 행입니다. "모집요강 보기" 버튼은 선택한 대학의 모집요강 창을 엽니다.',
      title: a => a.univ + ' · ' + a.course, sub: a => a.method,
      create: () => ({ univ: '', course: '본과(중국어)', method: '서류·면접', csca: '수학 + 전문 중국어', cscaSub: '', lang: '', langEn: false, period: '' }),
      fields: [
        { path: 'univ', label: '대학', type: 'univ' },
        { path: 'course', label: '모집과정', type: 'text' },
        { path: 'method', label: '선발방식', type: 'text' },
        { path: 'csca', label: 'CSCA 과목', type: 'text' },
        { path: 'cscaSub', label: 'CSCA 보조 설명', type: 'textarea', rows: 2 },
        { path: 'lang', label: '어학기준', type: 'textarea', rows: 2 },
        { path: 'langEn', label: '영어 성적 기준 (파란 배지)', type: 'checkbox' },
        { path: 'period', label: '원서접수', type: 'text' },
      ] },
    { id: 'resources', key: 'resources', type: 'list', label: '유학자료실', icon: 'fa-database',
      help: '유학자료실 카드입니다. 파일을 올리면 카드의 파일 이름을 눌러 받을 수 있습니다.',
      title: r => r.title, sub: r => r.meta,
      create: () => ({ thumb: '새 자료', color: '', tags: '공통', title: '새 자료', fileLabel: '', fileUrl: '', link: '', meta: '입시정보센터 · ' + new Date().toISOString().slice(0, 10) }),
      fields: [
        { path: 'title', label: '제목', type: 'text' },
        { path: 'tags', label: '태그 (쉼표로 구분)', type: 'text' },
        { path: 'thumb', label: '표지 글자 (줄바꿈 가능)', type: 'textarea', rows: 3 },
        { path: 'color', label: '표지 색상', type: 'select', options: [['', '파랑'], ['green', '초록'], ['orange', '주황']] },
        { path: 'fileLabel', label: '파일 이름 (표시용)', type: 'text' },
        { path: 'fileUrl', label: '첨부 파일', type: 'file' },
        { path: 'link', label: '카드 클릭 시 이동', type: 'link' },
        { path: 'meta', label: '작성자 · 날짜', type: 'text' },
      ] },
    { id: 'settings', key: 'settings', type: 'object', label: '기본 설정', icon: 'fa-sliders-h',
      help: '로고·연락처·푸터 등 여러 곳에 쓰이는 문구입니다.',
      fields: [
        { path: 'logoMain', label: '로고 앞부분', type: 'text' },
        { path: 'logoSub', label: '로고 강조 부분', type: 'text' },
        { path: 'logoTail', label: '로고 뒷부분', type: 'text' },
        { path: 'searchPlaceholder', label: '검색창 안내 문구', type: 'text' },
        { heading: '상담 연락처' },
        { path: 'phoneLabel', label: '전화 제목', type: 'text' },
        { path: 'phone', label: '전화번호', type: 'text' },
        { path: 'phoneHours', label: '운영 시간', type: 'textarea', rows: 3 },
        { path: 'wechat', label: '위챗 상담', type: 'text' },
        { path: 'officialNote', label: '공식 사이트 목록 아래 안내', type: 'textarea', rows: 2 },
        { heading: '모집요강 창' },
        { path: 'guideBasis', label: '모집요강 기준 문구', type: 'text' },
        { path: 'guideNotice', label: '모집요강 주의 문구', type: 'textarea', rows: 2 },
        { heading: '푸터' },
        { path: 'footerOrgName', label: '기관명', type: 'text' },
        { path: 'footerAbout', label: '소개', type: 'textarea', rows: 3 },
        { path: 'footerNoticeTitle', label: '안내 제목', type: 'text' },
        { path: 'footerNotice', label: '안내 문구', type: 'textarea', rows: 3 },
      ] },
    { id: 'blocks', label: '페이지 문구 · 위젯 내용', icon: 'fa-paragraph' },
    { id: 'media', label: '파일 업로드', icon: 'fa-cloud-upload-alt' },
    { id: 'github', label: '게시 설정', icon: 'fa-key' },
  ];
  const TIER_LABEL_CMS = { '985': '985·211', '211': '211', 'dbl': '双一流', 'etc': '일반' };
  const shown = x => (x.enabled === false ? '숨김 · ' : '');
  SECTIONS.push(
    { id: 'navItems', key: 'navItems', type: 'list', label: '아이콘 메뉴', icon: 'fa-th',
      help: '상단 아이콘 메뉴입니다. 순서는 ▲▼, 잠시 빼려면 "표시"를 끄고, 필요 없으면 삭제하세요. 맨 끝의 "메뉴편집"(이 화면)은 항상 고정됩니다.',
      title: n => n.label, sub: n => shown(n) + (n.link || '링크 없음'),
      create: () => ({ enabled: true, label: '새 메뉴', icon: 'fa-star', link: '' }),
      fields: [
        { path: 'enabled', label: '표시', type: 'checkbox' },
        { path: 'label', label: '메뉴 이름', type: 'text' },
        { path: 'icon', label: '아이콘', type: 'text', hint: 'Font Awesome 이름 (예: fa-star, fa-university)' },
        { path: 'link', label: '누르면 이동', type: 'link' },
      ] },
    { id: 'sideWidgets', key: 'sideWidgets', type: 'list', label: '오른쪽 위젯 버튼', icon: 'fa-grip-vertical',
      help: '화면 오른쪽에 붙어 있는 가이드 버튼입니다. 버튼이 여는 창(CSCA·자격요건·초보자·HSK·서류준비 가이드)의 내용은 "페이지 문구"에서 고칩니다.',
      title: w => String(w.label || '').replace(/\n/g, ' '), sub: w => shown(w) + (w.link || ''),
      create: () => ({ enabled: true, label: '새\n위젯', link: '', color: '' }),
      fields: [
        { path: 'enabled', label: '표시', type: 'checkbox' },
        { path: 'label', label: '버튼 글자 (줄바꿈으로 줄 나눔)', type: 'textarea', rows: 3 },
        { path: 'link', label: '누르면 열기', type: 'link' },
        { path: 'color', label: '버튼 색 (비우면 기본 색)', type: 'color' },
      ] },
    { id: 'fullMenu', key: 'fullMenu', type: 'list', label: '전체메뉴', icon: 'fa-bars',
      help: '왼쪽 위 ≡ 버튼을 누르면 나오는 전체메뉴입니다. 분류마다 링크를 추가·삭제할 수 있고, 링크가 비어 있으면 회색 글자로만 보입니다.',
      title: c => c.title, sub: c => `링크 ${(c.links || []).length}개`,
      create: () => ({ title: '새 분류', icon: 'fa-folder', links: [] }),
      fields: [
        { path: 'title', label: '분류 이름', type: 'text' },
        { path: 'icon', label: '아이콘', type: 'text' },
        { path: 'links', label: '메뉴 링크', type: 'sublist', addLabel: '링크 추가',
          create: () => ({ text: '', link: '', wide: false }),
          sub: [{ key: 'text', ph: '메뉴 이름' }, { key: 'link', type: 'link', ph: '링크' }, { key: 'wide', type: 'checkbox', title: '한 줄 전체' }] },
      ] },
    { id: 'footerLinks', key: 'footerLinks', type: 'list', label: '푸터 링크', icon: 'fa-shoe-prints',
      help: '맨 아래 푸터의 링크(개인정보처리방침 등)입니다.', title: l => l.text, sub: l => l.link || '링크 없음',
      create: () => ({ text: '새 링크', link: '' }),
      fields: [{ path: 'text', label: '글자', type: 'text' }, { path: 'link', label: '누르면 이동', type: 'link' }] },
    { id: 'relatedSites', key: 'relatedSites', type: 'list', label: '관련기관', icon: 'fa-link',
      help: '푸터의 "관련기관" 선택 상자에 들어가는 사이트입니다.', title: r => r.name, sub: r => r.url,
      create: () => ({ name: '새 기관', url: 'https://' }),
      fields: [{ path: 'name', label: '이름', type: 'text' }, { path: 'url', label: '주소', type: 'text' }] },
    { id: 'pages', key: 'pages', type: 'list', label: '추가 페이지', icon: 'fa-file-medical',
      help: '원하는 내용으로 새 페이지를 만들 수 있습니다. 링크 주소는 <code>custom:페이지주소</code>이며, 아이콘 메뉴·전체메뉴·배너 버튼의 링크 선택 목록에도 나타납니다. 본문은 HTML로 쓰거나 "화면에서 편집"으로 고치세요.',
      title: pg => pg.title, sub: pg => shown(pg) + 'custom:' + (pg.slug || '?'),
      create: () => ({ enabled: true, slug: 'page-' + Date.now().toString(36), title: '새 페이지', subtitle: '', html: '<p>내용을 입력하세요.</p>' }),
      actions: [{ act: 'page-open', icon: 'fa-eye', label: '사이트에서 열기' }, { act: 'page-inline', icon: 'fa-mouse-pointer', label: '화면에서 편집', primary: true }],
      fields: [
        { path: 'enabled', label: '공개', type: 'checkbox' },
        { path: 'title', label: '제목', type: 'text' },
        { path: 'subtitle', label: '부제목', type: 'text' },
        { path: 'slug', label: '페이지 주소', type: 'text', hint: '영문 소문자·숫자·하이픈 (예: yearly-plan) → 링크는 custom:yearly-plan' },
        { path: 'html', label: '본문', type: 'html', rows: 16 },
      ] },
  );
  const GROUPS = [
    ['', ['dashboard']],
    ['홈 화면', ['banners', 'notices', 'news', 'officialSites']],
    ['메뉴 · 위젯', ['navItems', 'sideWidgets', 'fullMenu', 'footerLinks', 'relatedSites']],
    ['대학 · 입시 정보', ['univs', 'depts', 'admissions', 'resources']],
    ['페이지 · 문구', ['blocks', 'pages', 'settings']],
    ['파일 · 게시', ['media', 'github']],
  ];
  const ORDERED = GROUPS.flatMap(([g, ids]) => ids.map(id => Object.assign(SECTIONS.find(x => x.id === id), { group: g })));
  SECTIONS.splice(0, SECTIONS.length, ...ORDERED);
  const KEY_LABELS = Object.assign({ blocks: '페이지 문구', hiddenBlocks: '페이지 문구(숨김)' }, ...SECTIONS.filter(s => s.key).map(s => ({ [s.key]: s.label })));

  /* ---------- 공통 UI ---------- */
  let root = null;
  function toast(msg, type) {
    const el = $('#cmsToast');
    if (!el) { alert(msg); return; }
    el.textContent = msg;
    el.className = 'cms-toast show ' + (type || '');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.className = 'cms-toast'; }, type === 'error' ? 7000 : 3500);
  }
  function fmtTime(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function currentSection() { return SECTIONS.find(s => s.id === state.section) || SECTIONS[0]; }
  function currentItems() { const s = currentSection(); return s.type === 'list' ? (draft.content[s.key] || (draft.content[s.key] = [])) : null; }
  function currentTarget() {
    const s = currentSection();
    if (s.type === 'list') return currentItems()[state.index];
    if (s.type === 'object') return draft.content[s.key] || (draft.content[s.key] = {});
    return null;
  }

  function build() {
    root = document.createElement('div');
    root.className = 'cms-root';
    root.id = 'cmsRoot';
    root.innerHTML = `
      <div class="cms-shell">
        <aside class="cms-side">
          <div class="cms-brand"><i class="fas fa-cogs"></i> 콘텐츠 관리<small>메뉴편집 · CMS</small></div>
          <nav class="cms-nav" id="cmsNav"></nav>
          <div class="cms-side-foot" id="cmsSideFoot"></div>
        </aside>
        <main class="cms-main">
          <header class="cms-top">
            <h2 id="cmsTitle"></h2>
            <span class="cms-status" id="cmsStatus"></span>
            <button class="cms-btn" data-act="preview"><i class="fas fa-eye"></i> 사이트에서 보기</button>
            <button class="cms-btn primary" data-act="publish"><i class="fas fa-cloud-upload-alt"></i> 게시하기</button>
            <button class="cms-btn ghost" data-act="close" title="닫기"><i class="fas fa-times"></i></button>
          </header>
          <div class="cms-content" id="cmsContent"></div>
        </main>
      </div>
      <div class="cms-toast" id="cmsToast"></div>`;
    document.body.appendChild(root);
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onInput);
    buildInlineBar();
  }

  function renderNav() {
    const changed = changedKeys();
    let lastGroup = null;
    $('#cmsNav').innerHTML = SECTIONS.map(s => {
      const dot = (s.key && changed.includes(s.key)) || (s.id === 'blocks' && (changed.includes('blocks') || changed.includes('hiddenBlocks'))) ? '<span class="cms-dot" title="게시 안 된 변경"></span>' : '';
      const head = s.group !== lastGroup && s.group ? `<div class="cms-nav-group">${s.group}</div>` : '';
      lastGroup = s.group;
      return `${head}<button class="cms-nav-btn${s.id === state.section ? ' active' : ''}" data-act="nav" data-id="${s.id}"><i class="fas ${s.icon}"></i><span>${s.label}</span>${dot}</button>`;
    }).join('');
  }
  function updateStatus() {
    if (!root) return;
    const n = changedKeys().length;
    $('#cmsStatus').innerHTML = n ? `<i class="fas fa-circle" style="color:#ffa726;"></i> 게시 안 된 변경 ${n}곳 · 자동 임시저장됨` : '<i class="fas fa-check-circle" style="color:#43a047;"></i> 게시본과 같음';
    const cfg = getCfg();
    $('#cmsSideFoot').innerHTML = `저장소 <b>${esc(cfg.owner)}/${esc(cfg.repo)}</b> · ${esc(cfg.branch)}<br>토큰 ${getToken() ? '<b style="color:#80cbc4;">연결됨</b>' : '<b style="color:#ffab91;">없음</b>'}`;
    renderNav();
  }

  function render() {
    const s = currentSection();
    $('#cmsTitle').innerHTML = `<i class="fas ${s.icon}"></i> ${s.label}`;
    const el = $('#cmsContent');
    if (s.type === 'list') el.innerHTML = listView(s);
    else if (s.type === 'object') el.innerHTML = `<div class="cms-help">${s.help || ''}</div><div class="cms-form cms-card">${formHtml(s.fields, currentTarget())}</div>`;
    else el.innerHTML = VIEWS[s.id]();
    if (s.id === 'media') loadMedia();
    updateStatus();
  }

  /* ---------- 목록 편집 ---------- */
  function listItemsHtml(s) {
    const items = currentItems();
    const f = state.filter.trim().toLowerCase();
    const html = items.map((it, i) => ({ it, i }))
      .filter(({ it }) => !f || JSON.stringify(it).toLowerCase().includes(f))
      .map(({ it, i }) => `<div class="cms-item${i === state.index ? ' active' : ''}" data-act="select" data-i="${i}">
          <div class="cms-item-title">${esc(s.title(it) || '(제목 없음)')}</div><div class="cms-item-sub">${esc(s.sub ? s.sub(it) : '')}</div></div>`).join('');
    return html || '<div class="cms-empty">항목이 없습니다.</div>';
  }
  function listView(s) {
    const items = currentItems();
    if (state.index >= items.length) state.index = items.length - 1;
    if (state.index < 0 && items.length) state.index = 0;
    const item = items[state.index];
    return `<div class="cms-help">${s.help || ''}</div>
      <div class="cms-split">
        <div class="cms-list-col cms-card">
          <div class="cms-list-tools">
            <button class="cms-btn sm" data-act="add"><i class="fas fa-plus"></i> 추가</button>
            <button class="cms-btn sm" data-act="dup" title="복제"><i class="fas fa-copy"></i></button>
            <button class="cms-btn sm" data-act="up" title="위로"><i class="fas fa-arrow-up"></i></button>
            <button class="cms-btn sm" data-act="down" title="아래로"><i class="fas fa-arrow-down"></i></button>
            <button class="cms-btn sm danger" data-act="del" title="삭제"><i class="fas fa-trash"></i></button>
          </div>
          ${items.length > 8 ? `<input class="cms-input cms-filter" data-act="filter" placeholder="목록에서 찾기" value="${esc(state.filter)}">` : ''}
          <div class="cms-list" id="cmsList">${listItemsHtml(s)}</div>
          <div class="cms-count">총 ${items.length}개</div>
        </div>
        <div class="cms-form-col cms-card">${item
          ? (s.actions ? `<div class="cms-actions" style="margin:0 0 14px;">${s.actions.map(a => `<button class="cms-btn sm${a.primary ? ' primary' : ''}" data-act="${a.act}"><i class="fas ${a.icon}"></i> ${a.label}</button>`).join('')}</div>` : '') + formHtml(s.fields, item)
          : '<div class="cms-empty">왼쪽에서 항목을 선택하거나 추가하세요.</div>'}</div>
      </div>`;
  }
  function refreshListTitles() {
    const s = currentSection();
    if (s.type !== 'list') return;
    const item = currentItems()[state.index];
    const row = $(`.cms-item[data-i="${state.index}"]`, root);
    if (!row || !item) return;
    $('.cms-item-title', row).textContent = s.title(item) || '(제목 없음)';
    $('.cms-item-sub', row).textContent = s.sub ? s.sub(item) : '';
  }

  /* ---------- 입력 필드 ---------- */
  let fieldSeq = 0;
  function formHtml(fields, obj) {
    return fields.map(f => f.heading ? `<div class="cms-heading">${f.heading}</div>` : fieldHtml(f, getPath(obj, f.path))).join('');
  }
  function fieldHtml(f, v) {
    const id = 'cmsf' + (++fieldSeq);
    const val = v == null ? '' : v;
    const hint = f.hint ? `<span class="cms-hint">${f.hint}</span>` : '';
    const label = `<label class="cms-label" for="${id}">${f.label}${hint}</label>`;
    const attrs = `id="${id}" data-path="${esc(f.path)}"`;
    switch (f.type) {
      case 'checkbox':
        return `<div class="cms-field"><label class="cms-check"><input type="checkbox" ${attrs}${val ? ' checked' : ''}> ${f.label}</label></div>`;
      case 'textarea':
        return `<div class="cms-field">${label}<textarea class="cms-input" rows="${f.rows || 3}" ${attrs}>${esc(val)}</textarea></div>`;
      case 'html':
        return `<div class="cms-field">${label.replace('</label>', '<span class="cms-hint">HTML 사용 가능</span></label>')}<textarea class="cms-input cms-code" rows="${f.rows || 3}" ${attrs}>${esc(val)}</textarea></div>`;
      case 'select':
        return `<div class="cms-field">${label}<select class="cms-input" ${attrs}>${f.options.map(([ov, ol]) => `<option value="${esc(ov)}"${String(val) === ov ? ' selected' : ''}>${esc(ol)}</option>`).join('')}</select></div>`;
      case 'univ': {
        const opts = (draft.content.univs || []).map(u => `<option value="${esc(u.cn)}"${val === u.cn ? ' selected' : ''}>${esc(u.ko)} (${esc(u.cn)})</option>`).join('');
        return `<div class="cms-field">${label}<select class="cms-input" ${attrs}><option value="">대학 선택…</option>${opts}</select></div>`;
      }
      case 'color': {
        const hex = /^#[0-9a-f]{6}$/i.test(val) ? val : '#2db4a8';
        return `<div class="cms-field">${label}<div class="cms-row"><input type="color" class="cms-color" data-path="${esc(f.path)}" value="${hex}"><input class="cms-input" ${attrs} value="${esc(val)}" placeholder="#2db4a8"></div></div>`;
      }
      case 'link':
        return `<div class="cms-field">${label}<div class="cms-row"><input class="cms-input" ${attrs} value="${esc(val)}" placeholder="https://… 또는 page:…"><select class="cms-input cms-link-pick" data-act="pick-link" data-for="${id}">${linkOptions()}</select></div><div class="cms-sub-hint">${LINK_HINT}</div></div>`;
      case 'image':
      case 'file': {
        const preview = f.type === 'image' && val ? `<img class="cms-thumb" src="${esc(val)}" alt="">` : '';
        return `<div class="cms-field">${label}<div class="cms-row"><input class="cms-input" ${attrs} value="${esc(val)}" placeholder="uploads/… 또는 https://…">
          <button class="cms-btn sm" data-act="upload" data-for="${id}" data-accept="${f.type === 'image' ? 'image/*' : ''}"><i class="fas fa-upload"></i> 업로드</button></div>${preview}</div>`;
      }
      case 'sublist': {
        const arr = Array.isArray(val) ? val : [];
        const rows = arr.map((row, i) => `<div class="cms-subrow">${f.sub.map(sf => {
          const path = `${f.path}.${i}.${sf.key}`;
          const v = row[sf.key];
          if (sf.type === 'color') return `<input type="color" class="cms-color" data-path="${esc(path)}" value="${/^#[0-9a-f]{6}$/i.test(v) ? v : (sf.def || '#2db4a8')}" title="${sf.title || ''}">`;
          if (sf.type === 'checkbox') return `<label class="cms-check sm"><input type="checkbox" data-path="${esc(path)}"${v ? ' checked' : ''}> ${sf.title || ''}</label>`;
          if (sf.type === 'link') {
            const lid = id + '_' + i + '_' + sf.key;
            return `<input class="cms-input" id="${lid}" data-path="${esc(path)}" value="${esc(v)}" placeholder="${sf.ph || ''}"><select class="cms-input cms-link-pick" data-act="pick-link" data-for="${lid}">${linkOptions()}</select>`;
          }
          return `<input class="cms-input" data-path="${esc(path)}" value="${esc(v)}" placeholder="${sf.ph || ''}">`;
        }).join('')}
            <button class="cms-btn sm" data-act="sub-up" data-path="${f.path}" data-i="${i}" title="위로"><i class="fas fa-arrow-up"></i></button>
            <button class="cms-btn sm danger" data-act="sub-del" data-path="${f.path}" data-i="${i}" title="삭제"><i class="fas fa-times"></i></button></div>`).join('');
        return `<div class="cms-field">${label}${rows}<button class="cms-btn sm" data-act="sub-add" data-path="${f.path}"><i class="fas fa-plus"></i> ${f.addLabel || '추가'}</button></div>`;
      }
      default:
        return `<div class="cms-field">${label}<input class="cms-input" ${attrs} value="${esc(val)}"></div>`;
    }
  }

  function onInput(e) {
    const el = e.target;
    if (el.dataset.act === 'filter') {
      if (e.type !== 'input') return;     // blur 시 change 로 목록을 다시 그리면 클릭이 사라짐
      state.filter = el.value;
      $('#cmsList').innerHTML = currentSection().id === 'blocks' ? blockRowsHtml() : listItemsHtml(currentSection());
      return;
    }
    if (el.dataset.act === 'pick-link') {
      if (e.type !== 'change' || !el.value) return;
      const target = document.getElementById(el.dataset.for);
      target.value = el.value;
      el.value = '';
      target.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    if (el.dataset.act === 'gh') return;          // 게시 설정 폼은 저장 버튼으로 처리
    const path = el.dataset.path;
    const target = currentTarget();
    if (!path || !target) return;
    const v = el.type === 'checkbox' ? el.checked : el.value;
    setPath(target, path, v);
    $$(`[data-path="${CSS.escape(path)}"]`, root).forEach(o => {
      if (o === el || o.type === 'checkbox') return;
      if (o.type === 'color') { if (/^#[0-9a-f]{6}$/i.test(v)) o.value = v; } else o.value = v;
    });
    refreshListTitles();
    commit();
  }

  /* ---------- 클릭 동작 ---------- */
  async function onClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.tagName === 'SELECT' || btn.tagName === 'INPUT') return;
    if (btn.tagName === 'A') e.preventDefault();
    const act = btn.dataset.act;
    const s = currentSection();
    const items = currentItems();
    switch (act) {
      case 'nav': state.section = btn.dataset.id; state.index = 0; state.filter = ''; state.blockKey = ''; render(); break;
      case 'select': state.index = +btn.dataset.i; render(); break;
      case 'add': items.splice(state.index + 1, 0, s.create()); state.index = Math.min(state.index + 1, items.length - 1); commit(true); render(); break;
      case 'dup': if (items[state.index]) { items.splice(state.index + 1, 0, clone(items[state.index])); state.index++; commit(true); render(); } break;
      case 'up': if (state.index > 0) { items.splice(state.index - 1, 0, items.splice(state.index, 1)[0]); state.index--; commit(true); render(); } break;
      case 'down': if (state.index < items.length - 1) { items.splice(state.index + 1, 0, items.splice(state.index, 1)[0]); state.index++; commit(true); render(); } break;
      case 'del':
        if (items[state.index] && confirm(`"${s.title(items[state.index])}" 항목을 삭제할까요?`)) { items.splice(state.index, 1); state.index = Math.max(0, state.index - 1); commit(true); render(); }
        break;
      case 'sub-add': {
        const t = currentTarget();
        const fdef = (s.fields || []).find(f => f.path === btn.dataset.path);
        const arr = getPath(t, btn.dataset.path) || [];
        arr.push(fdef && fdef.create ? fdef.create() : {});
        setPath(t, btn.dataset.path, arr); commit(true); render(); break;
      }
      case 'sub-del': { const t = currentTarget(); const arr = getPath(t, btn.dataset.path) || []; arr.splice(+btn.dataset.i, 1); commit(true); render(); break; }
      case 'sub-up': {
        const t = currentTarget(); const arr = getPath(t, btn.dataset.path) || []; const k = +btn.dataset.i;
        if (k > 0) { arr.splice(k - 1, 0, arr.splice(k, 1)[0]); commit(true); render(); }
        break;
      }
      case 'page-open': { const pg = currentItems()[state.index]; if (pg) { commit(true); close(); window.openCustomPage(pg.slug); } break; }
      case 'page-inline': { const pg = currentItems()[state.index]; if (pg) startInlinePage(state.index); break; }
      case 'block-hide': {
        const hb = draft.content.hiddenBlocks || (draft.content.hiddenBlocks = []);
        const key = btn.dataset.key; const k = hb.indexOf(key);
        if (k >= 0) hb.splice(k, 1); else hb.push(key);
        commit(true); render(); break;
      }
      case 'upload': pickAndUpload(btn.dataset.accept, path => {
        const input = document.getElementById(btn.dataset.for);
        input.value = path;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        render();
      }); break;
      case 'close': close(); break;
      case 'preview': close(); break;
      case 'publish': publish(); break;
      case 'discard':
        if (confirm('게시되지 않은 모든 변경사항을 버리고 현재 게시본으로 되돌릴까요?')) {
          draft = { content: clone(published()), baseUpdatedAt: published().updatedAt || '', savedAt: '' };
          commit(true); render(); toast('게시본으로 되돌렸습니다.');
        }
        break;
      case 'export': downloadText('content.js', buildContentJs(draft.content)); break;
      case 'import': importBackup(); break;
      case 'fetch-remote': fetchRemote(); break;
      case 'gh-save': saveGithubSettings(); break;
      case 'gh-test': testGithub(); break;
      case 'token-clear': setToken(''); toast('이 브라우저에서 토큰을 지웠습니다.'); render(); break;
      case 'media-upload': pickAndUpload('', () => loadMedia()); break;
      case 'media-refresh': loadMedia(); break;
      case 'media-copy': copyText(btn.dataset.path); break;
      case 'media-del': deleteMedia(btn.dataset.path, btn.dataset.sha); break;
      case 'block-edit': state.blockKey = btn.dataset.key; render(); setTimeout(() => $('#cmsBlockHtml') && $('#cmsBlockHtml').focus(), 30); break;
      case 'block-cancel': state.blockKey = ''; render(); break;
      case 'block-save': saveBlockHtml(); break;
      case 'block-reset':
        if (confirm('이 영역을 원래 문구로 되돌릴까요?')) { delete draft.content.blocks[btn.dataset.key]; commit(true); render(); }
        break;
      case 'block-inline': startInline(btn.dataset.key); break;
      default: break;
    }
  }

  /* ---------- 대시보드 ---------- */
  const VIEWS = {};
  VIEWS.dashboard = () => {
    const changed = changedKeys();
    const pub = published();
    const baseT = Date.parse(draft.baseUpdatedAt), pubT = Date.parse(pub.updatedAt);
    const deploying = baseT > pubT;                      // 방금 게시했지만 사이트 파일은 아직 이전 버전
    const stale = !deploying && changed.length && baseT < pubT;
    return `
      <div class="cms-cards3">
        <div class="cms-card cms-stat"><div class="cms-stat-label">현재 게시본</div><div class="cms-stat-value">${esc(fmtTime(pub.updatedAt))}</div></div>
        <div class="cms-card cms-stat"><div class="cms-stat-label">마지막 임시저장</div><div class="cms-stat-value">${esc(fmtTime(draft.savedAt))}</div></div>
        <div class="cms-card cms-stat"><div class="cms-stat-label">게시 안 된 변경</div><div class="cms-stat-value">${changed.length ? changed.map(k => esc(KEY_LABELS[k] || k)).join(', ') : '없음'}</div></div>
      </div>
      ${deploying ? `<div class="cms-warn"><i class="fas fa-hourglass-half"></i> ${esc(fmtTime(draft.baseUpdatedAt))}에 게시한 내용이 아직 사이트에 반영되는 중입니다. 1~2분 뒤 새로고침하세요. (그 전까지는 이전 게시본과 비교해 변경으로 표시될 수 있습니다)</div>` : ''}
      ${stale ? `<div class="cms-warn"><i class="fas fa-exclamation-triangle"></i> 이 임시저장본은 이전 게시본(${esc(fmtTime(draft.baseUpdatedAt))})을 바탕으로 만들어졌습니다. 그 사이 다른 곳에서 게시된 내용이 있으면 게시할 때 덮어쓰게 됩니다.</div>` : ''}
      <div class="cms-card">
        <h3>게시하기</h3>
        <p>편집한 내용은 이 브라우저에 자동으로 임시저장되고, <b>사이트에서 보기</b>를 누르면 게시 전 모습을 미리 볼 수 있습니다 (이 브라우저에서만 보임).
        <b>게시하기</b>를 누르면 GitHub 저장소의 <code>${CONTENT_PATH}</code>가 갱신되어 모든 방문자에게 반영됩니다. 사이트 반영까지 1~2분 걸릴 수 있습니다.</p>
        <div class="cms-actions">
          <button class="cms-btn primary" data-act="publish"><i class="fas fa-cloud-upload-alt"></i> 게시하기</button>
          <button class="cms-btn" data-act="preview"><i class="fas fa-eye"></i> 사이트에서 미리보기</button>
          <button class="cms-btn danger" data-act="discard"${changed.length ? '' : ' disabled'}><i class="fas fa-undo"></i> 변경 모두 취소</button>
        </div>
        ${getToken() ? '' : '<div class="cms-warn"><i class="fas fa-key"></i> 게시하려면 먼저 <a href="#" data-act="nav" data-id="github">게시 설정</a>에서 GitHub 토큰을 입력하세요. 토큰이 없어도 편집·미리보기·내보내기는 할 수 있습니다.</div>'}
      </div>
      <div class="cms-card">
        <h3>백업 · 복원</h3>
        <p><b>내보내기</b>로 받은 <code>content.js</code>는 백업용이며, 토큰 없이 게시하고 싶을 때 GitHub 웹에서 <code>${CONTENT_PATH}</code>에 직접 올려도 됩니다.</p>
        <div class="cms-actions">
          <button class="cms-btn" data-act="export"><i class="fas fa-download"></i> content.js 내보내기</button>
          <button class="cms-btn" data-act="import"><i class="fas fa-file-import"></i> 백업 파일 가져오기</button>
          <button class="cms-btn" data-act="fetch-remote"><i class="fas fa-sync"></i> GitHub 최신 게시본 불러오기</button>
        </div>
      </div>
      <div class="cms-card">
        <h3>무엇을 어디서 고치나요?</h3>
        <ul class="cms-guide-list">
          <li><b>메인 배너 · 공지사항 · 유학 주요자료 · 공식 사이트</b> — 홈 화면 목록</li>
          <li><b>아이콘 메뉴 · 오른쪽 위젯 버튼 · 전체메뉴 · 푸터 링크 · 관련기관</b> — 메뉴 이름·순서·링크 추가/삭제</li>
          <li><b>추가 페이지</b> — 새 페이지를 만들어 메뉴·배너에 연결 (예: 연간 준비 계획)</li>
          <li><b>대학정보 · 모집요강</b> — 대학 목록과 "招生简章 확인" 창 (접수 기간·HSK·신청비·학비 등)</li>
          <li><b>학과정보 · 전형정보 · 유학자료실</b> — 각 메뉴의 표와 카드 (자료실은 파일 업로드 가능)</li>
          <li><b>기본 설정</b> — 로고, 상담 전화, 푸터, 모집요강 기준 문구</li>
          <li><b>페이지 문구 · 위젯 내용</b> — 각 페이지 제목·본문, CSCA 안내, 입시가이드, 오른쪽 위젯 창의 탭별 내용 등 나머지 모든 글. 화면에서 바로 고치거나 숨길 수 있습니다.</li>
          <li><b>파일 업로드</b> — 이미지·PDF를 올리고 경로를 복사해 어디서든 사용</li>
        </ul>
      </div>`;
  };

  /* ---------- 페이지 문구 블록 ---------- */
  function blockRowsHtml() {
    const blocks = draft.content.blocks || (draft.content.blocks = {});
    const hidden = new Set(draft.content.hiddenBlocks || []);
    const f = state.filter.trim().toLowerCase();
    let lastGroup = '';
    const rows = $$('[data-cms-block]').map(el => {
      const key = el.dataset.cmsBlock;
      const label = el.dataset.cmsLabel || key;
      if (f && !(label + key).toLowerCase().includes(f)) return '';
      const [group, name] = label.includes(' · ') ? label.split(' · ') : ['기타', label];
      const head = group !== lastGroup ? `<div class="cms-block-group">${esc(group)}</div>` : '';
      lastGroup = group;
      const changed = Object.prototype.hasOwnProperty.call(blocks, key);
      const isHidden = hidden.has(key);
      return `${head}<div class="cms-block-row${state.blockKey === key ? ' active' : ''}${isHidden ? ' is-hidden' : ''}">
        <div class="cms-block-name">${esc(name)} ${changed ? '<span class="cms-badge">수정됨</span>' : ''}${isHidden ? '<span class="cms-badge gray">숨김</span>' : ''}</div>
        <div class="cms-block-acts">
          <button class="cms-btn sm primary" data-act="block-inline" data-key="${esc(key)}"><i class="fas fa-mouse-pointer"></i> 화면에서 편집</button>
          <button class="cms-btn sm" data-act="block-edit" data-key="${esc(key)}"><i class="fas fa-code"></i> HTML</button>
          <button class="cms-btn sm" data-act="block-hide" data-key="${esc(key)}" title="사이트에서 이 영역을 숨기거나 다시 보이기"><i class="fas ${isHidden ? 'fa-eye' : 'fa-eye-slash'}"></i> ${isHidden ? '보이기' : '숨기기'}</button>
          ${changed ? `<button class="cms-btn sm danger" data-act="block-reset" data-key="${esc(key)}"><i class="fas fa-undo"></i> 원래대로</button>` : ''}
        </div></div>`;
    }).join('');
    return rows || '<div class="cms-empty">찾는 영역이 없습니다.</div>';
  }
  VIEWS.blocks = () => {
    const blocks = draft.content.blocks || (draft.content.blocks = {});
    let editor = '';
    if (state.blockKey) {
      const key = state.blockKey;
      const html = Object.prototype.hasOwnProperty.call(blocks, key) ? blocks[key] : (BLOCK_DEFAULTS[key] || '');
      editor = `<div class="cms-card"><h3>HTML 편집 · ${esc(key)}</h3>
        <textarea class="cms-input cms-code" id="cmsBlockHtml" rows="18">${esc(html)}</textarea>
        <div class="cms-actions"><button class="cms-btn primary" data-act="block-save"><i class="fas fa-check"></i> 적용</button><button class="cms-btn" data-act="block-cancel">닫기</button></div></div>`;
    }
    return `<div class="cms-help">목록이 아닌 모든 글입니다 — 각 페이지 제목과 본문, CSCA 안내, 입시가이드, 오른쪽 위젯 창(CSCA·자격요건·초보자·HSK·서류준비 가이드)의 탭별 내용 등.
      <b>화면에서 편집</b>을 누르면 해당 화면이 열리고 점선 영역을 바로 고칠 수 있습니다 (굵게·링크·이미지 넣기). 복잡한 표는 <b>HTML</b>로 고치고, 필요 없는 영역은 <b>숨기기</b>로 지울 수 있습니다.</div>
      ${editor}<input class="cms-input cms-filter" data-act="filter" placeholder="영역 찾기 (예: HSK, 초보자, CSCA)" value="${esc(state.filter)}" style="margin-bottom:12px;">
      <div class="cms-card cms-block-list" id="cmsList">${blockRowsHtml()}</div>`;
  };
  /* 편집기가 남기는 흔적(빈 style, contenteditable)을 지워 비교·저장 */
  function normalizeHtml(html) {
    const t = document.createElement('template');
    t.innerHTML = html == null ? '' : html;
    // 브라우저가 편집 중 style 표기를 바꾸므로(margin:0 → margin: 0px) 같은 형식으로 맞춤
    t.content.querySelectorAll('[style]').forEach(e => { const css = e.style.cssText; if (css) e.setAttribute('style', css); else e.removeAttribute('style'); });
    t.content.querySelectorAll('[contenteditable]').forEach(e => e.removeAttribute('contenteditable'));
    return t.innerHTML;
  }
  function saveBlockHtml() {
    const key = state.blockKey;
    const html = normalizeHtml($('#cmsBlockHtml').value);
    if (html === normalizeHtml(BLOCK_DEFAULTS[key])) delete draft.content.blocks[key]; else draft.content.blocks[key] = html;
    commit(true);
    state.blockKey = '';
    render();
    toast('적용했습니다. 게시하기를 눌러야 방문자에게 보입니다.');
  }

  /* ---------- 화면 직접 편집 ---------- */
  let inlineMode = false;
  let savedRange = null;
  function buildInlineBar() {
    const bar = document.createElement('div');
    bar.className = 'cms-inline-bar';
    bar.id = 'cmsInlineBar';
    bar.innerHTML = `<b><i class="fas fa-pen"></i> 화면 직접 편집</b><span class="cms-inline-hint">점선 영역의 글을 클릭해 고치세요 · 다른 메뉴로 이동해도 됩니다</span>
      <button data-cmd="bold" title="굵게"><b>B</b></button><button data-cmd="italic" title="기울임"><i>I</i></button>
      <button data-cmd="link" title="링크"><i class="fas fa-link"></i></button><button data-cmd="image" title="이미지 넣기"><i class="fas fa-image"></i></button>
      <button data-cmd="removeFormat" title="서식 지우기"><i class="fas fa-eraser"></i></button>
      <button data-cmd="save" class="save"><i class="fas fa-check"></i> 저장</button><button data-cmd="cancel">취소</button>`;
    document.body.appendChild(bar);
    bar.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
    bar.addEventListener('click', e => { const b = e.target.closest('button'); if (b) inlineCommand(b.dataset.cmd); });
    document.addEventListener('selectionchange', () => {
      if (!inlineMode) return;
      const sel = window.getSelection();
      if (sel.rangeCount && sel.anchorNode && sel.anchorNode.parentElement && sel.anchorNode.parentElement.closest('[data-cms-block], #customBody[contenteditable]')) savedRange = sel.getRangeAt(0).cloneRange();
    });
    // 편집 중에는 블록 안의 링크·버튼이 동작하지 않도록 막음 (글자 선택만 가능)
    window.addEventListener('click', e => {
      if (inlineMode && !e.target.closest('#cmsInlineBar') && e.target.closest('[data-cms-block], #customBody[contenteditable]')) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  }
  function restoreRange() {
    if (!savedRange) return false;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
    return true;
  }
  function navigateToBlock(key) {
    const el = document.querySelector(`[data-cms-block="${CSS.escape(key)}"]`);
    if (!el) return null;
    const modal = el.closest('.guide-modal-overlay, .novice-modal-overlay, .docs-modal-overlay');
    if (modal) {
      const pane = el.closest('.w-pane');
      window.openWidget(modal.id, pane ? [...modal.querySelectorAll('.w-pane')].indexOf(pane) : 0);
    } else {
      const page = el.closest('.info-overlay, .job-overlay');
      if (page) openPage(page.id); else showHome();
    }
    setTimeout(() => el.scrollIntoView({ block: 'center' }), 80);
    return el;
  }
  let inlinePage = -1;          // 추가 페이지를 화면에서 편집 중이면 그 목록 번호
  function beginInline() {
    hideRoot();
    inlineMode = true;
    document.body.classList.add('cms-open', 'cms-inline');
    document.body.style.overflow = '';
    $('#cmsInlineBar').classList.add('show');
  }
  function startInline(key) {
    beginInline();
    inlinePage = -1;
    window.applyBlocks();
    $$('[data-cms-block]').forEach(el => el.setAttribute('contenteditable', 'true'));
    navigateToBlock(key);
  }
  function startInlinePage(index) {
    const pg = (draft.content.pages || [])[index];
    if (!pg || !pg.slug) { toast('페이지 주소를 먼저 입력하세요.', 'error'); return; }
    commit(true);
    window.openCustomPage(pg.slug);
    if (!document.getElementById('customOverlay').classList.contains('open')) { toast('페이지를 열 수 없습니다. "공개"를 켜고 주소를 확인하세요.', 'error'); return; }
    beginInline();
    inlinePage = index;
    const body = document.getElementById('customBody');
    body.setAttribute('contenteditable', 'true');
    body.focus();
  }
  function finishInline(save) {
    let n = 0;
    if (inlinePage >= 0) {
      const body = document.getElementById('customBody');
      body.removeAttribute('contenteditable');
      const pg = (draft.content.pages || [])[inlinePage];
      if (save && pg) {
        const html = normalizeHtml(body.innerHTML);
        if (html !== normalizeHtml(pg.html)) { pg.html = html; n = 1; }
      }
    } else {
      const blocks = draft.content.blocks || (draft.content.blocks = {});
      $$('[data-cms-block]').forEach(el => {
        el.removeAttribute('contenteditable');
        if (!save) return;
        const key = el.dataset.cmsBlock;
        const html = normalizeHtml(el.innerHTML);
        const before = normalizeHtml(Object.prototype.hasOwnProperty.call(blocks, key) ? blocks[key] : BLOCK_DEFAULTS[key]);
        if (html === before) return;
        n++;
        if (html === normalizeHtml(BLOCK_DEFAULTS[key])) delete blocks[key]; else blocks[key] = html;
      });
    }
    const wasPage = inlinePage >= 0;
    inlineMode = false;
    inlinePage = -1;
    savedRange = null;
    $('#cmsInlineBar').classList.remove('show');
    document.body.classList.remove('cms-inline');
    if (save) commit(true); else window.setSiteContent(draft.content);
    ['guideModalOverlay', 'noviceModalOverlay', 'docsModalOverlay', 'hskModalOverlay', 'cscaModalOverlay'].forEach(id => window.closeWidget(id));
    state.section = wasPage ? 'pages' : 'blocks';
    open();
    if (save) toast(n ? `${n}개 영역을 저장했습니다. 게시하기를 눌러야 방문자에게 보입니다.` : '바뀐 내용이 없습니다.');
  }
  function inlineCommand(cmd) {
    if (cmd === 'save') return finishInline(true);
    if (cmd === 'cancel') return finishInline(false);
    restoreRange();
    if (cmd === 'link') {
      const sel = window.getSelection();
      const text = sel.toString() || '링크';
      const url = prompt('링크 주소를 입력하세요.\n예) https://www.csca.cn  ·  page:cscaOverlay  ·  univ:北京大学', 'https://');
      if (!url) return;
      restoreRange();
      const internal = /^(page|modal|univ|home):/.test(url);
      const html = internal
        ? `<a href="#" data-link="${esc(url)}">${esc(text)}</a>`
        : `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}</a>`;
      document.execCommand('insertHTML', false, html);
      return;
    }
    if (cmd === 'image') {
      const insert = src => { restoreRange(); document.execCommand('insertHTML', false, `<img src="${esc(src)}" alt="" style="max-width:100%;border-radius:8px;">`); };
      if (getToken() && confirm('이미지 파일을 업로드할까요?\n[확인] 파일 업로드 · [취소] 이미지 주소 직접 입력')) {
        pickAndUpload('image/*', insert);
      } else {
        const url = prompt('이미지 주소(URL 또는 uploads/… 경로)를 입력하세요.', 'https://');
        if (url) insert(url);
      }
      return;
    }
    document.execCommand(cmd, false, null);
  }

  /* ---------- GitHub API ---------- */
  function b64FromBytes(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  const b64FromText = text => b64FromBytes(new TextEncoder().encode(text));
  const textFromB64 = b64 => new TextDecoder().decode(Uint8Array.from(atob(String(b64).replace(/\s/g, '')), c => c.charCodeAt(0)));
  function contentsUrl(path) {
    const cfg = getCfg();
    return `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  }
  async function gh(path, opts) {
    const token = getToken();
    if (!token) throw new Error('GitHub 토큰이 없습니다. 게시 설정에서 입력하세요.');
    const o = opts || {};
    const res = await fetch('https://api.github.com' + path, {
      method: o.method || 'GET',
      headers: Object.assign({ Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28' },
        o.body ? { 'Content-Type': 'application/json' } : {}),
      body: o.body ? JSON.stringify(o.body) : undefined,
      cache: 'no-store',
    });
    if (!res.ok) {
      let msg = '';
      try { msg = (await res.json()).message || ''; } catch (e) { /* 본문 없음 */ }
      const err = new Error(`GitHub ${res.status}${msg ? ' — ' + msg : ''}`);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }
  async function getRemoteFile(path) {
    try { return await gh(contentsUrl(path) + '?ref=' + encodeURIComponent(getCfg().branch)); } catch (e) { if (e.status === 404) return null; throw e; }
  }
  function putFile(path, base64, message, sha) {
    const body = { message, content: base64, branch: getCfg().branch };
    if (sha) body.sha = sha;
    return gh(contentsUrl(path), { method: 'PUT', body });
  }

  function buildContentJs(content) {
    return "/* 사이트 콘텐츠 데이터 — '메뉴편집'(CMS)에서 편집·게시하면 이 파일이 갱신됩니다. 직접 수정 시 JSON 형식을 유지하세요. */\n"
      + 'window.SITE_CONTENT = ' + JSON.stringify(content, null, 1) + ';\n';
  }
  function parseContentJs(text) {
    const json = String(text).trim().replace(/^[\s\S]*?window\.SITE_CONTENT\s*=\s*/, '').replace(/;\s*$/, '');
    const c = JSON.parse(json);
    if (!c || typeof c !== 'object' || !Array.isArray(c.univs) || !c.settings) throw new Error('사이트 콘텐츠 형식이 아닙니다.');
    return c;
  }
  function validate(content) {
    const problems = [];
    const cns = new Set();
    (content.univs || []).forEach(u => {
      if (!u.cn) problems.push(`대학 "${u.ko}"의 中文 이름이 비어 있습니다.`);
      else if (cns.has(u.cn)) problems.push(`대학 中文 이름 "${u.cn}"이(가) 중복됩니다.`);
      cns.add(u.cn);
    });
    (content.admissions || []).forEach(a => { if (!cns.has(a.univ)) problems.push(`전형정보 "${a.univ || '(대학 미선택)'} · ${a.course}"의 대학을 찾을 수 없습니다.`); });
    (content.depts || []).forEach(d => { if (!cns.has(d.univ)) problems.push(`학과정보 "${d.ko}"의 대학을 찾을 수 없습니다.`); });
    const slugs = new Set();
    (content.pages || []).forEach(pg => {
      if (!/^[a-z0-9-]+$/.test(pg.slug || '')) problems.push(`추가 페이지 "${pg.title}"의 주소는 영문 소문자·숫자·하이픈만 쓸 수 있습니다.`);
      else if (slugs.has(pg.slug)) problems.push(`추가 페이지 주소 "${pg.slug}"가 중복됩니다.`);
      slugs.add(pg.slug);
    });
    return problems;
  }

  let publishing = false;
  async function publish() {
    if (publishing) return;
    if (!getToken()) { toast('게시 설정에서 GitHub 토큰을 먼저 입력하세요.', 'error'); state.section = 'github'; render(); return; }
    if (!isDirty() && !confirm('게시본과 달라진 내용이 없습니다. 그래도 다시 게시할까요?')) return;
    const problems = validate(draft.content);
    if (problems.length && !confirm('확인이 필요한 항목이 있습니다:\n\n- ' + problems.slice(0, 8).join('\n- ') + '\n\n그래도 게시할까요?')) return;
    const cfg = getCfg();
    if (!confirm(`${cfg.owner}/${cfg.repo} (${cfg.branch}) 저장소에 게시합니다. 모든 방문자에게 반영됩니다. 계속할까요?`)) return;
    publishing = true;
    toast('게시 중…');
    try {
      const remote = await getRemoteFile(CONTENT_PATH);
      if (remote && remote.content) {
        const m = textFromB64(remote.content).match(/"updatedAt":\s*"([^"]*)"/);
        const remoteAt = m ? m[1] : '';
        if (remoteAt && draft.baseUpdatedAt && remoteAt !== draft.baseUpdatedAt
          && !confirm(`저장소에 더 최근에 게시된 내용이 있습니다 (${fmtTime(remoteAt)}).\n지금 게시하면 그 내용을 덮어씁니다. 계속할까요?\n(취소 후 대시보드의 "GitHub 최신 게시본 불러오기"로 확인할 수 있습니다.)`)) {
          publishing = false; toast('게시를 취소했습니다.'); return;
        }
      }
      const content = clone(draft.content);
      content.updatedAt = new Date().toISOString();
      const res = await putFile(CONTENT_PATH, b64FromText(buildContentJs(content)), `CMS: 사이트 콘텐츠 게시 (${fmtTime(content.updatedAt)})`, remote && remote.sha);
      window.SITE_CONTENT = content;
      draft = { content: clone(content), baseUpdatedAt: content.updatedAt, savedAt: new Date().toISOString() };
      commit(true);
      render();
      toast('게시했습니다. 1~2분 뒤 사이트에 반영됩니다.' + (res && res.commit ? ' (커밋 ' + res.commit.sha.slice(0, 7) + ')' : ''), 'ok');
    } catch (e) {
      toast('게시하지 못했습니다: ' + e.message, 'error');
    } finally {
      publishing = false;
    }
  }
  async function fetchRemote() {
    try {
      const remote = await getRemoteFile(CONTENT_PATH);
      if (!remote) { toast('저장소에 ' + CONTENT_PATH + ' 파일이 없습니다.', 'error'); return; }
      const content = parseContentJs(textFromB64(remote.content));
      if (isDirty() && !confirm('게시되지 않은 변경사항이 있습니다. 버리고 GitHub 최신 게시본으로 바꿀까요?')) return;
      window.SITE_CONTENT = content;
      draft = { content: clone(content), baseUpdatedAt: content.updatedAt || '', savedAt: '' };
      commit(true); render();
      toast('GitHub 최신 게시본(' + fmtTime(content.updatedAt) + ')을 불러왔습니다.', 'ok');
    } catch (e) { toast('불러오지 못했습니다: ' + e.message, 'error'); }
  }

  /* ---------- 파일 업로드 ---------- */
  function safeFileName(name) {
    const n = String(name || 'file').normalize('NFC');
    const dot = n.lastIndexOf('.');
    const base = (dot > 0 ? n.slice(0, dot) : n).replace(/[^\w가-힣一-鿿-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'file';
    const ext = dot > 0 ? n.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    const d = new Date(), p = x => String(x).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${base}${ext ? '.' + ext : ''}`;
  }
  function pickAndUpload(accept, done) {
    if (!getToken()) { toast('파일을 올리려면 게시 설정에서 GitHub 토큰을 먼저 입력하세요. (외부 주소는 칸에 직접 붙여넣을 수 있습니다)', 'error'); return; }
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      if (file.size > MAX_UPLOAD) { toast('20MB 이하 파일만 올릴 수 있습니다.', 'error'); return; }
      toast('업로드 중… ' + file.name);
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const path = `${UPLOAD_DIR}/${safeFileName(file.name)}`;
        await putFile(path, b64FromBytes(bytes), `CMS: 파일 업로드 ${file.name}`);
        toast('업로드했습니다: ' + path + ' (사이트 반영까지 1~2분)', 'ok');
        done(path);
      } catch (e) { toast('업로드하지 못했습니다: ' + e.message, 'error'); }
    };
    input.click();
  }

  VIEWS.media = () => `<div class="cms-help">이미지·PDF 등을 저장소의 <code>${UPLOAD_DIR}/</code> 폴더에 올립니다. 올린 뒤 <b>경로 복사</b>로 배너 이미지, 자료실 첨부파일, 페이지 문구의 이미지 등에 쓰세요.
      방금 올린 파일은 사이트 반영(1~2분) 전까지 미리보기가 보이지 않을 수 있습니다.</div>
    <div class="cms-actions"><button class="cms-btn primary" data-act="media-upload"><i class="fas fa-upload"></i> 파일 올리기</button>
      <button class="cms-btn" data-act="media-refresh"><i class="fas fa-sync"></i> 새로고침</button></div>
    <div class="cms-card" id="cmsMediaList"><div class="cms-empty">불러오는 중…</div></div>`;
  async function loadMedia() {
    const box = $('#cmsMediaList');
    if (!box) return;
    if (!getToken()) { box.innerHTML = '<div class="cms-empty">GitHub 토큰을 입력하면 업로드한 파일 목록을 볼 수 있습니다.</div>'; return; }
    try {
      const list = (await getRemoteFile(UPLOAD_DIR)) || [];
      const files = (Array.isArray(list) ? list : []).filter(f => f.type === 'file').sort((a, b) => b.name.localeCompare(a.name));
      box.innerHTML = files.length ? files.map(f => {
        const img = /\.(png|jpe?g|gif|webp|svg)$/i.test(f.name);
        return `<div class="cms-media-row">
          <div class="cms-media-prev">${img ? `<img src="${esc(f.path)}" alt="" onerror="this.replaceWith(document.createTextNode('🖼'))">` : '<i class="fas fa-file"></i>'}</div>
          <div class="cms-media-name"><b>${esc(f.name)}</b><br><code>${esc(f.path)}</code> · ${(f.size / 1024).toFixed(0)}KB</div>
          <button class="cms-btn sm" data-act="media-copy" data-path="${esc(f.path)}"><i class="fas fa-copy"></i> 경로 복사</button>
          <button class="cms-btn sm danger" data-act="media-del" data-path="${esc(f.path)}" data-sha="${esc(f.sha)}"><i class="fas fa-trash"></i></button></div>`;
      }).join('') : '<div class="cms-empty">아직 올린 파일이 없습니다.</div>';
    } catch (e) { box.innerHTML = `<div class="cms-empty">목록을 불러오지 못했습니다: ${esc(e.message)}</div>`; }
  }
  async function deleteMedia(path, sha) {
    if (!confirm(`${path} 파일을 저장소에서 삭제할까요? 이 파일을 쓰는 곳이 있으면 깨져 보입니다.`)) return;
    try {
      await gh(contentsUrl(path), { method: 'DELETE', body: { message: `CMS: 파일 삭제 ${path}`, sha, branch: getCfg().branch } });
      toast('삭제했습니다.', 'ok');
      loadMedia();
    } catch (e) { toast('삭제하지 못했습니다: ' + e.message, 'error'); }
  }
  function copyText(text) {
    const fallback = () => prompt('아래 경로를 복사하세요.', text);
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast('복사했습니다: ' + text), fallback);
    else fallback();
  }

  /* ---------- 게시 설정 ---------- */
  VIEWS.github = () => {
    const cfg = getCfg();
    return `<div class="cms-card">
        <h3>GitHub 저장소</h3>
        <div class="cms-grid3">
          <div class="cms-field"><label class="cms-label">소유자 (owner)</label><input class="cms-input" data-act="gh" id="ghOwner" value="${esc(cfg.owner)}"></div>
          <div class="cms-field"><label class="cms-label">저장소 (repo)</label><input class="cms-input" data-act="gh" id="ghRepo" value="${esc(cfg.repo)}"></div>
          <div class="cms-field"><label class="cms-label">브랜치</label><input class="cms-input" data-act="gh" id="ghBranch" value="${esc(cfg.branch)}"></div>
        </div>
        <div class="cms-field"><label class="cms-label">개인 액세스 토큰 (Personal access token)<span class="cms-hint">${getToken() ? '입력됨 — 바꿀 때만 새로 입력' : '아직 없음'}</span></label>
          <input class="cms-input" data-act="gh" id="ghToken" type="password" autocomplete="off" placeholder="github_pat_…"></div>
        <label class="cms-check"><input type="checkbox" data-act="gh" id="ghRemember"${tokenRemembered() ? ' checked' : ''}> 이 브라우저에 토큰 기억하기 (체크하지 않으면 창을 닫을 때 지워짐)</label>
        <div class="cms-actions">
          <button class="cms-btn primary" data-act="gh-save"><i class="fas fa-save"></i> 저장</button>
          <button class="cms-btn" data-act="gh-test"><i class="fas fa-plug"></i> 연결 테스트</button>
          <button class="cms-btn danger" data-act="token-clear"><i class="fas fa-trash"></i> 토큰 지우기</button>
        </div>
      </div>
      <div class="cms-card">
        <h3>토큰 만드는 방법 (처음 한 번)</h3>
        <ol class="cms-guide-list">
          <li>GitHub 로그인 → 오른쪽 위 프로필 → <b>Settings</b> → <b>Developer settings</b> → <b>Personal access tokens</b> → <b>Fine-grained tokens</b> → <b>Generate new token</b></li>
          <li><b>Repository access</b>: Only select repositories → <b>${esc(cfg.repo)}</b> 하나만 선택</li>
          <li><b>Permissions → Repository permissions → Contents</b>: <b>Read and write</b> (다른 권한은 필요 없음)</li>
          <li>만료 기간을 정하고 생성한 뒤, 표시된 토큰을 위 칸에 붙여넣고 저장</li>
        </ol>
        <div class="cms-warn"><i class="fas fa-shield-alt"></i> 토큰은 이 브라우저에만 저장되고 GitHub API로만 전송됩니다. 다른 사람과 공유하지 말고, 공용 PC에서는 "기억하기"를 끄세요.
        이 편집 화면은 누구나 열 수 있지만 토큰이 없으면 게시·업로드는 할 수 없습니다.</div>
      </div>`;
  };
  function saveGithubSettings() {
    const cfg = { owner: $('#ghOwner').value.trim(), repo: $('#ghRepo').value.trim(), branch: $('#ghBranch').value.trim() || 'main' };
    if (!cfg.owner || !cfg.repo) { toast('소유자와 저장소를 입력하세요.', 'error'); return; }
    store.set(CFG_KEY, JSON.stringify(cfg));
    const token = $('#ghToken').value.trim();
    const remember = $('#ghRemember').checked;
    if (token) setToken(token, remember);
    else if (getToken()) setToken(getToken(), remember);
    toast('저장했습니다.', 'ok');
    render();
  }
  async function testGithub() {
    try {
      const cfg = getCfg();
      const repo = await gh(`/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`);
      const canWrite = repo.permissions ? repo.permissions.push : null;
      toast(`연결 성공: ${repo.full_name}` + (canWrite === false ? ' — 쓰기 권한이 없습니다 (Contents: Read and write 필요)' : ''), canWrite === false ? 'error' : 'ok');
    } catch (e) { toast('연결 실패: ' + e.message, 'error'); }
  }

  /* ---------- 내보내기 · 가져오기 ---------- */
  function downloadText(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/javascript;charset=utf-8' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function importBackup() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.js,.json,application/json,text/javascript';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const content = parseContentJs(await file.text());
        if (!confirm('백업 파일의 내용으로 현재 임시저장본을 바꿀까요? (게시는 따로 해야 합니다)')) return;
        draft.content = content;
        commit(true); render();
        toast('가져왔습니다. 확인 후 게시하세요.', 'ok');
      } catch (e) { toast('가져오지 못했습니다: ' + e.message, 'error'); }
    };
    input.click();
  }

  /* ---------- 열기 · 닫기 ---------- */
  function hideRoot() {
    if (root) root.classList.remove('open');
  }
  function open() {
    if (inlineMode) { toast('화면 편집을 먼저 저장하거나 취소하세요.'); return; }
    if (!root) build();
    draft = draft || loadDraft();
    document.body.classList.add('cms-open');
    document.body.style.overflow = 'hidden';
    root.classList.add('open');
    render();
  }
  function close() {
    hideRoot();
    document.body.classList.remove('cms-open');
    document.body.style.overflow = '';
    store.set(PREVIEW_KEY, isDirty() ? '1' : '0');
    window.setSiteContent(isDirty() ? draft.content : published());
    if (isDirty()) window.scrollTo({ top: 0 });
  }

  window.CMS = { open, close, publish };
})();
