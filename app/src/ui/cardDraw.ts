// SNS 공유 카드: 결과를 문구로 정리하고(buildCardText) 캔버스에 그린다(drawCard).
import type { LuckChoice } from '../engine/decompose';
import type { Person, ScenarioResult, Story } from '../engine/types';
import { economyMoments, eventText } from './Story';
import { pct, won } from './format';

export type CardInput = {
  person: Person;
  results: ScenarioResult[];
  activeId: string;
  decomposition: LuckChoice;
  /** 연봉·모은 돈을 카드에 넣을지 (기본은 숨김) */
  showMoney: boolean;
  /** 카드 바닥에 적을 사이트 주소 (없으면 그리지 않음) */
  site?: string;
};

export type CardText = {
  title: string;
  profile: string;
  kicker: string;
  big: string;
  range: string;
  dots: number[];
  lives: { label: string; value: string; lines: string[]; tone: 'bad' | 'mid' | 'good' }[];
  compare: { label: string; value: string; on: boolean }[];
  luck: string;
  footer: string;
  site: string;
};

const LABELS = ['운이 나빴던 나', '보통의 나', '운이 좋았던 나'];
const TONES = ['bad', 'mid', 'good'] as const;
const last = (xs: number[]) => xs[xs.length - 1];

/** 한 사람의 인생에서 카드에 쓸 사건 두 개를 고른다: 나쁜 나는 위기·실직, 좋은 나는 호황, 보통은 가족 사건 우선 */
function highlights(s: Story, startAge: number, tone: (typeof TONES)[number]): string[] {
  let births = 0;
  const life = s.events.map((e) => ({ age: e.age, text: eventText(e, e.kind === 'birth' ? births++ : 0)!, kind: e.kind as string }));
  const econ = economyMoments(s, startAge);
  const all = [...life, ...econ].sort((a, b) => a.age - b.age);
  const rank = (k: string) =>
    tone === 'bad'
      ? ['crisis', 'jobLoss', 'startupClose', 'careerBreak', 'spouseCareerBreak'].indexOf(k)
      : tone === 'good'
        ? ['boom', 'marriage', 'birth'].indexOf(k)
        : ['marriage', 'birth', 'jobLoss', 'crisis', 'boom'].indexOf(k);
  const picked = all
    .filter((x) => rank(x.kind) >= 0)
    .sort((a, b) => rank(a.kind) - rank(b.kind) || a.age - b.age)
    .slice(0, 2)
    .sort((a, b) => a.age - b.age);
  // 카드에는 짧게: 괄호 앞까지만
  return picked.length
    ? picked.map((x) => {
        const short = x.text
          .split(' — ')[0]
          .replace(/^(\d{4})년 같은 경제 위기.*$/, '$1년형 위기')
          .replace(/^(\d{4})년 같은 호황.*$/, '$1년형 호황');
        return `${x.age}세 ${short}`;
      })
    : ['큰 사건 없이 조용히'];
}

export function buildCardText({ person, results, activeId, decomposition, showMoney, site = '' }: CardInput): CardText {
  const active = results.find((r) => r.scenario.id === activeId) ?? results[0];
  const years = active.years.length - 1;
  const endAge = person.age + years;
  const end = active.netWorth[years];
  const parts = [`${person.age}세`, person.sex === 'M' ? '남' : '여', person.married ? '기혼' : '미혼'];
  if (showMoney) parts.push(`연봉 ${won(person.income)}`, `모은 돈 ${won(person.netWorth)}`);
  return {
    title: '내 인생, 1,000번 살아보기',
    profile: `${parts.join(' · ')} · '${active.scenario.label}'을 고른 나`,
    kicker: `${years}년 뒤 ${endAge}세의 나는 보통`,
    big: won(end.p50),
    range: `100번 중 80번은 ${won(end.p10)} ~ ${won(end.p90)}`,
    dots: active.hundred ?? [],
    lives: (active.stories ?? []).map((s, k) => ({
      label: LABELS[k],
      value: won(last(s.netWorth)),
      lines: highlights(s, person.age, TONES[k]),
      tone: TONES[k],
    })),
    compare: results.map((r) => ({ label: r.scenario.label, value: won(r.netWorth[years].p50), on: r.scenario.id === active.scenario.id })),
    luck: `결과를 가른 건  운 ${pct(decomposition.luckShare)} · 선택 ${pct(decomposition.choiceShare)}`,
    footer: '실제 한국 통계로 1,000번 돌린 참고용 시뮬레이션 · 금액은 오늘 물가 기준',
    site,
  };
}

// ── 그리기 ──
const C = {
  bg: '#f6f5f1',
  panel: '#ffffff',
  ink: '#1d1d1b',
  mute: '#6b6a64',
  line: '#e3e1da',
  accent: '#2f6fdf',
  bad: '#d0573f',
  good: '#2a9d6f',
  base: '#c9c7bf',
};
const FONT = "'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif";

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, weight = 400, align: CanvasTextAlign = 'left') {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y);
}

