import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import NameCard from './components/NameCard.jsx'
import './App.css'

const NODE_TYPES = {
  human: { label: 'Human', color: '#16a34a', radius: 8 },
  car: { label: 'Car', color: '#2563eb', radius: 9 },
  motor: { label: 'Motor', color: '#ea580c', radius: 8 },
}

const KNUST = [6.6738, -1.5714]
const MAX_GPS_POINTS = 2000

function ClickToAddPoint({ onAddPoint }) {
  useMapEvents({
    click(event) {
      onAddPoint(event.latlng)
    },
  })
  return null
}

/** Fly to user once when GPS first becomes available (avoid jitter). */
function FlyToUser({ position }) {
  const map = useMap()
  const hasFlown = useRef(false)
  useEffect(() => {
    if (!position || hasFlown.current) return
    hasFlown.current = true
    map.flyTo(position, 17, { duration: 0.6 })
  }, [map, position])
  return null
}

/** Fit map to GPS trail when user clicks "Zoom to path". */
function FitBoundsToPath({ token, path }) {
  const map = useMap()
  useEffect(() => {
    if (!token || path.length < 2) return
    const bounds = L.latLngBounds(path.map((p) => L.latLng(p[0], p[1])))
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 18 })
    }
  }, [token, map, path])
  return null
}

