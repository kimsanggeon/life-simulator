import { useEffect, useMemo, useRef, useState } from 'react';
import { buildCardText, drawCard, type CardInput } from './cardDraw';
import { siteHost, siteUrl } from '../site';

type Props = Omit<CardInput, 'showMoney' | 'site'>;

export function ShareCard(props: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<'portrait' | 'square'>('portrait');
  const [showMoney, setShowMoney] = useState(false);
  const [msg, setMsg] = useState('');
  const t = useMemo(() => buildCardText({ ...props, showMoney, site: siteHost() }), [props, showMoney]);

  useEffect(() => {
    if (!canvas.current) return;
    // 웹폰트가 늦게 오면 한 번 더 그린다
    drawCard(canvas.current, t, size);
    document.fonts?.ready.then(() => canvas.current && drawCard(canvas.current, t, size));
  }, [t, size]);

  const blob = () => new Promise<Blob | null>((res) => canvas.current?.toBlob(res, 'image/png'));
  const fileName = `인생시뮬레이터_${props.person.age + props.results[0].years.length - 1}세.png`;

  async function save() {
    const b = await blob();
    if (!b) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setMsg('이미지를 저장했어요.');
  }

  async function share() {
    const b = await blob();
    if (!b) return;
    const file = new File([b], fileName, { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        const url = siteUrl();
        await navigator.share({ files: [file], title: '내 인생, 1,000번 살아보기', text: `${t.kicker} ${t.big}${url ? `
나도 해 보기 ${url}` : ''}` });
        setMsg('');
      } else {
        await save();
        setMsg('이 기기에서는 바로 공유가 안 돼서 이미지로 저장했어요. 저장된 이미지를 올려 주세요.');
      }
    } catch {
      // 사용자가 공유 창을 닫은 경우
    }
  }

  const canShareFiles = typeof navigator !== 'undefined' && 'share' in navigator;

  return (
    <div className="sharecard">
      <h3>결과를 친구와 나누기</h3>
      <p className="hint">아래 카드가 그대로 이미지가 됩니다. 연봉과 모은 돈은 기본으로 카드에 넣지 않아요.</p>
      <div className="sc-body">
        <canvas ref={canvas} className={`sc-preview ${size}`} aria-label="공유 카드 미리보기" />
        <div className="sc-controls">
          <div className="field">
            <span>크기</span>
            <div className="seg small">
              <button className={size === 'portrait' ? 'on' : ''} onClick={() => setSize('portrait')}>
                세로 (피드)
              </button>
              <button className={size === 'square' ? 'on' : ''} onClick={() => setSize('square')}>
                정사각
              </button>
            </div>
          </div>
          <label className="field toggle">
            <span>내 연봉·모은 돈도 넣기</span>
            <input type="checkbox" checked={showMoney} onChange={(e) => setShowMoney(e.target.checked)} />
          </label>
          <div className="sc-buttons">
            {canShareFiles && (
              <button className="primary" onClick={share}>
                공유하기
              </button>
            )}
            <button className={canShareFiles ? 'ghost' : 'primary'} onClick={save}>
              이미지 저장
            </button>
          </div>
          {msg && <p className="hint">{msg}</p>}
        </div>
      </div>
    </div>
  );
}
