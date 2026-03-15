import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet's broken default icons with Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const dealIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const userIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function RecenterMap({ center }) {
  const map = useMap();
  useEffect(() => { map.setView(center, map.getZoom()); }, [center]);
  return null;
}

const DEFAULT_CENTER = [40.7934, -77.8600]; // State College, PA

export default function MapView({ deals, onDealClick }) {
  const [userLocation, setUserLocation] = useState(null);
  const [locationError, setLocationError] = useState(false);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      pos => setUserLocation([pos.coords.latitude, pos.coords.longitude]),
      () => setLocationError(true)
    );
  }, []);

  const center = userLocation || DEFAULT_CENTER;
  const dealsWithLocation = deals.filter(d => d.lat && d.lng);

  return (
    <div style={{ height: "calc(100vh - 57px)", position: "relative" }}>
      {locationError && (
        <div style={{
          position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
          zIndex: 1000, background: "#fff", border: "1px solid #e5e1da", borderRadius: 10,
          padding: "8px 16px", fontSize: 13, color: "#6b6560", whiteSpace: "nowrap",
        }}>
          Location unavailable — showing all deals
        </div>
      )}
      {dealsWithLocation.length === 0 && (
        <div style={{
          position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
          zIndex: 1000, background: "#fff", border: "1px solid #e5e1da", borderRadius: 10,
          padding: "8px 16px", fontSize: 13, color: "#6b6560", whiteSpace: "nowrap",
        }}>
          No deals with locations yet — post one with an address!
        </div>
      )}
      <MapContainer center={center} zoom={15} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        {userLocation && (
          <>
            <RecenterMap center={userLocation} />
            <Marker position={userLocation} icon={userIcon}>
              <Popup>You are here</Popup>
            </Marker>
          </>
        )}
        {dealsWithLocation.map(deal => (
          <Marker key={deal.id} position={[deal.lat, deal.lng]} icon={dealIcon}>
            <Popup>
              <div style={{ minWidth: 170, fontFamily: "'DM Sans', sans-serif" }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3, lineHeight: 1.3 }}>{deal.title}</div>
                <div style={{ fontSize: 12, color: "#6b6560", marginBottom: 8 }}>{deal.restaurant}</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
                  <span style={{ background: "#eaf3de", border: "1px solid #97c459", color: "#3b6d11", fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>{deal.price}</span>
                  <span style={{ fontSize: 11, color: "#a09a93" }}>{deal.mealTime}</span>
                </div>
                <button
                  onClick={() => onDealClick(deal.id)}
                  style={{ background: "#d85a30", color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", width: "100%" }}
                >
                  View deal →
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
