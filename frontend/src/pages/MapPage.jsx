import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Store, CheckCircle2, Navigation } from 'lucide-react';

// Fix leaflet default icon paths under bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const shopIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

const CENTER = [30.3165, 78.0322];

export default function MapPage() {
  const [vendors, setVendors] = useState([]);
  useEffect(() => { api.get('/vendors?limit=50&sort=distance').then(r => setVendors(r.data)); }, []);

  return (
    <div className="max-w-7xl mx-auto px-5 md:px-8 py-6 pb-24 md:pb-10">
      <h1 className="font-display text-3xl font-semibold text-stone-900">Sellers on the map</h1>
      <p className="text-stone-600 text-sm mt-1">All vendors and live carts around Dehradun.</p>
      <div className="mt-4 rounded-2xl overflow-hidden border border-stone-200" style={{ height: '65vh' }}>
        <MapContainer center={CENTER} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {vendors.map((v) => v.lat && v.lng && (
            <Marker key={v.id} position={[v.lat, v.lng]} icon={shopIcon}>
              <Popup>
                <div className="text-sm min-w-[200px]">
                  <div className="font-display font-semibold text-stone-900 flex items-center gap-1">
                    <Store size={13} /> {v.shop_name}
                    {v.is_verified && <CheckCircle2 size={11} className="text-emerald-600" />}
                  </div>
                  <div className="text-xs text-stone-600 mt-1">{v.shop_address} · {v.distance_label}</div>
                  <div className="text-xs text-stone-500 mt-0.5">{v.product_count} products · ★ {v.avg_rating || '—'}</div>
                  {v.vendor_type === 'cart_vendor' && v.is_online && (
                    <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 border-0 text-[10px] mt-2">● Online now</Badge>
                  )}
                  <div className="mt-2 flex gap-1">
                    <Link to={`/vendors/${v.id}`} onClick={() => api.post('/attribution/event', { seller_id: v.id, event_type: 'seller_profile_view', metadata: { source: 'map' } }).catch(() => {})}>
                      <Button size="sm" variant="outline" className="text-xs rounded-full h-7">View</Button>
                    </Link>
                    <a href={`https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lng}`} target="_blank" rel="noopener noreferrer" onClick={() => api.post('/attribution/event', { seller_id: v.id, event_type: 'directions_clicked', metadata: { source: 'map' } }).catch(() => {})}>
                      <Button size="sm" className="text-xs rounded-full h-7 bg-[#0A6E3B] hover:bg-[#075030] text-white"><Navigation size={11} className="mr-1" /> Directions</Button>
                    </a>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
