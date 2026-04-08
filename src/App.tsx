/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  MapPin, 
  Wifi, 
  Zap, 
  Volume2, 
  Heart, 
  MessageSquare, 
  Navigation,
  Clock,
  Sparkles,
  ChevronRight,
  Star,
  Bell
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { 
  collection, 
  onSnapshot, 
  query, 
  serverTimestamp,
  doc,
  setDoc,
  deleteDoc
} from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { db, auth } from './firebase';
import { Cafe } from './types';
import { cn } from './lib/utils';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Mock data generator for initial state if DB is empty
const MOCK_CAFES: Cafe[] = [
  {
    id: 'cafe-1',
    name: '블루보틀 성수',
    address: '서울특별시 성동구 아차산로 7',
    latitude: 37.5478,
    longitude: 127.0441,
    congestion: 'medium',
    seatTypes: ['1p', '2p', 'group'],
    hasOutlets: true,
    hasWifi: true,
    atmosphere: 'vibrant',
    imageUrl: 'https://picsum.photos/seed/cafe1/800/1000',
    aiPrediction: {
      goldenTime: '오후 2:30',
      isGuessed: false
    }
  },
  {
    id: 'cafe-2',
    name: '테라로사 한남',
    address: '서울특별시 용산구 이태원로36길 15',
    latitude: 37.5378,
    longitude: 126.9941,
    congestion: 'low',
    seatTypes: ['1p', '2p'],
    hasOutlets: false,
    hasWifi: true,
    atmosphere: 'quiet',
    imageUrl: 'https://picsum.photos/seed/cafe2/800/1000',
    aiPrediction: {
      goldenTime: '오후 4:00',
      isGuessed: true
    }
  },
  {
    id: 'cafe-3',
    name: '스타벅스 서울대입구',
    address: '서울특별시 관악구 관악로 158',
    latitude: 37.4812,
    longitude: 126.9527,
    congestion: 'high',
    seatTypes: ['1p', '2p', 'group'],
    hasOutlets: true,
    hasWifi: true,
    atmosphere: 'vibrant',
    imageUrl: 'https://picsum.photos/seed/cafe3/800/1000',
    aiPrediction: {
      goldenTime: '오전 11:00',
      isGuessed: false
    }
  }
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [cafes, setCafes] = useState<Cafe[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'outlets' | 'wifi' | 'quiet'>('all');
  const [proximityAlert, setProximityAlert] = useState<Cafe | null>(null);
  const [aiRecommendation, setAiRecommendation] = useState<string | null>(null);

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  // Geolocation
  useEffect(() => {
    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const newLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLocation(newLoc);
          
          // Check for proximity alert (50m)
          cafes.forEach(cafe => {
            const dist = calculateDistance(newLoc.lat, newLoc.lng, cafe.latitude, cafe.longitude);
            if (dist < 0.05 && cafe.congestion === 'low' && !proximityAlert) {
              setProximityAlert(cafe);
              setTimeout(() => setProximityAlert(null), 5000);
            }
          });
        },
        (err) => console.error(err),
        { enableHighAccuracy: true }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [cafes, proximityAlert]);

  // Firestore listeners
  useEffect(() => {
    const q = query(collection(db, 'cafes'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cafeData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Cafe));
      if (cafeData.length === 0) {
        setCafes(MOCK_CAFES);
      } else {
        setCafes(cafeData);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      const q = query(collection(db, `users/${user.uid}/favorites`));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setFavorites(snapshot.docs.map(doc => doc.data().cafeId));
      });
      return () => unsubscribe();
    } else {
      setFavorites([]);
    }
  }, [user]);

  // AI Recommendation
  useEffect(() => {
    if (cafes.length > 0 && !aiRecommendation) {
      getAiRecommendation();
    }
  }, [cafes]);

  const getAiRecommendation = async () => {
    try {
      const prompt = `Based on these cafes: ${cafes.map(c => c.name).join(', ')}, recommend one for a student who likes ${filter === 'quiet' ? 'quiet places' : 'vibrant places'}. Keep it short (1 sentence).`;
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });
      setAiRecommendation(response.text || "오늘 공부하기 좋은 카페를 찾아보세요!");
    } catch (err) {
      console.error(err);
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const sortedCafes = useMemo(() => {
    let result = cafes.map(cafe => ({
      ...cafe,
      distance: userLocation ? calculateDistance(userLocation.lat, userLocation.lng, cafe.latitude, cafe.longitude) : undefined
    }));

    if (searchQuery) {
      result = result.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.address.toLowerCase().includes(searchQuery.toLowerCase()));
    }

    if (filter === 'outlets') result = result.filter(c => c.hasOutlets);
    if (filter === 'wifi') result = result.filter(c => c.hasWifi);
    if (filter === 'quiet') result = result.filter(c => c.atmosphere === 'quiet');

    return result.sort((a, b) => (a.distance || 0) - (b.distance || 0));
  }, [cafes, userLocation, searchQuery, filter]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error(err);
    }
  };

  const toggleFavorite = async (cafeId: string) => {
    if (!user) {
      handleLogin();
      return;
    }
    const favId = `${user.uid}_${cafeId}`;
    if (favorites.includes(cafeId)) {
      await deleteDoc(doc(db, `users/${user.uid}/favorites`, favId));
    } else {
      await setDoc(doc(db, `users/${user.uid}/favorites`, favId), {
        userId: user.uid,
        cafeId,
        createdAt: serverTimestamp()
      });
    }
  };

  const getCongestionColor = (level: string) => {
    switch (level) {
      case 'low': return 'text-cafe-green';
      case 'medium': return 'text-cafe-yellow';
      case 'high': return 'text-cafe-red';
      default: return 'text-gray-400';
    }
  };

  const getCongestionLabel = (level: string) => {
    switch (level) {
      case 'low': return '여유';
      case 'medium': return '보통';
      case 'high': return '붐빔';
      default: return '정보 없음';
    }
  };

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col relative pb-20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-ivory/80 backdrop-blur-md border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold tracking-tight text-gray-900">SeatFinder</h1>
        <div className="flex items-center gap-3">
          {user ? (
            <img src={user.photoURL || ''} alt="profile" className="w-8 h-8 rounded-full border border-gray-200" />
          ) : (
            <button onClick={handleLogin} className="text-sm font-medium text-gray-600 hover:text-gray-900">로그인</button>
          )}
        </div>
      </header>

      {/* Search & Filter */}
      <div className="p-4 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            type="text" 
            placeholder="카페 이름이나 지역 검색..." 
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-200 transition-all"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {(['all', 'outlets', 'wifi', 'quiet'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all border",
                filter === f ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              )}
            >
              {f === 'all' && '전체'}
              {f === 'outlets' && '🔌 콘센트'}
              {f === 'wifi' && '📶 와이파이'}
              {f === 'quiet' && '🤫 조용한 곳'}
            </button>
          ))}
        </div>

        {/* AI Recommendation Banner */}
        {aiRecommendation && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-amber-50 border border-amber-100 p-3 rounded-xl flex gap-3 items-start"
          >
            <Sparkles className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-900 font-medium leading-tight">
              {aiRecommendation}
            </p>
          </motion.div>
        )}
      </div>

      {/* Feed List */}
      <main className="flex-1 overflow-y-auto px-4 space-y-6">
        {sortedCafes.map((cafe) => (
          <motion.div 
            layout
            key={cafe.id}
            className="bg-white rounded-2xl overflow-hidden instagram-feed-shadow border border-gray-100"
          >
            {/* Cafe Header */}
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 font-bold">
                  {cafe.name[0]}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 leading-none">{cafe.name}</h3>
                  <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {cafe.distance ? `${cafe.distance.toFixed(1)}km` : cafe.address.split(' ').slice(0, 2).join(' ')}
                  </p>
                </div>
              </div>
              <button onClick={() => toggleFavorite(cafe.id)}>
                <Heart className={cn("w-6 h-6 transition-colors", favorites.includes(cafe.id) ? "fill-red-500 text-red-500" : "text-gray-400")} />
              </button>
            </div>

            {/* Cafe Image */}
            <div className="aspect-[4/5] relative bg-gray-100">
              <img 
                src={cafe.imageUrl} 
                alt={cafe.name} 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              {/* Status Overlay */}
              <div className="absolute top-4 right-4 bg-white/90 backdrop-blur px-3 py-1.5 rounded-full flex items-center gap-2 shadow-sm">
                <div className={cn("w-2.5 h-2.5 rounded-full animate-pulse", 
                  cafe.congestion === 'low' ? "bg-cafe-green" : 
                  cafe.congestion === 'medium' ? "bg-cafe-yellow" : "bg-cafe-red"
                )} />
                <span className={cn("text-xs font-bold", getCongestionColor(cafe.congestion))}>
                  {getCongestionLabel(cafe.congestion)}
                </span>
              </div>
            </div>

            {/* Cafe Info & Actions */}
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <Zap className={cn("w-5 h-5", cafe.hasOutlets ? "text-amber-500" : "text-gray-300")} />
                  <Wifi className={cn("w-5 h-5", cafe.hasWifi ? "text-blue-500" : "text-gray-300")} />
                  <Volume2 className={cn("w-5 h-5", cafe.atmosphere === 'quiet' ? "text-green-500" : "text-gray-300")} />
                </div>
                <div className="flex-1" />
                <button className="text-gray-400 hover:text-gray-900">
                  <MessageSquare className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-1">
                <div className="flex gap-1.5">
                  {cafe.seatTypes.map(type => (
                    <span key={type} className="text-[10px] font-bold px-2 py-0.5 bg-gray-100 rounded-md text-gray-600 uppercase">
                      {type === '1p' ? '1인석' : type === '2p' ? '2인석' : '단체석'}
                    </span>
                  ))}
                </div>
                
                {/* AI Prediction */}
                {cafe.aiPrediction && (
                  <div className="mt-3 p-2.5 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="w-3.5 h-3.5 text-gray-500" />
                      <span className="text-xs font-bold text-gray-700">카공 골든타임 예측</span>
                      {cafe.aiPrediction.isGuessed && (
                        <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold">AI 추측</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600">
                      이 카페는 <span className="text-amber-600 font-bold">{cafe.aiPrediction.goldenTime}</span>부터 붐비기 시작할 것으로 예상됩니다.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </main>

      {/* Proximity Alert */}
      <AnimatePresence>
        {proximityAlert && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed bottom-24 left-4 right-4 z-50 bg-gray-900 text-white p-4 rounded-2xl shadow-2xl flex items-center gap-4"
          >
            <div className="w-12 h-12 bg-amber-500 rounded-full flex items-center justify-center shrink-0">
              <Bell className="w-6 h-6 text-white animate-bounce" />
            </div>
            <div className="flex-1">
              <h4 className="font-bold text-sm">초근접 빈자리 알림!</h4>
              <p className="text-xs text-gray-300">50m 이내 {proximityAlert.name}에 여유 자리가 있습니다.</p>
            </div>
            <button onClick={() => setProximityAlert(null)} className="text-gray-400 hover:text-white">
              <ChevronRight className="w-6 h-6" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-ivory/90 backdrop-blur-md border-t border-gray-200 px-6 py-3 flex justify-around items-center z-40 max-w-md mx-auto">
        <button className="flex flex-col items-center gap-1 text-gray-900">
          <Navigation className="w-6 h-6" />
          <span className="text-[10px] font-bold">주변</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-gray-400">
          <Heart className="w-6 h-6" />
          <span className="text-[10px] font-bold">즐겨찾기</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-gray-400">
          <Star className="w-6 h-6" />
          <span className="text-[10px] font-bold">리뷰</span>
        </button>
      </nav>
    </div>
  );
}
