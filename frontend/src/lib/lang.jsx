import React, { createContext, useContext, useEffect, useState } from 'react';

const DICT = {
  en: {
    tagline: 'Find Local. Compare Nearby. Buy Smarter.',
    searchPlaceholder: 'What are you looking for?',
    verifiedSellers: 'Verified local sellers',
    onlineNow: 'Online now',
    products: 'Products',
    tellSellers: 'Tell sellers what you need',
    tellSellersDesc: 'e.g. 5 kg tomatoes — nearby sellers reply with prices',
    seeMap: 'See sellers on the map',
    seeMapDesc: 'Shops and live carts around you',
    shopByCategory: 'Shop by category',
    todaysPrices: "Today's local prices",
    popularNearYou: 'Popular near you',
    vendorsNearYou: 'Vendors near you',
    view: 'View', chat: 'Chat', directions: 'Directions',
    available: 'Available', outOfStock: 'Out of stock',
    shop: 'Shop', cart: 'Cart', verified: 'Verified',
    updated: 'Updated', hAgo: 'h ago',
    home: 'Home', search: 'Search', map: 'Map', iNeed: 'I need', saved: 'Saved', messages: 'Messages', profile: 'Profile',
    login: 'Login', signup: 'Sign up',
    disclaimer: 'Prices and availability are reported by sellers and may change. LocalPrice does not guarantee availability, price, quality or transaction outcomes.',
    navFindProducts: 'Find products', navMap: 'Map', navINeed: 'I need', navDashboard: 'Dashboard',
    signIn: 'Sign in', listShop: 'List shop',
    cats: { vegetables: 'Vegetables', fruits: 'Fruits', groceries: 'Groceries', dairy: 'Dairy',
            bakery: 'Bakery', stationery: 'Stationery', clothing: 'Clothing', household: 'Household',
            hardware: 'Hardware', pharmacy: 'Pharmacy', flowers: 'Flowers', other: 'Other' },
  },
  hi: {
    tagline: 'स्थानीय खोजें। पास तुलना करें। समझदारी से खरीदें।',
    searchPlaceholder: 'आप क्या ढूंढ रहे हैं?',
    verifiedSellers: 'सत्यापित स्थानीय विक्रेता',
    onlineNow: 'अभी ऑनलाइन',
    products: 'उत्पाद',
    tellSellers: 'विक्रेताओं को बताएं कि आपको क्या चाहिए',
    tellSellersDesc: 'जैसे 5 किग्रा टमाटर — पास के विक्रेता कीमत बताएंगे',
    seeMap: 'नक्शे पर विक्रेता देखें',
    seeMapDesc: 'आपके पास की दुकानें और लाइव गाड़ियाँ',
    shopByCategory: 'श्रेणी से खरीदें',
    todaysPrices: 'आज के स्थानीय दाम',
    popularNearYou: 'आपके पास लोकप्रिय',
    vendorsNearYou: 'आपके पास विक्रेता',
    view: 'देखें', chat: 'चैट', directions: 'रास्ता',
    available: 'उपलब्ध', outOfStock: 'खत्म',
    shop: 'दुकान', cart: 'ठेला', verified: 'सत्यापित',
    updated: 'अपडेट', hAgo: ' घंटे पहले',
    home: 'होम', search: 'खोज', map: 'नक्शा', iNeed: 'मुझे चाहिए', saved: 'सहेजे', messages: 'संदेश', profile: 'प्रोफ़ाइल',
    login: 'लॉगिन', signup: 'साइन अप',
    disclaimer: 'कीमतें और उपलब्धता विक्रेताओं द्वारा दी जाती हैं और बदल सकती हैं।',
    navFindProducts: 'उत्पाद खोजें', navMap: 'नक्शा', navINeed: 'मुझे चाहिए', navDashboard: 'डैशबोर्ड',
    signIn: 'साइन इन', listShop: 'दुकान जोड़ें',
    cats: { vegetables: 'सब्ज़ियाँ', fruits: 'फल', groceries: 'किराना', dairy: 'डेयरी',
            bakery: 'बेकरी', stationery: 'स्टेशनरी', clothing: 'कपड़े', household: 'घरेलू',
            hardware: 'हार्डवेयर', pharmacy: 'दवाई', flowers: 'फूल', other: 'अन्य' },
  },
  hinglish: {
    tagline: 'Local Dhundho. Paas Compare Karo. Smart Khareedo.',
    searchPlaceholder: 'Aap kya dhundh rahe hain? (e.g. Aloo, Pyaaz, Doodh)',
    verifiedSellers: 'Verified local dukandaar',
    onlineNow: 'Abhi online',
    products: 'Products',
    tellSellers: 'Dukandaaron ko batayein aapko kya chahiye',
    tellSellersDesc: 'Jaise 5 kg Tamatar — paas ke sellers daam batayenge',
    seeMap: 'Map par sellers dekhein',
    seeMapDesc: 'Aapke aas-paas ki dukanein aur live carts',
    shopByCategory: 'Category se khareedein',
    todaysPrices: 'Aaj ke local daam',
    popularNearYou: 'Aapke paas popular',
    vendorsNearYou: 'Aapke paas dukandaar',
    view: 'Dekhein', chat: 'Chat', directions: 'Raasta',
    available: 'Available', outOfStock: 'Out of stock',
    shop: 'Dukan', cart: 'Thela / Cart', verified: 'Verified',
    updated: 'Updated', hAgo: 'h pehle',
    home: 'Home', search: 'Search', map: 'Map', iNeed: 'Mujhe Chahiye', saved: 'Saved', messages: 'Messages', profile: 'Profile',
    login: 'Login', signup: 'Sign up',
    disclaimer: 'Daam aur availability sellers dwara bataye jaate hain aur badal sakte hain.',
    navFindProducts: 'Products Dhundhein', navMap: 'Map', navINeed: 'Mujhe Chahiye', navDashboard: 'Dashboard',
    signIn: 'Sign in', listShop: 'Dukan Jodein',
    cats: { vegetables: 'Sabziyan (Vegetables)', fruits: 'Phal (Fruits)', groceries: 'Kirana (Groceries)', dairy: 'Dairy & Doodh',
            bakery: 'Bakery', stationery: 'Stationery', clothing: 'Kapde', household: 'Ghar ka Samaan',
            hardware: 'Hardware', pharmacy: 'Dawai / Medical', flowers: 'Phool', other: 'Other' },
  },
};

