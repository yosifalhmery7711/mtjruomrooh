/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Sparkles, 
  ChevronRight, 
  Flame, 
  MessageCircle, 
  X, 
  Send, 
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  Bot
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Category, 
  Product, 
  ExchangeRate, 
  Currency, 
  AdvisorSettings, 
  User,
  OrderItem
} from '../types';
import { convertPrice, getCurrencySymbol, getCurrencyCode, getDirectImageUrl } from '../utils';
import { Database } from '../Database';
import NewsTicker from './NewsTicker';

interface HomeTabProps {
  user: User;
  categories: Category[];
  products: Product[];
  rates: ExchangeRate;
  advisor: AdvisorSettings;
  offerImages: string[];
  onSelectProduct: (product: Product) => void;
  onOpenAdvisorChat: () => void;
  tickerTexts?: string[];
  isLoading?: boolean;
}

export default function HomeTab({
  user,
  categories,
  products,
  rates,
  advisor,
  offerImages,
  onSelectProduct,
  onOpenAdvisorChat,
  tickerTexts = [],
  isLoading = false
}: HomeTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCatId, setSelectedCatId] = useState<string>('ALL');
  const [isAndroidAppInstalled, setIsAndroidAppInstalled] = useState(false);
  const [shuffledProductsList, setShuffledProductsList] = useState<Product[]>([]);

  // State & Effect for Featured Products Carousel
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const featuredProducts = products.filter(p => p.isFeatured);
  const activeFeaturedList = featuredProducts.length > 0 ? featuredProducts : products.slice(0, 3);

  useEffect(() => {
    if (activeFeaturedList.length <= 1) return;
    const adminSettings = Database.getAdminSettings();
    const intervalSec = adminSettings.featuredSpeed || 3;
    const interval = setInterval(() => {
      setFeaturedIndex(prev => (prev + 1) % activeFeaturedList.length);
    }, intervalSec * 1000);
    return () => clearInterval(interval);
  }, [activeFeaturedList.length, products]);

  useEffect(() => {
    if (products.length > 0) {
      setShuffledProductsList([...products].sort(() => Math.random() - 0.5));
    }
  }, [products, selectedCatId]);

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    const isWebView = ua.includes('wv') || ua.includes('webview') || (window as any).Android;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (isWebView || isStandalone) {
      setIsAndroidAppInstalled(true);
    }
  }, []);

  const handleDownloadApp = () => {
    const adminSettingsObj = Database.getAdminSettings();
    const downloadUrl = adminSettingsObj.androidDownloadUrl || 'https://archive.org/download/ruh-store/RuhStore.apk';
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = 'RuhStore.apk';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Carousel slider state
  const [activeSlide, setActiveSlide] = useState(0);
  const slideTimer = useRef<NodeJS.Timeout | null>(null);

  // Combine custom banners (offerImages) and active offer products
  const allSlides = [
    ...offerImages.map((img, idx) => ({
      id: `banner-${idx}`,
      image: getDirectImageUrl(img),
      product: null as Product | null
    })),
    ...products.filter(p => p.isOnOffer).map(prod => ({
      id: `product-${prod.id}`,
      image: getDirectImageUrl(prod.images[0]),
      product: prod
    }))
  ];

  const resetTimer = () => {
    if (slideTimer.current) {
      clearInterval(slideTimer.current);
      slideTimer.current = null;
    }
    if (allSlides.length > 1) {
      slideTimer.current = setInterval(() => {
        setActiveSlide(prev => (prev + 1) % allSlides.length);
      }, 5000);
    }
  };

  // Auto-scroll slider carousel
  useEffect(() => {
    resetTimer();
    return () => {
      if (slideTimer.current) clearInterval(slideTimer.current);
    };
  }, [allSlides.length]);

  // Filters calculation
  const filteredProducts = (shuffledProductsList.length > 0 ? shuffledProductsList : products).filter(p => {
    const matchesCategory = selectedCatId === 'ALL' || 
      p.categoryId === selectedCatId || 
      (p.subCategoryIds && p.subCategoryIds.includes(selectedCatId));
    const matchesSearch = searchQuery.trim() === '' || 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      p.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  if (isLoading) {
    return (
      <div className="bg-amber-50/20 dark:bg-gray-950 min-h-screen pb-32 pt-5" dir="rtl">
        <div className="max-w-md mx-auto px-4 space-y-6">
          
          {/* Skeleton Slider Carousel Placeholder */}
          <div className="relative h-44 rounded-[28px] overflow-hidden bg-gray-200 dark:bg-gray-900 animate-pulse border border-gray-150 dark:border-gray-800">
            <div className="absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent" />
            <div className="absolute bottom-6 right-5 left-5 z-20 space-y-2">
              <div className="h-3 w-16 bg-gray-300 dark:bg-gray-850 rounded-md" />
              <div className="h-4.5 w-1/2 bg-gray-300 dark:bg-gray-850 rounded-md" />
              <div className="h-3.5 w-1/3 bg-gray-300 dark:bg-gray-850 rounded-md" />
            </div>
            {/* Slider Dots */}
            <div className="absolute bottom-3.5 left-0 right-0 flex justify-center gap-1.5 z-20">
              {[1, 2, 3].map((_, i) => (
                <div key={i} className={`w-2 h-2 rounded-full ${i === 0 ? 'bg-amber-500 w-4' : 'bg-gray-350 dark:bg-gray-800'}`} />
              ))}
            </div>
          </div>

          {/* Skeleton News Ticker */}
          <div className="w-full h-8 rounded-xl bg-gray-200 dark:bg-gray-900 animate-pulse border border-gray-150 dark:border-gray-800" />

          {/* Skeleton Search & Featured Items Box Side-by-Side */}
          <div className="flex gap-2.5 items-center w-full">
            <div className="w-1/2 h-[41px] rounded-2xl bg-gray-200 dark:bg-gray-900 animate-pulse border border-gray-150 dark:border-gray-800" />
            <div className="w-1/2 h-[41px] rounded-2xl bg-gray-200 dark:bg-gray-900 animate-pulse border border-gray-150 dark:border-gray-800" />
          </div>

          {/* Skeleton Advisor Banner */}
          <div className="w-full h-20 rounded-[26px] bg-gray-200 dark:bg-gray-900 animate-pulse border border-gray-150 dark:border-gray-800 flex justify-between items-center px-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gray-350 dark:bg-gray-800" />
              <div className="space-y-2">
                <div className="h-3 w-20 bg-gray-350 dark:bg-gray-800 rounded-md" />
                <div className="h-4 w-32 bg-gray-350 dark:bg-gray-800 rounded-md" />
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-gray-350 dark:bg-gray-800" />
          </div>

          {/* Skeleton Categories Bar */}
          <div className="space-y-2 text-right">
            <div className="h-4 w-28 bg-gray-200 dark:bg-gray-900 rounded-md animate-pulse ml-auto" />
            <div className="flex gap-2 overflow-hidden">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="px-10 py-4.5 rounded-xl bg-gray-200 dark:bg-gray-900 animate-pulse border border-gray-150 dark:border-gray-800 shrink-0" />
              ))}
            </div>
          </div>

          {/* Skeleton Products Grid */}
          <div className="space-y-3">
            <div className="flex justify-between items-baseline border-b border-amber-100/40 dark:border-gray-800 pb-1.5">
              <div className="h-4 w-36 bg-gray-200 dark:bg-gray-900 rounded-md animate-pulse ml-auto" />
              <div className="h-3 w-16 bg-gray-200 dark:bg-gray-900 rounded-md animate-pulse" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-white dark:bg-gray-900 rounded-3xl overflow-hidden border border-amber-100/10 dark:border-gray-800/40 flex flex-col text-right">
                  <div className="h-32 w-full bg-gray-250 dark:bg-gray-850 animate-pulse" />
                  <div className="p-3.5 flex-1 flex flex-col space-y-2">
                    <div className="h-3 w-12 bg-gray-200 dark:bg-gray-800 rounded-md animate-pulse ml-auto" />
                    <div className="h-4 w-5/6 bg-gray-200 dark:bg-gray-800 rounded-md animate-pulse ml-auto" />
                    <div className="h-3.5 w-16 bg-gray-200 dark:bg-gray-800 rounded-md animate-pulse ml-auto mt-2" />
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    );
  }

  return (
    <div className="bg-amber-50/20 dark:bg-gray-950 min-h-screen pb-32 pt-5">
      <div className="max-w-md mx-auto px-4 space-y-6">
        
        {/* Promotional PWA & APK Installation Banner */}
        {!isAndroidAppInstalled && (
          <div className="bg-gradient-to-l from-amber-500/10 to-amber-600/15 border border-amber-500/20 rounded-[26px] p-4 text-right relative overflow-hidden flex flex-col justify-between items-center gap-3.5 shadow-sm">
            <div className="absolute top-0 left-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl pointer-events-none" />
            <div className="flex items-center gap-3 w-full">
              <div className="w-11 h-11 bg-gradient-to-tr from-amber-400 to-amber-500 rounded-2xl flex items-center justify-center shadow-md text-2xl shrink-0">
                🌸
              </div>
              <div>
                <h4 className="text-xs font-black text-amber-950 dark:text-amber-300">ثبّتي تطبيق متجر أم روح على جوالكِ! 📱</h4>
                <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">تسوق فوري وسلس، مع تصفح سريع وموفر لبيانات الإنترنت.</p>
              </div>
            </div>
            
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent('trigger-install-prompt-modal'));
              }}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-black text-[10px] py-2.5 px-4 rounded-xl transition shadow-md active:scale-95 shrink-0 cursor-pointer text-center"
            >
              تحميل وتثبيت التطبيق 🌸
            </button>
          </div>
        )}
        
        {/* Sliding Banners Carousel */}
        {allSlides.length > 0 && (
          <div className="relative h-44 rounded-[28px] overflow-hidden shadow-md border border-amber-100/30 dark:border-gray-850 group select-none">
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent z-10 pointer-events-none" />
            
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSlide}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.2}
                onDragEnd={(_, info) => {
                  const swipeThreshold = 50;
                  if (info.offset.x < -swipeThreshold) {
                    // Swiped left
                    setActiveSlide(prev => (prev + 1) % allSlides.length);
                    resetTimer();
                  } else if (info.offset.x > swipeThreshold) {
                    // Swiped right
                    setActiveSlide(prev => (prev - 1 + allSlides.length) % allSlides.length);
                    resetTimer();
                  }
                }}
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                transition={{ duration: 0.4, ease: 'easeInOut' }}
                onClick={() => {
                  const currentSlide = allSlides[activeSlide];
                  if (currentSlide && currentSlide.product) {
                    onSelectProduct(currentSlide.product);
                  }
                }}
                className={`w-full h-full relative cursor-pointer`}
              >
                <img
                  src={allSlides[activeSlide]?.image}
                  alt={allSlides[activeSlide]?.product?.name || "العروض المميزة"}
                  className="w-full h-full object-cover pointer-events-none"
                  draggable="false"
                />

                {allSlides[activeSlide]?.product && (
                  <div className="absolute bottom-6 right-5 left-5 z-20 text-right text-white select-none pointer-events-none">
                    <span className="bg-red-500 text-white font-black text-[9px] px-2 py-0.5 rounded-lg mb-1 inline-block">
                      عرض خاص! 🔥
                    </span>
                    <h3 className="text-xs font-black drop-shadow-md text-white line-clamp-1">
                      {allSlides[activeSlide]?.product?.name}
                    </h3>
                    <p className="text-[10px] text-amber-300 font-extrabold mt-0.5">
                      انقري هنا لمشاهدة تفاصيل العرض 🛍️
                    </p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {/* Slider Dots */}
            {allSlides.length > 1 && (
              <div className="absolute bottom-3.5 left-0 right-0 flex justify-center gap-1.5 z-20">
                {allSlides.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveSlide(idx);
                      resetTimer();
                    }}
                    className={`w-2 h-2 rounded-full transition-all ${
                      activeSlide === idx ? 'bg-amber-500 w-4' : 'bg-white/60'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* News Ticker directly below slider and spanning its exact width */}
        <NewsTicker tickerTexts={tickerTexts} />

        {/* Dynamic Search Bar & Featured Items Box (Side-by-Side 50%/50%) */}
        <div className="flex gap-2.5 items-center w-full" dir="rtl">
          {/* 50% Search Input */}
          <div className="relative w-1/2">
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
              <Search className="h-4 w-4" />
            </div>
            <input
              id="home-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحثي بالاسم أو الرمز..."
              dir="rtl"
              className="w-full pl-3 pr-8.5 py-2.5 bg-white dark:bg-gray-900 border border-amber-100/40 dark:border-gray-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-[10.5px] font-bold text-right shadow-sm text-gray-900 dark:text-white"
            />
          </div>

          {/* 50% Featured Items Box */}
          {activeFeaturedList.length > 0 ? (
            <div 
              onClick={() => onSelectProduct(activeFeaturedList[featuredIndex])}
              className="w-1/2 h-[41px] relative overflow-hidden rounded-2xl border border-amber-500/30 dark:border-amber-500/15 bg-gradient-to-l from-rose-50 to-amber-50 dark:from-rose-950/40 dark:to-amber-950/40 shadow-sm flex items-center justify-between px-2 cursor-pointer select-none group transition transform hover:scale-[1.01] active:scale-98"
            >
              <div className="flex items-center gap-1.5 text-right overflow-hidden">
                {activeFeaturedList[featuredIndex].images?.[0] && (
                  <img 
                    src={getDirectImageUrl(activeFeaturedList[featuredIndex].images[0])} 
                    alt="" 
                    className="w-7 h-7 rounded-lg object-cover border border-amber-100 dark:border-gray-800 shrink-0 shadow-sm"
                    referrerPolicy="no-referrer"
                  />
                )}
                <div className="flex flex-col justify-center overflow-hidden leading-tight">
                  <span className="text-[7.5px] text-amber-600 dark:text-amber-400 font-black flex items-center gap-0.5">
                    <Sparkles className="w-2 h-2 text-amber-500 animate-pulse" />
                    <span>مميز 🌟</span>
                  </span>
                  <span className="text-[9px] text-gray-800 dark:text-gray-200 font-bold truncate max-w-[80px] sm:max-w-[120px]">
                    {activeFeaturedList[featuredIndex].name}
                  </span>
                </div>
              </div>
              <div className="bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-[8px] px-2 py-1 rounded-lg shrink-0 transition shadow-sm">
                عرض 🔎
              </div>
            </div>
          ) : (
            <div className="w-1/2 h-[41px] rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex items-center justify-center text-center">
              <span className="text-[9px] text-gray-400 font-bold">لا يوجد صنف مميز 🌸</span>
            </div>
          )}
        </div>

        {/* Advisor Floating Ruh Banner */}
        <div 
          onClick={onOpenAdvisorChat}
          className="bg-gradient-to-l from-amber-500 to-amber-600 dark:from-amber-600 dark:to-amber-800 p-4 rounded-[26px] text-white flex justify-between items-center shadow-lg hover:shadow-xl cursor-pointer transition transform active:scale-98"
        >
          <div className="flex items-center gap-3 text-right">
            <div className="relative">
              <img
                src={getDirectImageUrl(advisor.image)}
                alt={advisor.name}
                className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-md shrink-0"
              />
              <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full animate-ping" />
              <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full" />
            </div>
            
            <div>
              <div className="flex items-center gap-1.5">
                <span className="bg-white/20 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md uppercase tracking-wider">الذكاء الاصطناعي</span>
                <h4 className="text-xs font-black">{advisor.name}</h4>
              </div>
              <p className="text-[10px] opacity-90 mt-0.5">{advisor.title} - مستشارة التسوق الذكية</p>
            </div>
          </div>

          <div className="bg-white/10 hover:bg-white/20 p-2 rounded-xl transition">
            <MessageCircle className="w-5 h-5 text-white" />
          </div>
        </div>

        {/* Categories Bar */}
        <div className="space-y-2 text-right">
          <h3 className="text-xs font-extrabold text-amber-950 dark:text-amber-300">أقسام وفئات المتجر</h3>
          
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none snap-x" style={{ direction: 'rtl' }}>
            <button
              id="cat-filter-all"
              onClick={() => setSelectedCatId('ALL')}
              className={`px-4.5 py-2.5 rounded-xl font-bold text-xs shrink-0 transition snap-start ${
                selectedCatId === 'ALL'
                  ? 'bg-amber-500 text-white shadow-md'
                  : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border border-amber-100/30'
              }`}
            >
              الكل ✨
            </button>
            {categories.map(cat => (
              <button
                id={`cat-filter-${cat.id}`}
                key={cat.id}
                onClick={() => setSelectedCatId(cat.id)}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs shrink-0 transition snap-start flex items-center gap-2 ${
                  selectedCatId === cat.id
                    ? 'bg-amber-500 text-white shadow-md'
                    : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border border-amber-100/30'
                }`}
              >
                <img src={cat.image} alt={cat.name} className="w-4 h-4 rounded-full object-cover" />
                <span>{cat.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Catalog Product Grid */}
        <div className="space-y-3">
          <div className="flex justify-between items-baseline border-b border-amber-100/40 pb-1.5 text-right" style={{ direction: 'rtl' }}>
            <h3 className="text-xs font-extrabold text-amber-950 dark:text-amber-300">قائمة الأصناف المتاحة</h3>
            <span className="text-[10px] text-gray-400 font-bold">({filteredProducts.length} صنف متاح)</span>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-3xl border text-xs text-gray-400 font-bold">
              عذراً! لم نجد أي صنف مطابق لبحثك حالياً.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {filteredProducts.map(prod => {
                // Converted prices
                const convertedPrice = convertPrice(prod.priceYERNew, user.currency, rates);
                const hasOffer = prod.isOnOffer && prod.offerPriceNew;
                const convertedOfferPrice = hasOffer ? convertPrice(prod.offerPriceNew!, user.currency, rates) : undefined;

                return (
                  <motion.div
                    layout
                    id={`product-card-${prod.id}`}
                    key={prod.id}
                    onClick={() => onSelectProduct(prod)}
                    className="bg-white dark:bg-gray-900 rounded-3xl overflow-hidden shadow-sm hover:shadow-md border border-amber-100/20 dark:border-gray-800 flex flex-col cursor-pointer transition transform active:scale-98 text-right"
                  >
                    {/* Image frame */}
                    <div className="relative h-32 w-full bg-amber-50/30 overflow-hidden">
                      <img
                        referrerPolicy="no-referrer"
                        src={prod.images[0]}
                        alt={prod.name}
                        className="w-full h-full object-cover transition duration-500 hover:scale-105"
                      />

                      {/* Offer tag badge */}
                      {hasOffer && (
                        <span className="absolute top-2.5 right-2.5 bg-red-500 text-white font-black text-[9px] px-2 py-1 rounded-lg flex items-center gap-0.5 shadow-sm animate-pulse">
                          <Flame className="w-3 h-3 fill-white" />
                          <span>تخفيض!</span>
                        </span>
                      )}
                    </div>

                    {/* Meta info */}
                    <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2">
                      <div className="space-y-1">
                        <span className="text-[9px] text-gray-400 font-extrabold block uppercase tracking-wider">{prod.categoryName}</span>
                        <h4 className="text-xs font-extrabold text-gray-900 dark:text-white line-clamp-1 leading-snug">{prod.name}</h4>
                      </div>

                      {/* Prices layout */}
                      <div className="flex flex-col items-baseline">
                        {hasOffer ? (
                          <>
                            <span className="text-[10px] text-gray-400 line-through">
                              {convertedPrice} {getCurrencyCode(user.currency)}
                            </span>
                            <span className="text-xs font-black text-amber-800 dark:text-amber-400">
                              {convertedOfferPrice} {getCurrencyCode(user.currency)}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs font-black text-amber-800 dark:text-amber-400">
                            {convertedPrice} {getCurrencyCode(user.currency)}
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
