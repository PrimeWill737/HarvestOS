'use client';
import { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import styles from './FarmMap.module.scss';
export default function FarmMap({
  farms,
}: {
  farms: { id: string; name: string; latitude?: number; longitude?: number }[];
}) {
  const root = useRef<HTMLDivElement>(null),
    [error, setError] = useState('');
  const style = process.env.NEXT_PUBLIC_MAP_STYLE_URL;
  useEffect(() => {
    if (!style || !root.current) return;
    let map: import('maplibre-gl').Map | undefined,
      cancelled = false;
    void import('maplibre-gl').then(({ Map, Marker, Popup, NavigationControl }) => {
      if (cancelled || !root.current) return;
      map = new Map({ container: root.current, style, center: [8.9, 9.8], zoom: 8 });
      map.addControl(new NavigationControl());
      for (const f of farms)
        if (f.longitude != null && f.latitude != null)
          new Marker({ color: '#19765a' })
            .setLngLat([Number(f.longitude), Number(f.latitude)])
            .setPopup(new Popup().setText(f.name))
            .addTo(map);
      map.on('error', () =>
        setError('Map tiles could not load. The farm records remain available below.'),
      );
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [style, farms]);
  return (
    <section className="panel">
      <h2>Authorized farm locations</h2>
      <p>
        Exact coordinates appear only for authorized farms. The configured map provider receives
        tile requests.
      </p>
      {style ? (
        <div ref={root} className={styles.map} aria-label="Map of authorized farms" />
      ) : (
        <p className="notice">
          Map display is available after a compliant tile style is configured. Farm records work
          without map downloads.
        </p>
      )}
      {error && <p role="status">{error}</p>}
    </section>
  );
}