const UNIT_LOCALIZATION = {
  kg: { en: 'kg', hi: 'किलो', hinglish: 'kilo' },
  g: { en: 'g', hi: 'ग्राम', hinglish: 'gram' },
  mg: { en: 'mg', hi: 'मिलीग्राम', hinglish: 'mg' },
  l: { en: 'L', hi: 'लीटर', hinglish: 'litre' },
  litre: { en: 'L', hi: 'लीटर', hinglish: 'litre' },
  ml: { en: 'ml', hi: 'मिलीलीटर', hinglish: 'ml' },
  piece: { en: 'piece', hi: 'नग / पीस', hinglish: 'piece' },
  pc: { en: 'pc', hi: 'नग', hinglish: 'piece' },
  packet: { en: 'packet', hi: 'पैकेट', hinglish: 'packet' },
  pack: { en: 'pack', hi: 'पैक', hinglish: 'pack' },
  box: { en: 'box', hi: 'बॉक्स', hinglish: 'box' },
  bottle: { en: 'bottle', hi: 'बोतल', hinglish: 'bottle' },
  dozen: { en: 'dozen', hi: 'दर्जन', hinglish: 'darjan' },
  bundle: { en: 'bundle', hi: 'गड्डी', hinglish: 'gaddi' },
  bunch: { en: 'bunch', hi: 'गुच्छा', hinglish: 'guchha' },
  pair: { en: 'pair', hi: 'जोड़ी', hinglish: 'jodi' },
  bag: { en: 'bag', hi: 'बोरी', hinglish: 'bori' },
  sack: { en: 'sack', hi: 'कट्टा', hinglish: 'katta' },
  carton: { en: 'carton', hi: 'पेटी', hinglish: 'peti' },
  crate: { en: 'crate', hi: 'क्रेट', hinglish: 'crate' },
};

