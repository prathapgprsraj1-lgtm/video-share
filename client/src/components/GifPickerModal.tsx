import React, { useState } from 'react';
import { Search, X, Sparkles } from 'lucide-react';

interface GifPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectGif: (url: string) => void;
}

// Curated high quality trending GIFs for out-of-the-box operation without requiring external API keys
const CURATED_GIFS: Record<string, string[]> = {
  Trending: [
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExOHp1ZjhkY2o0dTFhZjdrMjA0YmF2NXdycjExbGlpMHpsa3B4dW1mZCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/artj92V8o75VPL7AeQ/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3A1aTZwNGp5dDV2dHphczF5bm02anY4cjN1d2xodmlscG82eHJtYiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/DhstvI455Y0sE/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExYnkyZmhzaHcxenEwYjdycGtlaGNwZ2s4cGhhOGJrczZqODlydWVjbiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/l3q2K5jinAlChoCLS/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExaG1tNjBhNTVyMzhwbDNmbmVpdzU3ZWRjbjA0azM5a2pwaWlsN25sNSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/ICOgUNjpvO0PC/giphy.gif',
  ],
  Applause: [
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExOHp1ZjhkY2o0dTFhZjdrMjA0YmF2NXdycjExbGlpMHpsa3B4dW1mZCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/artj92V8o75VPL7AeQ/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExaTNkc3Vvd3RkZ3Vvemt5Z3Y0ODhjeXpqdjhhN3A2bHhhdTNuYzB1dyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/Swx36wwSsU49HAnIhC/giphy.gif',
  ],
  Celebration: [
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3A1aTZwNGp5dDV2dHphczF5bm02anY4cjN1d2xodmlscG82eHJtYiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/DhstvI455Y0sE/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNG11anJmb204NHM4d2Jub2l1enE5ZnRvaWpsNHB0cml2dWU5cjVtdCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/g9582DNuQppxC/giphy.gif',
  ],
  Laugh: [
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExYnkyZmhzaHcxenEwYjdycGtlaGNwZ2s4cGhhOGJrczZqODlydWVjbiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/l3q2K5jinAlChoCLS/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExOW81NG5maDFscWhrOXp4cDZndHk1N252dHRrbTBqejdsaWVsdWw3ZyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/10JhviFuU2BQZ2/giphy.gif',
  ],
  Cats: [
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExaG1tNjBhNTVyMzhwbDNmbmVpdzU3ZWRjbjA0azM5a2pwaWlsN25sNSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/ICOgUNjpvO0PC/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExd2Rha2J1cGFxd3J4bmx1c3F1cnpxOW1hcXZhOW1lcnJzOHdrZHVjZSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/mlvseq9yvZhba/giphy.gif',
  ],
};

export const GifPickerModal: React.FC<GifPickerModalProps> = ({ isOpen, onClose, onSelectGif }) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Trending');

  if (!isOpen) return null;

  const categories = Object.keys(CURATED_GIFS);
  const currentGifs = CURATED_GIFS[selectedCategory] || CURATED_GIFS['Trending'];

  const filteredGifs = search.trim()
    ? Object.values(CURATED_GIFS)
        .flat()
        .filter((_, idx) => idx % 2 === 0 || search.length > 0)
    : currentGifs;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg p-5 shadow-2xl flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-gray-800">
          <div className="flex items-center gap-2 text-white font-bold text-base">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            Select a GIF
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="pt-3 pb-2">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search GIFs or choose a category..."
              className="w-full bg-gray-800 border border-gray-700 focus:border-indigo-500 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 outline-none"
            />
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setSelectedCategory(cat);
                setSearch('');
              }}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCategory === cat && !search
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* GIFs Grid */}
        <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-2.5 pt-2 pr-1">
          {filteredGifs.map((url, i) => (
            <button
              key={i}
              onClick={() => {
                onSelectGif(url);
                onClose();
              }}
              className="group relative rounded-xl overflow-hidden bg-gray-800 aspect-video hover:ring-2 hover:ring-indigo-500 transition-all cursor-pointer"
            >
              <img src={url} alt="GIF" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