/** 폭을 넘으면 말줄임 */
function fit(ctx: CanvasRenderingContext2D, s: string, maxW: number) {
  if (ctx.measureText(s).width <= maxW) return s;
  let t = s;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

function dots(ctx: CanvasRenderingContext2D, values: number[], x: number, y: number, w: number, h: number) {
  if (!values.length) return;
  const BINS = 26;
  const lo = values[0];
  const hi = values[values.length - 1];
  const binW = w / BINS;
  const counts = new Array(BINS).fill(0);
  const pts = values.map((v, k) => {
    const b = Math.min(BINS - 1, Math.floor(((v - lo) / (hi - lo || 1)) * BINS));
    return { b, row: counts[b]++, k };
  });
  const r = Math.min(binW / 2 - 2, (h / Math.max(...counts)) / 2 - 1, 11);
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(x + p.b * binW + binW / 2, y + h - r - p.row * (2 * r + 2), r, 0, Math.PI * 2);
    ctx.fillStyle = p.k < 10 ? C.bad : p.k >= 90 ? C.good : p.k === 50 ? C.accent : C.base;
    ctx.fill();
  }
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y + h + 8);
  ctx.lineTo(x + w, y + h + 8);
  ctx.stroke();
  text(ctx, won(lo), x, y + h + 40, 26, C.mute);
  text(ctx, won(hi), x + w, y + h + 40, 26, C.mute, 400, 'right');
}

export function drawCard(canvas: HTMLCanvasElement, t: CardText, size: 'portrait' | 'square') {
  const W = 1080;
  const H = size === 'portrait' ? 1350 : 1080;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const P = 64; // 바깥 여백
  const square = size === 'square';

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // 머리
  text(ctx, t.title, P, 104, 40, C.accent, 800);
  ctx.font = `400 28px ${FONT}`;
  text(ctx, fit(ctx, t.profile, W - 2 * P), P, 152, 28, C.mute);

  // 큰 숫자
  let y = square ? 236 : 262;
  text(ctx, t.kicker, W / 2, y, 36, C.ink, 500, 'center');
  text(ctx, t.big, W / 2, y + (square ? 112 : 138), square ? 120 : 150, C.accent, 800, 'center');
  text(ctx, t.range, W / 2, y + (square ? 168 : 206), 34, C.ink, 600, 'center');

  // 100명의 나
  y += square ? 196 : 250;
  const dotsH = square ? 130 : 190;
  text(ctx, '100명의 나', P, y + 6, 28, C.mute, 700);
  dots(ctx, t.dots, P, y + 22, W - 2 * P, dotsH);
  y += dotsH + (square ? 76 : 96);

  // 세 명의 나
  const gap = 18;
  const cw = (W - 2 * P - 2 * gap) / 3;
  const ch = square ? 180 : 236;
  t.lives.forEach((l, k) => {
    const x = P + k * (cw + gap);
    const color = l.tone === 'bad' ? C.bad : l.tone === 'good' ? C.good : C.accent;
    roundRect(ctx, x, y, cw, ch, 20);
    ctx.fillStyle = C.panel;
    ctx.fill();
    ctx.fillStyle = color;
    roundRect(ctx, x, y, cw, 10, 5);
    ctx.fill();
    text(ctx, l.label, x + 22, y + 52, 26, C.mute, 700);
    text(ctx, l.value, x + 22, y + 102, 44, C.ink, 800);
    ctx.font = `400 23px ${FONT}`;
    l.lines.slice(0, square ? 2 : 3).forEach((line, j) => {
      text(ctx, fit(ctx, line, cw - 44), x + 22, y + 146 + j * 34, 23, C.mute);
    });
  });
  y += ch + (square ? 30 : 46);

  // 세 갈래 비교
  const bw = (W - 2 * P - 2 * gap) / 3;
  t.compare.forEach((c, k) => {
    const x = P + k * (bw + gap);
    roundRect(ctx, x, y, bw, square ? 76 : 84, 16);
    ctx.fillStyle = c.on ? C.accent : C.panel;
    ctx.fill();
    text(ctx, c.label, x + bw / 2, y + 34, 24, c.on ? '#ffffffcc' : C.mute, 600, 'center');
    text(ctx, c.value, x + bw / 2, y + (square ? 64 : 70), 32, c.on ? '#ffffff' : C.ink, 800, 'center');
  });
  y += square ? 76 + 34 : 84 + 64;

  // 운 · 선택
  text(ctx, t.luck, W / 2, y, 32, C.ink, 700, 'center');

  // 바닥: 안내 문구, 그 아래 사이트 주소 (나도 해 보기)
  if (t.site) {
    text(ctx, t.footer, W / 2, H - 82, 22, C.mute, 400, 'center');
    text(ctx, `나도 해 보기 → ${t.site}`, W / 2, H - 36, 30, C.accent, 800, 'center');
  } else {
    text(ctx, t.footer, W / 2, H - 46, 22, C.mute, 400, 'center');
  }
}
