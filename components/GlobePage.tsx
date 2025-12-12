
import React, { useState, useCallback, useRef, useEffect } from 'react';
import Globe from 'react-globe.gl';
import { analyzeLocationByCoordinates, geocodeLocation, getCityHealthSnapshot } from '../services/geminiService';
import { saveGlobeInteraction } from '../services/firebaseService';
import type { LocationAnalysisResult, MapPoint, Facility, CityHealthSnapshot, User } from '../types';
import { LocationReport } from './LocationReport';
import { CityHealthReport } from './CityHealthReport';
import { MapPinIcon, MagnifyingGlassIcon, CloseIcon } from './icons';
import { LoadingSpinner } from './LoadingSpinner';
import { majorCities, City } from '../data/cities';
import { BackButton } from './BackButton';
import { useI18n } from './I18n';

export const GlobePage: React.FC<{ onBack: () => void, user?: User | null }> = ({ onBack, user }) => {
  const [locationAnalysis, setLocationAnalysis] = useState<{ result: LocationAnalysisResult, imageUrl: string | null } | null>(null);
  const [citySnapshot, setCitySnapshot] = useState<CityHealthSnapshot | null>(null);
  const [analysisType, setAnalysisType] = useState<'location' | 'city' | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [clickedCoords, setClickedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const globeEl = useRef<any>(null);

  const [globeDimensions, setGlobeDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [isGlobeReady, setIsGlobeReady] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [geocodedName, setGeocodedName] = useState<string | null>(null);

  const [mapPoints, setMapPoints] = useState<MapPoint[]>([]);
  const [panelTitle, setPanelTitle] = useState('Analysis');
  const { language } = useI18n();

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setGlobeDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isGlobeReady && globeEl.current) {
      globeEl.current.pointOfView({ altitude: 3.5 }, 0);
    }
  }, [isGlobeReady]);
  
  const openPanel = (title: string) => {
    setPanelTitle(title);
    setIsPanelOpen(true);
    setIsLoading(true);
    setError(null);
    setMapPoints([]);
    setLocationAnalysis(null);
    setCitySnapshot(null);
  };

  const startLocationAnalysis = useCallback(async (lat: number, lng: number, locationName?: string) => {
    if (isLoading) return;

    if (globeEl.current) {
      globeEl.current.pointOfView({ lat, lng, altitude: 1.5 }, 1000);
    }
    
    setClickedCoords({ lat, lng });
    setAnalysisType('location');
    openPanel(locationName || 'Location Analysis');

    try {
      const { analysis, imageUrl } = await analyzeLocationByCoordinates(lat, lng, language, locationName);
      setLocationAnalysis({ result: analysis, imageUrl: imageUrl });
      setPanelTitle(analysis.locationName);
      
      // Save interaction to Firestore
      if (user) {
          saveGlobeInteraction(user.phone, {
              type: 'location_analysis',
              lat,
              lng,
              locationName: analysis.locationName,
              summary: analysis.summary
          });
      }

    } catch (err) {
      console.error(err);
      setError('Failed to analyze the location. The AI model may be unavailable or the request was blocked. Please try another location.');
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, language, user]);

  const startCityAnalysis = useCallback(async (city: City) => {
    if (isLoading) return;

    if (globeEl.current) {
        globeEl.current.pointOfView({ lat: city.lat, lng: city.lng, altitude: 1.5 }, 1000);
    }

    setClickedCoords({ lat: city.lat, lng: city.lng });
    setAnalysisType('city');
    openPanel(`Health Snapshot: ${city.name}`);
    
    try {
        const snapshot = await getCityHealthSnapshot(city.name, city.country, language);
        setCitySnapshot(snapshot);

        // Save interaction to Firestore
        if (user) {
            saveGlobeInteraction(user.phone, {
                type: 'city_snapshot',
                cityName: city.name,
                country: city.country,
                summary: snapshot.overallSummary
            });
        }
    } catch (err) {
        console.error(err);
        setError('Failed to generate the city health snapshot. The AI model may be busy or recent data could not be found. Please try again later.');
    } finally {
        setIsLoading(false);
    }
  }, [isLoading, language, user]);

  const handleGlobeClick = useCallback(({ lat, lng }: { lat: number, lng: number }) => {
    setGeocodedName(null);
    startLocationAnalysis(lat, lng);
  }, [startLocationAnalysis]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || isSearching) return;
    
    setIsSearching(true);
    setSearchError(null);
    setGeocodedName(null);
    
    try {
        const { lat, lng, foundLocationName } = await geocodeLocation(searchQuery);
        setGeocodedName(foundLocationName);
        startLocationAnalysis(lat, lng, foundLocationName);
    } catch (err) {
        console.error("Geocoding error:", err);
        setSearchError("Could not find that location. Please try a different name.");
    } finally {
        setIsSearching(false);
    }
  };
  
  const closePanel = () => {
      setIsPanelOpen(false);
      setSearchQuery('');
      setSearchError(null);
      setGeocodedName(null);
      setMapPoints([]);
      setAnalysisType(null);
  }

  const handleFacilitiesFound = (facilities: Omit<Facility, 'distance'>[]) => {
      if (clickedCoords) {
          const analysisPoint: MapPoint = {
              lat: clickedCoords.lat,
              lng: clickedCoords.lng,
              name: geocodedName || locationAnalysis?.result.locationName || 'Analyzed Location',
              kind: 'analysis_point'
          };
          const facilityPoints: MapPoint[] = facilities.map(f => ({
              ...f,
              kind: 'facility'
          }));
          setMapPoints([analysisPoint, ...facilityPoints]);
          if (facilities.length > 0 && globeEl.current) {
              globeEl.current.pointOfView({ lat: clickedCoords.lat, lng: clickedCoords.lng, altitude: 2.5 }, 1000);
          }
      }
  };

  return (
    <div ref={containerRef} className="relative w-full h-screen overflow-hidden animate-fade-in bg-black">
      {globeDimensions.width > 0 && (
          <Globe
            ref={globeEl}
            width={globeDimensions.width}
            height={globeDimensions.height}
            globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
            backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
            onGlobeClick={handleGlobeClick}
            atmosphereColor="lightblue"
            atmosphereAltitude={0.25}
            onGlobeReady={() => setIsGlobeReady(true)}
            
            pointsData={mapPoints}
            pointLat="lat"
            pointLng="lng"
            pointLabel="name"
            pointAltitude={0.01}
            pointRadius={0.2}
            pointColor={(point: any) => {
                const p = point as MapPoint;
                if (p.kind === 'analysis_point') return 'rgba(0, 255, 255, 0.8)'; // Cyan
                switch (p.type) {
                    case 'Hospital': return 'rgba(239, 68, 68, 0.8)'; // red-500
                    case 'Clinic': return 'rgba(249, 115, 22, 0.8)'; // orange-500
                    case 'Pharmacy': return 'rgba(234, 179, 8, 0.8)'; // yellow-500
                    default: return 'rgba(100, 116, 139, 0.8)'; // slate-500
                }
            }}
            pointsTransitionDuration={1000}
            onPointClick={(point: any) => {
              if (globeEl.current) {
                  globeEl.current.pointOfView({ lat: point.lat, lng: point.lng, altitude: 0.5 }, 500);
              }
            }}
            onPointHover={(point: any) => {
                if (containerRef.current) {
                    containerRef.current.style.cursor = point ? 'pointer' : 'default';
                }
            }}
            
            labelsData={majorCities}
            labelLat="lat"
            labelLng="lng"
            labelText="name"
            labelSize={0.45}
            labelDotRadius={0.2}
            labelColor={() => 'rgba(255, 255, 255, 0.85)'}
            labelResolution={2}
            onLabelClick={(label: object) => startCityAnalysis(label as City)}
            onLabelHover={(label: object | null) => {
                 if (containerRef.current) {
                    containerRef.current.style.cursor = label ? 'pointer' : 'default';
                }
            }}
          />
      )}

      {/* Header: Back Button and Search Bar */}
      <div className={`absolute top-4 left-4 right-4 flex items-center gap-2 sm:gap-4 transition-opacity duration-500 z-20 ${isPanelOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        {/* Back Button */}
        <BackButton onClick={onBack} className="bg-white/80 backdrop-blur-md flex-shrink-0" />

        {/* Search Bar */}
        <div className="flex-grow min-w-0">
          <form onSubmit={handleSearch} className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search a location..."
              className="w-full pl-4 pr-12 py-3 bg-white/80 backdrop-blur-md border border-slate-300/50 rounded-full shadow-lg placeholder-slate-500 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
              disabled={isSearching}
            />
            <button
              type="submit"
              disabled={isSearching || !searchQuery.trim()}
              className="absolute top-1/2 right-2 -translate-y-1/2 p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 disabled:bg-slate-400 transition-colors"
              aria-label="Search location"
            >
              {isSearching ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <MagnifyingGlassIcon className="w-5 h-5" />}
            </button>
          </form>
          {searchError && <p className="text-center text-sm text-red-400 mt-2 bg-black/50 p-2 rounded-md">{searchError}</p>}
        </div>
      </div>

      {/* Analysis Panel */}
      <div className={`absolute top-0 right-0 h-full w-full max-w-lg bg-white/80 backdrop-blur-md shadow-2xl transition-transform duration-500 ease-in-out transform z-30 ${isPanelOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="h-full flex flex-col">
            <div className="flex-shrink-0 p-4 border-b border-slate-200 flex justify-between items-center">
                <h2 className="text-lg font-bold text-slate-800 truncate pr-2">
                    {panelTitle}
                </h2>
                <button onClick={closePanel} className="p-2 rounded-full hover:bg-slate-200 flex-shrink-0">
                    <CloseIcon className="w-6 h-6 text-slate-600" />
                </button>
            </div>
            <div className="flex-grow overflow-y-auto">
                {isLoading && (
                    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                        <LoadingSpinner />
                        <p className="mt-4 text-slate-600 font-semibold">
                            {analysisType === 'city' ? 'Generating Health Snapshot...' : 'Analyzing Location...'}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                             {analysisType === 'city' ? 'Compiling latest public health data...' : 'Generating report and satellite image.'}
                        </p>
                    </div>
                )}
                {error && (
                    <div className="bg-red-50 border-l-4 border-red-400 text-red-700 p-4 m-4" role="alert">
                        <p className="font-bold">Analysis Error</p>
                        <p>{error}</p>
                    </div>
                )}
                {locationAnalysis && analysisType === 'location' && clickedCoords && <LocationReport result={locationAnalysis.result} imageUrl={locationAnalysis.imageUrl} coords={clickedCoords} onFacilitiesFound={handleFacilitiesFound} />}
                {citySnapshot && analysisType === 'city' && <CityHealthReport snapshot={citySnapshot} />}
            </div>
        </div>
      </div>

      {/* Instruction Box */}
      <div className={`absolute bottom-20 left-1/2 -translate-x-1/2 animate-fade-in-up transition-opacity duration-500 z-10 ${isPanelOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          <div className="bg-white/80 backdrop-blur-md py-2 px-4 rounded-full shadow-lg flex items-center gap-2">
              <MapPinIcon className="w-5 h-5 text-blue-500"/>
              <p className="text-sm text-slate-700 font-medium">Click on the globe or a city to begin analysis.</p>
          </div>
      </div>
    </div>
  );
};
