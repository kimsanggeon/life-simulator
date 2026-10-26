import { describe, expect, it } from 'vitest';
import { displayHost, siteHost } from './site';

describe('사이트 주소', () => {
  it('환경 변수가 있으면 그것을 쓴다 (https·www·끝 슬래시 제거)', () => {
    expect(siteHost('https://www.my-life-sim.kr/', 'life-simulator.vercel.app', 'life-simulator.vercel.app')).toBe('my-life-sim.kr');
  });
  it('없으면 지금 열린 주소를 쓴다', () => {
    expect(siteHost('', 'life-simulator.vercel.app', 'life-simulator.vercel.app')).toBe('life-simulator.vercel.app');
  });
  it('내 컴퓨터에서는 빈 문자열', () => {
    expect(siteHost(undefined, 'localhost', 'localhost:5173')).toBe('');
    expect(siteHost(undefined, '127.0.0.1', '127.0.0.1:4173')).toBe('');
  });
  it('displayHost', () => {
    expect(displayHost('http://example.com')).toBe('example.com');
  });
});