function App() {
  const [userPosition, setUserPosition] = useState(null)
  const [gpsPath, setGpsPath] = useState([])
  const [gpsError, setGpsError] = useState(null)
  const [gpsWatching, setGpsWatching] = useState(false)

  const [savedPins, setSavedPins] = useState([])
  const [selectedPinIds, setSelectedPinIds] = useState([])

  const [manualNodes, setManualNodes] = useState([])
  const [selectedType, setSelectedType] = useState('human')

  const [showNameCard, setShowNameCard] = useState(false)
  const [fitPathToken, setFitPathToken] = useState(0)

  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation not supported')
      return undefined
    }

    setGpsWatching(true)
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const next = [pos.coords.latitude, pos.coords.longitude]
        setUserPosition(next)
        setGpsError(null)
        setGpsPath((prev) => {
          const merged = [...prev, next]
          return merged.length > MAX_GPS_POINTS ? merged.slice(-MAX_GPS_POINTS) : merged
        })
      },
      (err) => {
        setGpsWatching(false)
        if (err.code === 1) setGpsError('Location permission denied')
        else setGpsError(err.message || 'GPS error')
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  const mapCenter = userPosition ?? KNUST

  const togglePinForGraph = useCallback((pin) => {
    setSelectedPinIds((prev) => {
      const i = prev.indexOf(pin.id)
      if (i >= 0) return prev.filter((id) => id !== pin.id)
      return [...prev, pin.id]
    })
  }, [])

  const selectedPinsOrdered = selectedPinIds
    .map((id) => savedPins.find((p) => p.id === id))
    .filter(Boolean)

  const handlePinAtGps = useCallback(() => {
    if (!userPosition) return
    setShowNameCard(true)
  }, [userPosition])

  const handleSaveNamedPin = useCallback(
    (name) => {
      if (!userPosition) return
      const pin = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name,
        lat: userPosition[0],
        lng: userPosition[1],
        type: selectedType,
      }
      setSavedPins((prev) => [...prev, pin])
      setShowNameCard(false)
    },
    [userPosition, selectedType]
  )

  const handleClearGpsPath = () => setGpsPath([])

  const handleZoomToPath = () => {
    if (gpsPath.length >= 2) setFitPathToken((t) => t + 1)
  }

  const handleAddManualNode = (latlng) => {
    setManualNodes((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        lat: latlng.lat,
        lng: latlng.lng,
        type: selectedType,
      },
    ])
  }

  const handleUndoManual = () => setManualNodes((prev) => prev.slice(0, -1))
  const handleClearManual = () => setManualNodes([])

  const handleUpdateManualType = (nodeId, nextType) => {
    setManualNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, type: nextType } : n))
    )
  }

  const latestManual = manualNodes.length > 0 ? manualNodes[manualNodes.length - 1] : null
  const recentManual = manualNodes.slice(-4).reverse()
  const hasManual = manualNodes.length > 0

  /* Payload shape for future FastAPI graph endpoints */
  const graphPayloadPreview = {
    pins: savedPins.map(({ id, name, lat, lng, type }) => ({ id, name, lat, lng, type })),
    selected_pin_ids: selectedPinIds,
    manual_nodes: manualNodes.map(({ id, lat, lng, type }) => ({ id, lat, lng, type })),
  }

  const statusLabel = userPosition ? 'GPS active' : gpsError ? 'GPS unavailable' : 'Waiting for GPS…'
  const statusClass = userPosition ? 'is-live' : gpsError ? 'is-error' : 'is-pending'

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-brand">
          <p className="eyebrow">Campus mapper</p>
          <h1>MapOut</h1>
          <p>KNUST · GPS trails, pins & graph nodes</p>
        </div>
        <span className={`status-chip ${statusClass}`} aria-live="polite">
          {statusLabel}
        </span>
      </header>

      {gpsError && (
        <div className="gps-banner" role="status" aria-live="polite">
          {gpsError}. Map still works — click to add manual nodes or allow location in the browser.
        </div>
      )}

      <main className="map-shell">
        <MapContainer
          center={mapCenter}
          zoom={16}
          className="map"
          scrollWheelZoom
          aria-label="Interactive map: click to place manual nodes"
        >
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FlyToUser position={userPosition} />
          <FitBoundsToPath token={fitPathToken} path={gpsPath} />

          <CircleMarker
            center={KNUST}
            radius={10}
            pathOptions={{ color: '#0b5ed7', fillColor: '#0b5ed7', fillOpacity: 0.65 }}
          >
            <Popup>KNUST reference</Popup>
          </CircleMarker>

          {gpsPath.length > 1 && (
            <Polyline positions={gpsPath} pathOptions={{ color: '#64748b', weight: 4, opacity: 0.85 }} />
          )}

          {userPosition && (
            <CircleMarker
              center={userPosition}
              radius={7}
              pathOptions={{ color: '#7c3aed', fillColor: '#7c3aed', fillOpacity: 0.95 }}
            >
              <Popup>You are here (GPS)</Popup>
            </CircleMarker>
          )}

          {selectedPinsOrdered.length >= 2 && (
            <Polyline
              positions={selectedPinsOrdered.map((p) => [p.lat, p.lng])}
              pathOptions={{ color: '#dc2626', weight: 5, dashArray: '10 6' }}
            />
          )}

          {savedPins.map((pin) => {
            const selected = selectedPinIds.includes(pin.id)
            const t = NODE_TYPES[pin.type] || NODE_TYPES.human
            return (
              <Fragment key={pin.id}>
                <Marker
                  position={[pin.lat, pin.lng]}
                  eventHandlers={{ click: () => togglePinForGraph(pin) }}
                >
                  <Popup>
                    <strong>{pin.name}</strong>
                    <br />
                    {t.label} · {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
                    <br />
                    <span className="popup-hint">
                      {selected ? 'Selected for route' : 'Click marker to toggle graph node'}
                    </span>
                  </Popup>
                </Marker>
                {selected && (
                  <CircleMarker
                    center={[pin.lat, pin.lng]}
                    radius={16}
                    pathOptions={{ color: '#dc2626', fillOpacity: 0, weight: 3 }}
                  />
                )}
              </Fragment>
            )
          })}

          <ClickToAddPoint onAddPoint={handleAddManualNode} />

          {manualNodes.map((node, index) => {
            const t = NODE_TYPES[node.type]
            return (
              <CircleMarker
                key={node.id}
                center={[node.lat, node.lng]}
                radius={t.radius}
                pathOptions={{
                  color: t.color,
                  fillColor: t.color,
                  fillOpacity: 0.85,
                }}
              >
                <Popup>
                  Manual node {index + 1}
                  <br />
                  {node.lat.toFixed(5)}, {node.lng.toFixed(5)}
                  <br />
                  Type: {t.label}
                </Popup>
              </CircleMarker>
            )
          })}
        </MapContainer>

        <aside className="control-card" aria-label="Map controls">
          <div className="control-card-header">
            <h2>Graph controls</h2>
            <p className="hint">
              GPS draws a trail. Pin your location, tap pins to build a route. Click the map for manual nodes.
            </p>
          </div>

          <div className="info-block">
            <h3>GPS & pins</h3>
            <div className="gps-actions">
              <button type="button" className="secondary-btn" onClick={handlePinAtGps} disabled={!userPosition}>
                Pin current GPS
              </button>
              <button type="button" className="secondary-btn" onClick={handleClearGpsPath} disabled={gpsPath.length === 0}>
                Clear GPS path
              </button>
              <button type="button" className="clear-btn" onClick={handleZoomToPath} disabled={gpsPath.length < 2}>
                Zoom to GPS path
              </button>
            </div>
            <p className="muted small">
              Trail points: {gpsPath.length}
              {gpsWatching && ' · watching'}
            </p>
          </div>

          <div className="info-block">
            <h3>Selected route (pins)</h3>
            {selectedPinsOrdered.length === 0 ? (
              <p className="muted">Tap saved pins on the map to add them in order.</p>
            ) : (
              <ol className="selected-list">
                {selectedPinsOrdered.map((p) => (
                  <li key={p.id}>
                    {p.name} <span className="badge-type">{NODE_TYPES[p.type]?.label ?? p.type}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="info-block">
            <h3>New node type</h3>
            <p className="muted small">Used for manual map clicks and new GPS pins.</p>
            <div className="type-buttons">
              {Object.entries(NODE_TYPES).map(([key, value]) => (
                <button
                  key={key}
                  type="button"
                  className={`type-btn ${selectedType === key ? 'active' : ''}`}
                  onClick={() => setSelectedType(key)}
                >
                  <span className="type-dot" style={{ backgroundColor: value.color }} aria-hidden="true" />
                  {value.label}
                </button>
              ))}
            </div>
          </div>

          <div className="stats">
            <div className="stat">
              <span>Saved pins</span>
              <strong>{savedPins.length}</strong>
            </div>
            <div className="stat">
              <span>Manual nodes</span>
              <strong>{manualNodes.length}</strong>
            </div>
          </div>

          <div className="actions">
            <button type="button" className="secondary-btn" onClick={handleUndoManual} disabled={!hasManual}>
              Undo manual
            </button>
            <button type="button" className="clear-btn" onClick={handleClearManual} disabled={!hasManual}>
              Clear manual
            </button>
          </div>

          <div className="info-block">
            <h3>Latest manual node</h3>
            {latestManual ? (
              <p className="latest">
                {latestManual.lat.toFixed(5)}, {latestManual.lng.toFixed(5)}
                <br />
                {NODE_TYPES[latestManual.type].label}
              </p>
            ) : (
              <p className="muted">None</p>
            )}
          </div>

          <div className="info-block">
            <h3>Recent manual</h3>
            {recentManual.length > 0 ? (
              <ul className="point-list">
                {recentManual.map((point, index) => (
                  <li key={point.id}>
                    <div className="point-row">
                      <span>
                        #{manualNodes.length - index} — {point.lat.toFixed(4)}, {point.lng.toFixed(4)}
                      </span>
                      <select
                        value={point.type}
                        onChange={(e) => handleUpdateManualType(point.id, e.target.value)}
                      >
                        {Object.entries(NODE_TYPES).map(([key, value]) => (
                          <option key={key} value={key}>
                            {value.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Click the map to add.</p>
            )}
          </div>

          <details className="api-preview">
            <summary>Backend-ready payload (preview)</summary>
            <pre>{JSON.stringify(graphPayloadPreview, null, 2)}</pre>
          </details>
        </aside>
      </main>

      {showNameCard && (
        <NameCard onSave={handleSaveNamedPin} onClose={() => setShowNameCard(false)} />
      )}
    </div>
  )
}

export default App
