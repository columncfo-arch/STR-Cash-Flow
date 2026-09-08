import { ImageResponse } from 'next/og';

export const alt = 'HostCFO — Your Short-Term Rental CFO';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundImage: 'linear-gradient(135deg, #0f172a 0%, #064e3b 100%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 40 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              backgroundColor: '#059669',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 36,
              fontWeight: 700,
              color: '#ffffff',
            }}
          >
            H
          </div>
          <div style={{ fontSize: 40, fontWeight: 700, color: '#ffffff' }}>HostCFO</div>
        </div>
        <div
          style={{
            fontSize: 56,
            fontWeight: 800,
            color: '#ffffff',
            textAlign: 'center',
            maxWidth: 900,
            lineHeight: 1.15,
          }}
        >
          Your Short-Term Rental CFO
        </div>
        <div style={{ fontSize: 28, color: '#a7f3d0', marginTop: 24, textAlign: 'center', maxWidth: 800 }}>
          Increase revenue. Cut costs. Generate yield.
        </div>
      </div>
    ),
    { ...size }
  );
}