const COMMON_PRODUCT_TRANSLATIONS = {
  potato: { en: 'Potato', hi: 'आलू', hinglish: 'Aloo' },
  potatoes: { en: 'Potatoes', hi: 'आलू', hinglish: 'Aloo' },
  onion: { en: 'Onion', hi: 'प्याज', hinglish: 'Pyaz' },
  onions: { en: 'Onions', hi: 'प्याज', hinglish: 'Pyaz' },
  tomato: { en: 'Tomato', hi: 'टमाटर', hinglish: 'Tamatar' },
  tomatoes: { en: 'Tomatoes', hi: 'टमाटर', hinglish: 'Tamatar' },
  milk: { en: 'Milk', hi: 'दूध', hinglish: 'Doodh' },
  'toned milk': { en: 'Toned Milk', hi: 'टोंड दूध', hinglish: 'Toned Doodh' },
  paneer: { en: 'Paneer', hi: 'पनीर', hinglish: 'Paneer' },
  curd: { en: 'Curd', hi: 'दही', hinglish: 'Dahi' },
  rice: { en: 'Rice', hi: 'चावल', hinglish: 'Chawal' },
  'basmati rice': { en: 'Basmati Rice', hi: 'बासमती चावल', hinglish: 'Basmati Chawal' },
  'wheat flour': { en: 'Wheat Flour', hi: 'गेहूं का आटा', hinglish: 'Gehun Ka Aata' },
  sugar: { en: 'Sugar', hi: 'चीनी', hinglish: 'Cheeni' },
  banana: { en: 'Banana', hi: 'केला', hinglish: 'Kela' },
  apple: { en: 'Apple', hi: 'सेब', hinglish: 'Seb' },
  mango: { en: 'Mango', hi: 'आम', hinglish: 'Aam' },
};

export function getLocalizedProductName(product, lang = 'en') {
  if (!product) return '';
  if (lang === 'hi') {
    if (product.name_hi) return product.name_hi;
    const key = (product.name_en || product.name || '').trim().toLowerCase();
    if (COMMON_PRODUCT_TRANSLATIONS[key]?.hi) return COMMON_PRODUCT_TRANSLATIONS[key].hi;
  }
  if (lang === 'hinglish') {
    if (product.name_hinglish) return product.name_hinglish;
    const key = (product.name_en || product.name || '').trim().toLowerCase();
    if (COMMON_PRODUCT_TRANSLATIONS[key]?.hinglish) return COMMON_PRODUCT_TRANSLATIONS[key].hinglish;
  }
  if (lang === 'en' && product.name_en) {
    return product.name_en;
  }
  return product.name || product.name_en || '';
}

export function getLocalizedUnit(unit, lang = 'en') {
  if (!unit) return lang === 'hi' ? 'इकाई' : 'unit';
  const raw = String(unit).trim();
  const key = raw.toLowerCase();
  if (UNIT_LOCALIZATION[key] && UNIT_LOCALIZATION[key][lang]) {
    return UNIT_LOCALIZATION[key][lang];
  }
  return raw;
}

export function getLocalizedDescription(product, lang = 'en') {
  if (!product) return '';
  if (lang === 'hi' && product.description_hi) return product.description_hi;
  if (lang === 'hinglish' && product.description_hinglish) return product.description_hinglish;
  return product.description || '';
}

export function catLabel(dict, key, fallback) {
  return dict?.[key] || fallback;
}

const LangContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('lp_lang') || 'en');
  useEffect(() => { localStorage.setItem('lp_lang', lang); }, [lang]);
  const currentDict = DICT[lang] || DICT.en;
  const t = (key) => currentDict[key] || DICT.en[key] || key;
  return (
    <LangContext.Provider
      value={{
        lang,
        setLang,
        t,
        localizeName: (p) => getLocalizedProductName(p, lang),
        localizeUnit: (u) => getLocalizedUnit(u, lang),
        localizeDesc: (p) => getLocalizedDescription(p, lang),
      }}
    >
      {children}
    </LangContext.Provider>
  );
}

export const useLang = () => useContext(LangContext);
