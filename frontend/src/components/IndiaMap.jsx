import { useState, useMemo } from 'react';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import { GEO_TO_DB, partyColor } from '../constants';
import indiaGeo from '../assets/india-states.json';

const COLOR_MODES = [
  { value: 'party', label: 'Ruling Party' },
  { value: 'turnout', label: 'Voter Turnout' },
  { value: 'margin', label: 'Victory Margin' },
];

function turnoutColor(pct) {
  if (pct == null) return '#d1d5db';
  const t = Math.max(0, Math.min(1, (pct - 40) / 50));
  const g = Math.round(80 + t * 175);
  return `rgb(${60 - t * 30}, ${g}, ${60 - t * 20})`;
}

function marginColor(ruling, runnerUp, total) {
  if (!total || !ruling) return '#d1d5db';
  const margin = (ruling - (runnerUp || 0)) / total;
  const t = Math.min(1, margin);
  const b = Math.round(120 + t * 135);
  return `rgb(${80 - t * 50}, ${100 - t * 40}, ${b})`;
}

export default function IndiaMap({
  stateData = [],
  colorMode = 'party',
  partyMapData,
  selectedParty,
  onStateClick,
}) {
  const [tooltip, setTooltip] = useState(null);

  const dataByState = useMemo(() => {
    const map = {};
    stateData.forEach((s) => {
      map[s.state_name] = s;
    });
    return map;
  }, [stateData]);

  const partyMapByState = useMemo(() => {
    if (!partyMapData) return {};
    const map = {};
    partyMapData.forEach((s) => {
      map[s.state_name] = s;
    });
    return map;
  }, [partyMapData]);

  function getFill(geoName) {
    const dbName = GEO_TO_DB[geoName];
    if (!dbName) return '#d1d5db';
    const d = dataByState[dbName];
    if (!d) return '#d1d5db';

    if (selectedParty && partyMapData) {
      const pm = partyMapByState[dbName];
      if (!pm) return '#e5e7eb';
      const pct = pm.seats_won / pm.total_seats;
      return partyColor(selectedParty)
        .replace(')', `, ${0.2 + pct * 0.8})`)
        .replace('rgb', 'rgba')
        .replace('hsl', 'hsla');
    }

    switch (colorMode) {
      case 'turnout':
        return turnoutColor(d.avg_turnout);
      case 'margin':
        return marginColor(d.ruling_party_seats, d.runner_up_seats, d.total_constituencies);
      default:
        return d.ruling_party ? partyColor(d.ruling_party) : '#d1d5db';
    }
  }

  return (
    <div className="india-map-container">
      <div className="map-wrapper" style={{ position: 'relative' }}>
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ center: [82, 22], scale: 1000 }}
          width={500}
          height={550}
          style={{ width: '100%', height: 'auto', background: '#181824' }}
        >
          <ZoomableGroup>
            <Geographies geography={indiaGeo}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const geoName = geo.properties.NAME_1;
                  const dbName = GEO_TO_DB[geoName];
                  const d = dataByState[dbName];
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={getFill(geoName)}
                      stroke="#fff"
                      strokeWidth={0.5}
                      style={{
                        default: { outline: 'none' },
                        hover: { outline: 'none', fill: '#fbbf24', cursor: 'pointer' },
                        pressed: { outline: 'none' },
                      }}
                      onMouseEnter={(e) => {
                        setTooltip({
                          name: geoName,
                          data: d,
                          x: e.clientX,
                          y: e.clientY,
                        });
                      }}
                      onMouseMove={(e) => {
                        setTooltip((prev) =>
                          prev ? { ...prev, x: e.clientX, y: e.clientY } : null
                        );
                      }}
                      onMouseLeave={() => setTooltip(null)}
                      onClick={() => {
                        if (dbName && onStateClick) onStateClick(dbName);
                      }}
                    />
                  );
                })
              }
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>

        {tooltip && (
          <div
            className="map-tooltip"
            style={{
              position: 'fixed',
              left: tooltip.x + 12,
              top: tooltip.y - 10,
              pointerEvents: 'none',
            }}
          >
            <strong>{tooltip.name}</strong>
            {tooltip.data ? (
              <>
                <div>
                  {tooltip.data.ruling_party}: {tooltip.data.ruling_party_seats}/
                  {tooltip.data.total_constituencies} seats
                </div>
                {tooltip.data.avg_turnout != null && (
                  <div>Turnout: {tooltip.data.avg_turnout}%</div>
                )}
                <div>Latest: {tooltip.data.latest_year}</div>
              </>
            ) : (
              <div style={{ color: '#999' }}>No data</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
