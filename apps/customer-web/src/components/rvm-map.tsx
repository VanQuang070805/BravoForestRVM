'use client';
import { useEffect, useRef } from 'react';

export type LocationPoint = {
  id: string | number;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  machineCount: number;
};

export function RvmMap({
  points = [],
  loading = false,
  error = ''
}: {
  points?: LocationPoint[];
  loading?: boolean;
  error?: string;
} = {}) {
  const element = useRef<HTMLDivElement>(null);
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    if (!key || !element.current || !points.length) return;
    let disposed = false;

    const draw = () => {
      if (disposed || !element.current) return;
      const maps = (window as any).google?.maps;
      if (!maps) return;

      const center = { lat: points[0].latitude, lng: points[0].longitude };
      const map = new maps.Map(element.current, {
        center,
        zoom: 12,
        mapTypeControl: false,
        streetViewControl: false
      });
      const bounds = new maps.LatLngBounds();

      points.forEach(p => {
        const pos = { lat: p.latitude, lng: p.longitude };
        bounds.extend(pos);
        const marker = new maps.Marker({ map, position: pos, title: p.name });
        const content = document.createElement('div');
        content.style.cssText = 'color:#071910;padding:4px';
        const title = document.createElement('strong');
        title.textContent = p.name;
        const address = document.createElement('small');
        address.textContent = p.address;
        const count = document.createElement('span');
        count.style.cssText = 'color:#15803d;font-weight:700';
        count.textContent = `${p.machineCount} máy RVM`;
        content.append(title, document.createElement('br'), address, document.createElement('br'), count);
        const info = new maps.InfoWindow({ content });
        marker.addListener('click', () => info.open({ map, anchor: marker }));
      });

      if (points.length > 1) map.fitBounds(bounds);
    };

    if ((window as any).google?.maps) {
      draw();
      return () => {
        disposed = true;
      };
    }

    const scriptId = 'bravoforest-google-maps';
    const script = document.getElementById(scriptId) as HTMLScriptElement | null;
    const onLoad = () => draw();

    if (script) {
      script.addEventListener('load', onLoad, { once: true });
      return () => {
        disposed = true;
        script.removeEventListener('load', onLoad);
      };
    }

    const added = document.createElement('script');
    added.id = scriptId;
    added.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}`;
    added.async = true;
    added.defer = true;
    added.addEventListener('load', onLoad, { once: true });
    document.head.appendChild(added);

    return () => {
      disposed = true;
    };
  }, [key, points]);

  if (loading) return <div className="map-panel" role="status" aria-label="Đang tải bản đồ">Đang tải tọa độ các trạm máy RVM…</div>;
  if (error) return <div className="map-panel" role="alert">Không thể tải bản đồ địa điểm: {error}</div>;
  if (!points.length) return <div className="map-panel empty">Chưa có tọa độ bản đồ cho các địa điểm này.</div>;

  return key ? (
    <div ref={element} className="map-panel" aria-label="Bản đồ mạng lưới trạm RVM BravoForest" style={{ minHeight: 380, borderRadius: 18 }} />
  ) : (
    <div className="map-panel map-list" aria-label="Các trạm có tọa độ bản đồ">
      {points.map(p => (
        <div key={p.id} className="map-location">
          <div>
            <strong>{p.name}</strong>
            <small>{p.address}</small>
          </div>
          <span>{p.machineCount} máy RVM</span>
        </div>
      ))}
    </div>
  );
}
