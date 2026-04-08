export interface Cafe {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  congestion: 'low' | 'medium' | 'high';
  seatTypes: string[];
  hasOutlets: boolean;
  hasWifi: boolean;
  atmosphere: 'quiet' | 'vibrant' | 'cozy';
  imageUrl: string;
  aiPrediction?: {
    goldenTime: string;
    isGuessed: boolean;
  };
  distance?: number;
}

export interface Review {
  id: string;
  cafeId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface Favorite {
  id: string;
  userId: string;
  cafeId: string;
  createdAt: string;
}
