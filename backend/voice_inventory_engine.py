"""HyperLocal AI Voice-Based Inventory Management & Multilingual Product Listing Engine.

Provides:
- Multilingual Speech-to-Inventory NLU Pipeline (English, Hindi, Hinglish, Mixed)
- Spoken Number & Fractional Unit Parser (Devanagari, Hinglish, English, Digits)
- Intelligent Unit Normalization (Weight, Volume, Count, Bulk)
- Price Extraction & Total-vs-Per-Unit Ambiguity Detection
- Canonical Product Matching & Multilingual Translation Dictionary (EN / HI / Hinglish + Synonyms)
- Duplicate Inventory Detection (Update Existing, Add Stock, Create Variant, Cancel)
- Bulk Voice Entry (Multi-product extraction in a single recording)
- Voice-Based Inventory Editing & Voice-Based Inventory Search
- Image-Assisted Product Recognition Support
- Complete Super Admin Control Center (/api/admin/voice-inventory/*):
  Settings, Seller Overrides, Moderation Queue, Analytics Dashboard, Translation Dictionary, and Immutable Audit Logs.
"""

import os
import re
import uuid
import copy
import time
import json
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Literal
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------- 1. Canonical Multilingual Product Dictionary Seed ----------
DEFAULT_PRODUCT_DICTIONARY: List[Dict[str, Any]] = [
    {
        "canonical_id": "PROD-001",
        "canonical_name": "Potato",
        "name_en": "Potato",
        "name_hi": "आलू",
        "name_hinglish": "Aloo",
        "category": "vegetables",
        "default_unit": "KG",
        "synonyms": ["potato", "potatoes", "aloo", "aalu", "alu", "batata", "आलू", "बटाटा", "pahadi aloo"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-002",
        "canonical_name": "Onion",
        "name_en": "Onion",
        "name_hi": "प्याज",
        "name_hinglish": "Pyaaz",
        "category": "vegetables",
        "default_unit": "KG",
        "synonyms": ["onion", "onions", "pyaaz", "pyaz", "piyaz", "kanda", "प्याज", "प्याज़", "कांदा"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-003",
        "canonical_name": "Tomato",
        "name_en": "Tomato",
        "name_hi": "टमाटर",
        "name_hinglish": "Tamatar",
        "category": "vegetables",
        "default_unit": "KG",
        "synonyms": ["tomato", "tomatoes", "tamatar", "टमाटर", "fresh tomatoes", "desi tamatar"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-004",
        "canonical_name": "Milk",
        "name_en": "Milk",
        "name_hi": "दूध",
        "name_hinglish": "Doodh",
        "category": "dairy",
        "default_unit": "L",
        "synonyms": ["milk", "doodh", "dudh", "दूध", "toned milk", "full cream milk", "cow milk"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-005",
        "canonical_name": "Wheat Flour",
        "name_en": "Wheat Flour",
        "name_hi": "गेहूं का आटा",
        "name_hinglish": "Gehun Ka Aata",
        "category": "groceries",
        "default_unit": "KG",
        "synonyms": ["wheat flour", "flour", "atta", "aata", "gehun ka aata", "chakki atta", "आटा", "गेहूं का आटा"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-006",
        "canonical_name": "Basmati Rice",
        "name_en": "Basmati Rice",
        "name_hi": "बासमती चावल",
        "name_hinglish": "Basmati Chawal",
        "category": "groceries",
        "default_unit": "KG",
        "synonyms": ["basmati rice", "basmati chawal", "basmati chaawal", "बासमती चावल"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-007",
        "canonical_name": "Rice",
        "name_en": "Rice",
        "name_hi": "चावल",
        "name_hinglish": "Chawal",
        "category": "groceries",
        "default_unit": "KG",
        "synonyms": ["rice", "chawal", "chaawal", "चावल", "sona masoori"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-008",
        "canonical_name": "Biscuits",
        "name_en": "Biscuits",
        "name_hi": "बिस्कुट",
        "name_hinglish": "Biscuit",
        "category": "bakery",
        "default_unit": "PACKET",
        "synonyms": ["biscuit", "biscuits", "parle-g", "parle g", "parleg", "बिस्कुट", "पारले जी", "marie gold", "good day"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-009",
        "canonical_name": "Ginger",
        "name_en": "Ginger",
        "name_hi": "अदरक",
        "name_hinglish": "Adrak",
        "category": "vegetables",
        "default_unit": "KG",
        "synonyms": ["ginger", "adrak", "अदरक"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-010",
        "canonical_name": "Garlic",
        "name_en": "Garlic",
        "name_hi": "लहसुन",
        "name_hinglish": "Lehsun",
        "category": "vegetables",
        "default_unit": "KG",
        "synonyms": ["garlic", "lehsun", "lasan", "lahsun", "लहसुन"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-011",
        "canonical_name": "Green Chilli",
        "name_en": "Green Chilli",
        "name_hi": "हरी मिर्च",
        "name_hinglish": "Hari Mirch",
        "category": "vegetables",
        "default_unit": "KG",
        "synonyms": ["green chilli", "green chili", "chilli", "chili", "mirchi", "hari mirch", "हरी मिर्च", "मिर्च"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-012",
        "canonical_name": "Coriander Leaves",
        "name_en": "Coriander Leaves",
        "name_hi": "हरा धनिया",
        "name_hinglish": "Hara Dhaniya",
        "category": "vegetables",
        "default_unit": "BUNDLE",
        "synonyms": ["coriander", "cilantro", "dhania", "dhaniya", "hara dhania", "धनिया", "हरा धनिया"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-013",
        "canonical_name": "Spinach",
        "name_en": "Spinach",
        "name_hi": "पालक",
        "name_hinglish": "Palak",
        "category": "vegetables",
        "default_unit": "BUNDLE",
        "synonyms": ["spinach", "palak", "पालक"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-014",
        "canonical_name": "Cauliflower",
        "name_en": "Cauliflower",
        "name_hi": "फूल गोभी",
        "name_hinglish": "Phool Gobhi",
        "category": "vegetables",
        "default_unit": "KG",
        "synonyms": ["cauliflower", "gobhi", "gobi", "phool gobhi", "फूल गोभी", "गोभी"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-015",
        "canonical_name": "Cabbage",
        "name_en": "Cabbage",
        "name_hi": "पत्ता गोभी",
        "name_hinglish": "Patta Gobhi",
        "category": "vegetables",
        "default_unit": "KG",
        "synonyms": ["cabbage", "patta gobhi", "band gobhi", "पत्ता गोभी", "बंद गोभी"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-016",
        "canonical_name": "Ladyfinger (Okra)",
        "name_en": "Ladyfinger (Okra)",
        "name_hi": "भिंडी",
        "name_hinglish": "Bhindi",
        "category": "vegetables",
        "default_unit": "KG",
        "synonyms": ["okra", "ladyfinger", "lady finger", "bhindi", "भिंडी"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-017",
        "canonical_name": "Brinjal (Eggplant)",
        "name_en": "Brinjal (Eggplant)",
        "name_hi": "बैंगन",
        "name_hinglish": "Baingan",
        "category": "vegetables",
        "default_unit": "KG",
        "synonyms": ["brinjal", "eggplant", "baingan", "बैंगन"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-018",
        "canonical_name": "Cucumber",
        "name_en": "Cucumber",
        "name_hi": "खीरा",
        "name_hinglish": "Kheera",
        "category": "vegetables",
        "default_unit": "KG",
        "synonyms": ["cucumber", "kheera", "kakdi", "खीरा", "ककड़ी"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-019",
        "canonical_name": "Lemon",
        "name_en": "Lemon",
        "name_hi": "नींबू",
        "name_hinglish": "Nimbu",
        "category": "vegetables",
        "default_unit": "KG",
        "synonyms": ["lemon", "lemons", "lime", "nimbu", "neembu", "नींबू"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-020",
        "canonical_name": "Apple",
        "name_en": "Apple",
        "name_hi": "सेब",
        "name_hinglish": "Seb",
        "category": "fruits",
        "default_unit": "KG",
        "synonyms": ["apple", "apples", "seb", "सेब", "shimla apple", "kashmiri apple"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-021",
        "canonical_name": "Banana",
        "name_en": "Banana",
        "name_hi": "केला",
        "name_hinglish": "Kela",
        "category": "fruits",
        "default_unit": "DOZEN",
        "synonyms": ["banana", "bananas", "kela", "kele", "केला", "केले"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-022",
        "canonical_name": "Mango",
        "name_en": "Mango",
        "name_hi": "आम",
        "name_hinglish": "Aam",
        "category": "fruits",
        "default_unit": "KG",
        "synonyms": ["mango", "mangoes", "aam", "आम", "dasheri", "alphonso"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-023",
        "canonical_name": "Orange",
        "name_en": "Orange",
        "name_hi": "संतरा",
        "name_hinglish": "Santra",
        "category": "fruits",
        "default_unit": "KG",
        "synonyms": ["orange", "oranges", "santra", "santre", "संतरा"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-024",
        "canonical_name": "Paneer",
        "name_en": "Paneer (Cottage Cheese)",
        "name_hi": "पनीर",
        "name_hinglish": "Paneer",
        "category": "dairy",
        "default_unit": "KG",
        "synonyms": ["paneer", "cottage cheese", "malai paneer", "पनीर"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-025",
        "canonical_name": "Curd (Yogurt)",
        "name_en": "Curd (Yogurt)",
        "name_hi": "दही",
        "name_hinglish": "Dahi",
        "category": "dairy",
        "default_unit": "KG",
        "synonyms": ["curd", "yogurt", "dahi", "दही"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-026",
        "canonical_name": "Butter",
        "name_en": "Butter",
        "name_hi": "मक्खन",
        "name_hinglish": "Makkhan",
        "category": "dairy",
        "default_unit": "PACKET",
        "synonyms": ["butter", "makkhan", "amul butter", "मक्खन"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-027",
        "canonical_name": "Sugar",
        "name_en": "Sugar",
        "name_hi": "चीनी",
        "name_hinglish": "Cheeni",
        "category": "groceries",
        "default_unit": "KG",
        "synonyms": ["sugar", "cheeni", "chini", "shakkar", "चीनी", "शक्कर"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-028",
        "canonical_name": "Salt",
        "name_en": "Salt",
        "name_hi": "नमक",
        "name_hinglish": "Namak",
        "category": "groceries",
        "default_unit": "PACKET",
        "synonyms": ["salt", "namak", "tata salt", "iodized salt", "नमक"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-029",
        "canonical_name": "Mustard Oil",
        "name_en": "Mustard Oil",
        "name_hi": "सरसों का तेल",
        "name_hinglish": "Sarson Ka Tel",
        "category": "groceries",
        "default_unit": "L",
        "synonyms": ["mustard oil", "sarson ka tel", "cooking oil", "oil", "tel", "तेल", "सरसों का तेल"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-030",
        "canonical_name": "Toor Dal (Arhar Dal)",
        "name_en": "Toor Dal (Lentils)",
        "name_hi": "अरहर दाल",
        "name_hinglish": "Arhar Dal",
        "category": "groceries",
        "default_unit": "KG",
        "synonyms": ["dal", "daal", "toor dal", "arhar dal", "lentils", "pulses", "दाल", "अरहर दाल"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-031",
        "canonical_name": "Bread",
        "name_en": "Bread",
        "name_hi": "ब्रेड",
        "name_hinglish": "Bread",
        "category": "bakery",
        "default_unit": "PACKET",
        "synonyms": ["bread", "brown bread", "white bread", "pav", "ब्रेड", "पाव"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-032",
        "canonical_name": "Eggs",
        "name_en": "Eggs",
        "name_hi": "अंडे",
        "name_hinglish": "Ande",
        "category": "dairy",
        "default_unit": "DOZEN",
        "synonyms": ["egg", "eggs", "anda", "ande", "अंडा", "अंडे"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-033",
        "canonical_name": "Shampoo",
        "name_en": "Shampoo",
        "name_hi": "शैम्पू",
        "name_hinglish": "Shampoo",
        "category": "household",
        "default_unit": "BOTTLE",
        "synonyms": ["shampoo", "शैम्पू", "hair wash"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-034",
        "canonical_name": "Soap",
        "name_en": "Soap",
        "name_hi": "साबुन",
        "name_hinglish": "Sabun",
        "category": "household",
        "default_unit": "PIECE",
        "synonyms": ["soap", "sabun", "साबुन", "bath soap", "dettol", "lifebuoy"],
        "approved": True,
    },
    {
        "canonical_id": "PROD-035",
        "canonical_name": "Tea Leaves",
        "name_en": "Tea Leaves",
        "name_hi": "चाय पत्ती",
        "name_hinglish": "Chai Patti",
        "category": "groceries",
        "default_unit": "PACKET",
        "synonyms": ["tea", "chai", "chai patti", "चाय", "चाय पत्ती", "tata tea", "red label"],
        "approved": True,
    },
]

# ---------- 2. Unit Normalization & Spoken Number Maps ----------
UNIT_DEFINITIONS: Dict[str, Dict[str, Any]] = {
    "KG": {
        "code": "KG",
        "db_unit": "kg",
        "category": "WEIGHT",
        "label_en": "Per Kilogram (kg)",
        "label_hi": "प्रति किलो (kg)",
        "label_hinglish": "Per Kilo (kg)",
        "aliases": ["kg", "kgs", "kilo", "kilos", "kilogram", "kilograms", "k.g.", "किलो", "किलोग्राम", "किग्रा"],
    },
    "G": {
        "code": "G",
        "db_unit": "g",
        "category": "WEIGHT",
        "label_en": "Per Gram (g)",
        "label_hi": "प्रति ग्राम (g)",
        "label_hinglish": "Per Gram (g)",
        "aliases": ["g", "gm", "gms", "gram", "grams", "ग्राम"],
    },
    "MG": {
        "code": "MG",
        "db_unit": "mg",
        "category": "WEIGHT",
        "label_en": "Per Milligram (mg)",
        "label_hi": "प्रति मिलीग्राम (mg)",
        "label_hinglish": "Per mg",
        "aliases": ["mg", "milligram", "milligrams", "मिलीग्राम"],
    },
    "L": {
        "code": "L",
        "db_unit": "L",
        "category": "VOLUME",
        "label_en": "Per Litre (L)",
        "label_hi": "प्रति लीटर (L)",
        "label_hinglish": "Per Litre (L)",
        "aliases": ["l", "ltr", "ltrs", "litre", "litres", "liter", "liters", "लीटर", "लिटर"],
    },
    "ML": {
        "code": "ML",
        "db_unit": "ml",
        "category": "VOLUME",
        "label_en": "Per Millilitre (ml)",
        "label_hi": "प्रति मिलीलीटर (ml)",
        "label_hinglish": "Per ml",
        "aliases": ["ml", "millilitre", "milliliter", "मिलीलीटर", "मिली"],
    },
    "PIECE": {
        "code": "PIECE",
        "db_unit": "piece",
        "category": "COUNT",
        "label_en": "Per Piece",
        "label_hi": "प्रति नग / पीस",
        "label_hinglish": "Per Piece / Nag",
        "aliases": ["piece", "pieces", "pc", "pcs", "nag", "नग", "पीस", "each", "prati piece"],
    },
    "PACKET": {
        "code": "PACKET",
        "db_unit": "packet",
        "category": "COUNT",
        "label_en": "Per Packet",
        "label_hi": "प्रति पैकेट",
        "label_hinglish": "Per Packet",
        "aliases": ["packet", "packets", "pack", "packs", "pkt", "pouch", "पैकेट", "पैक", "पाउच"],
    },
    "BOX": {
        "code": "BOX",
        "db_unit": "box",
        "category": "COUNT",
        "label_en": "Per Box",
        "label_hi": "प्रति बॉक्स / डब्बा",
        "label_hinglish": "Per Box / Dabba",
        "aliases": ["box", "boxes", "dabba", "बॉक्स", "डब्बा", "डिब्बा"],
    },
    "BOTTLE": {
        "code": "BOTTLE",
        "db_unit": "bottle",
        "category": "COUNT",
        "label_en": "Per Bottle",
        "label_hi": "प्रति बोतल",
        "label_hinglish": "Per Bottle",
        "aliases": ["bottle", "bottles", "btl", "बोतल"],
    },
    "DOZEN": {
        "code": "DOZEN",
        "db_unit": "dozen",
        "category": "COUNT",
        "label_en": "Per Dozen",
        "label_hi": "प्रति दर्जन",
        "label_hinglish": "Per Darjan",
        "aliases": ["dozen", "dozens", "dzn", "darjan", "दर्जन"],
    },
    "BUNDLE": {
        "code": "BUNDLE",
        "db_unit": "bundle",
        "category": "COUNT",
        "label_en": "Per Bundle / Bunch",
        "label_hi": "प्रति गड्डी / गुच्छा",
        "label_hinglish": "Per Gaddi / Bundle",
        "aliases": ["bundle", "bundles", "bunch", "gaddi", "guchha", "गड्डी", "गुच्छा"],
    },
    "PAIR": {
        "code": "PAIR",
        "db_unit": "pair",
        "category": "COUNT",
        "label_en": "Per Pair",
        "label_hi": "प्रति जोड़ी",
        "label_hinglish": "Per Jodi",
        "aliases": ["pair", "pairs", "jodi", "जोड़ी"],
    },
    "BAG": {
        "code": "BAG",
        "db_unit": "bag",
        "category": "BULK",
        "label_en": "Per Bag / Bori",
        "label_hi": "प्रति बोरी / बैग",
        "label_hinglish": "Per Bori / Bag",
        "aliases": ["bag", "bags", "bori", "बोरी", "बैग"],
    },
    "SACK": {
        "code": "SACK",
        "db_unit": "sack",
        "category": "BULK",
        "label_en": "Per Sack / Katta",
        "label_hi": "प्रति कट्टा",
        "label_hinglish": "Per Katta",
        "aliases": ["sack", "sacks", "katta", "कट्टा"],
    },
    "CARTON": {
        "code": "CARTON",
        "db_unit": "carton",
        "category": "BULK",
        "label_en": "Per Carton / Peti",
        "label_hi": "प्रति पेटी / कार्टन",
        "label_hinglish": "Per Peti / Carton",
        "aliases": ["carton", "cartons", "peti", "पेटी", "कार्टन"],
    },
    "CRATE": {
        "code": "CRATE",
        "db_unit": "crate",
        "category": "BULK",
        "label_en": "Per Crate",
        "label_hi": "प्रति क्रेट",
        "label_hinglish": "Per Crate",
        "aliases": ["crate", "crates", "क्रेट"],
    },
}

SPOKEN_NUMBERS: Dict[str, float] = {
    # English
    "half": 0.5, "quarter": 0.25, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12,
    "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16, "seventeen": 17,
    "eighteen": 18, "nineteen": 19, "twenty": 20, "twenty-five": 25, "thirty": 30,
    "thirty-five": 35, "forty": 40, "forty-five": 45, "fifty": 50, "fifty-five": 55,
    "sixty": 60, "sixty-five": 65, "seventy": 70, "seventy-five": 75, "eighty": 80,
    "eighty-five": 85, "ninety": 90, "ninety-five": 95, "hundred": 100,
    # Hindi Devanagari
    "आधा": 0.5, "पाव": 0.25, "सवा": 1.25, "डेढ़": 1.5, "ढाई": 2.5,
    "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पाँच": 5, "पांच": 5, "छह": 6, "सात": 7,
    "आठ": 8, "नौ": 9, "दस": 10, "ग्यारह": 11, "बारह": 12, "तेरह": 13, "चौदह": 14,
    "पंद्रह": 15, "सोलह": 16, "सत्रह": 17, "अठारह": 18, "उन्नीस": 19, "बीस": 20,
    "इक्कीस": 21, "बाईस": 22, "तेईस": 23, "चौबीस": 24, "पच्चीस": 25, "छब्बीस": 26,
    "सत्ताईस": 27, "अट्ठाईस": 28, "उनतीस": 29, "तीस": 30, "पैंतीस": 35, "चालीस": 40,
    "पैंतालीस": 45, "पचास": 50, "पचपन": 55, "साठ": 60, "पैंसठ": 65, "सत्तर": 70,
    "पचहत्तर": 75, "अस्सी": 80, "पचासी": 85, "नब्बे": 90, "पचानवे": 95, "सौ": 100,
    "एक सौ": 100, "दो सौ": 200, "तीन सौ": 300, "पाँच सौ": 500, "पांच सौ": 500,
    # Hinglish
    "aadha": 0.5, "adha": 0.5, "paav": 0.25, "sawa": 1.25, "dedh": 1.5, "dhai": 2.5,
    "ek": 1, "do": 2, "teen": 3, "char": 4, "chaar": 4, "paanch": 5, "panch": 5,
    "chhe": 6, "che": 6, "saat": 7, "aath": 8, "nau": 9, "das": 10, "dus": 10,
    "gyarah": 11, "barah": 12, "pandrah": 15, "solah": 16, "bees": 20, "bis": 20,
    "pachis": 25, "pachees": 25, "tees": 30, "tis": 30, "paintis": 35, "chalis": 40,
    "chaalis": 40, "paintalis": 45, "pachaas": 50, "pachas": 50, "saath": 60, "sath": 60,
    "painsath": 65, "sattar": 70, "assi": 80, "nabbe": 90, "sau": 100,
}

# Build reverse lookup for unit aliases
ALIAS_TO_UNIT_CODE: Dict[str, str] = {}
for u_code, u_info in UNIT_DEFINITIONS.items():
    for alias in u_info["aliases"]:
        ALIAS_TO_UNIT_CODE[alias.lower()] = u_code


def detect_language_type(text: str) -> str:
    """Detect whether the spoken transcript is Hindi (Devanagari), Hinglish, or English."""
    if not text:
        return "en"
    devanagari_chars = len(re.findall(r"[\u0900-\u097F]", text))
    latin_chars = len(re.findall(r"[a-zA-Z]", text))
    if devanagari_chars > 0 and latin_chars > 0:
        return "hinglish"
    if devanagari_chars > 0:
        return "hi"
    hinglish_markers = {
        "kilo", "rupaye", "rupya", "aloo", "pyaaz", "pyaz", "tamatar", "doodh", "chawal",
        "chaawal", "aata", "atta", "cheeni", "namak", "daal", "dal", "mirchi", "adrak",
        "lehsun", "gobhi", "bhindi", "baingan", "kheera", "nimbu", "kela", "seb", "aam",
        "santra", "dahi", "makkhan", "darjan", "bori", "peti", "nag", "daal do", "mein",
        "ek", "do", "teen", "chaar", "paanch", "das", "bees", "tees", "chalis", "pachaas",
    }
    words = set(re.findall(r"[a-zA-Z]+", text.lower()))
    if words & hinglish_markers:
        return "hinglish"
    return "en"


def normalize_spoken_numbers_in_text(text: str) -> str:
    """Replace multi-word and single-word spoken numbers (English/Hindi/Hinglish) with numeric digits."""
    result = text
    # Handle compound numbers like "twenty five", "sixty five", "एक सौ", "तीन सौ"
    compound_map = {
        "twenty five": "25", "thirty five": "35", "forty five": "45", "fifty five": "55",
        "sixty five": "65", "seventy five": "75", "eighty five": "85", "ninety five": "95",
        "एक सौ": "100", "दो सौ": "200", "तीन सौ": "300", "चार सौ": "400", "पाँच सौ": "500", "पांच सौ": "500",
        "ek sau": "100", "do sau": "200", "teen sau": "300", "char sau": "400", "paanch sau": "500",
    }
    for phrase, num_str in compound_map.items():
        result = re.sub(rf"(?<!\w){re.escape(phrase)}(?!\w)", num_str, result, flags=re.IGNORECASE)

    # Sort single-word spoken numbers by length descending
    for word, val in sorted(SPOKEN_NUMBERS.items(), key=lambda x: -len(x[0])):
        val_str = str(int(val)) if val == int(val) else str(val)
        result = re.sub(rf"(?<![a-zA-Z\u0900-\u097F]){re.escape(word)}(?![a-zA-Z\u0900-\u097F])", val_str, result, flags=re.IGNORECASE)
    return result


def normalize_unit_token(token: Optional[str], fallback: str = "KG") -> str:
    if not token:
        return fallback
    t = token.strip().lower().rstrip(".")
    if t.upper() in UNIT_DEFINITIONS:
        return t.upper()
    return ALIAS_TO_UNIT_CODE.get(t, fallback)


def unit_to_db_display(unit_code: str) -> str:
    return UNIT_DEFINITIONS.get(unit_code.upper(), {}).get("db_unit", unit_code.lower())


# ---------- 3. Default Global Voice Settings ----------
DEFAULT_VOICE_SETTINGS: Dict[str, Any] = {
    "_id": "global_voice_config",
    "voice_enabled_globally": True,
    "enabled_for_retailers": True,
    "enabled_for_mobile_vendors": True,
    "languages_enabled": {
        "en": True,
        "hi": True,
        "hinglish": True,
    },
    "bulk_entry_enabled": True,
    "voice_editing_enabled": True,
    "voice_search_enabled": True,
    "image_recognition_enabled": True,
    "max_recording_seconds": 60,
    "max_batch_size": 15,
    "max_daily_requests_per_seller": 200,
    "supported_units": list(UNIT_DEFINITIONS.keys()),
    "ai_provider": "hybrid_llm_deterministic",
    "ai_model": "gpt-4o-mini",
    "translation_model": "indic_multilingual_v2",
    "confidence_threshold": 0.75,
    "require_manual_moderation": False,
    "retain_transcriptions": True,
    "city_controls": {"Dehradun": True},
    "seller_overrides": {},
    "updated_at": now_iso(),
}


# ---------- 4. Pydantic Schemas ----------
class VoiceProcessRequest(BaseModel):
    transcript: str
    language_hint: Optional[str] = None
    mode_hint: Optional[Literal["auto", "add", "bulk", "edit", "search"]] = "auto"
    image_data_url: Optional[str] = None


class VerifiedItemInput(BaseModel):
    canonical_product_id: Optional[str] = None
    canonical_product_name: str
    product_name_en: str
    product_name_hi: Optional[str] = None
    product_name_hinglish: Optional[str] = None
    brand_or_variant: Optional[str] = None
    category: str = "other"
    stock_quantity: float = 1.0
    stock_unit: str = "KG"
    package_size: Optional[str] = None
    selling_price: float
    price_unit: str = "KG"
    in_stock: bool = True
    is_featured: bool = False
    description: Optional[str] = None
    image_url: Optional[str] = None
    duplicate_action: Literal["create_new", "update_existing", "add_stock", "create_variant", "skip"] = "create_new"
    existing_product_id: Optional[str] = None
    save_as_draft: bool = False


class VoicePublishRequest(BaseModel):
    session_id: Optional[str] = None
    items: List[VerifiedItemInput]


class VoiceEditConfirmRequest(BaseModel):
    session_id: Optional[str] = None
    product_id: str
    operation: Literal["stock_addition", "stock_replacement", "price_update", "availability_update", "delete_product"]
    stock_delta: Optional[float] = None
    new_stock_quantity: Optional[float] = None
    new_price: Optional[float] = None
    new_in_stock: Optional[bool] = None
    reason: Optional[str] = None


class AdminVoiceSettingsPatch(BaseModel):
    voice_enabled_globally: Optional[bool] = None
    enabled_for_retailers: Optional[bool] = None
    enabled_for_mobile_vendors: Optional[bool] = None
    languages_enabled: Optional[Dict[str, bool]] = None
    bulk_entry_enabled: Optional[bool] = None
    voice_editing_enabled: Optional[bool] = None
    voice_search_enabled: Optional[bool] = None
    image_recognition_enabled: Optional[bool] = None
    max_recording_seconds: Optional[int] = None
    max_batch_size: Optional[int] = None
    max_daily_requests_per_seller: Optional[int] = None
    supported_units: Optional[List[str]] = None
    ai_provider: Optional[str] = None
    ai_model: Optional[str] = None
    translation_model: Optional[str] = None
    confidence_threshold: Optional[float] = None
    require_manual_moderation: Optional[bool] = None
    retain_transcriptions: Optional[bool] = None
    city_controls: Optional[Dict[str, bool]] = None


class AdminSellerVoiceOverride(BaseModel):
    seller_id: str
    enabled: bool
    reason: Optional[str] = None


class AdminTranslationUpsert(BaseModel):
    canonical_id: Optional[str] = None
    canonical_name: str
    name_en: str
    name_hi: str
    name_hinglish: str
    category: str = "vegetables"
    default_unit: str = "KG"
    synonyms: List[str] = Field(default_factory=list)
    approved: bool = True


class AdminModerationAction(BaseModel):
    action: Literal["approve", "reject", "request_correction", "flag", "suspend", "restore", "edit"]
    reason: Optional[str] = None
    name_en: Optional[str] = None
    name_hi: Optional[str] = None
    name_hinglish: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None
    unit: Optional[str] = None


# ---------- 5. Engine Initialization & Router Builder ----------
async def init_voice_inventory_db(db):
    """Seed canonical product dictionary & default voice feature settings if not present."""
    try:
        existing_cfg = await db.voice_feature_settings.find_one({"_id": "global_voice_config"})
        if not existing_cfg:
            await db.voice_feature_settings.insert_one(copy.deepcopy(DEFAULT_VOICE_SETTINGS))
        count = await db.product_translations.count_documents({})
        if count == 0:
            docs = []
            for item in DEFAULT_PRODUCT_DICTIONARY:
                d = copy.deepcopy(item)
                d["created_at"] = now_iso()
                d["updated_at"] = now_iso()
                d["source"] = "system_seed"
                docs.append(d)
            await db.product_translations.insert_many(docs)
    except Exception as e:
        logger.warning(f"Voice inventory DB init warning: {e}")


async def expand_multilingual_search_terms(db, raw_query: str) -> List[str]:
    """Expand a consumer search query (in English, Hindi, or Hinglish) into all matching canonical names & synonyms."""
    q = (raw_query or "").strip().lower()
    if not q:
        return []
    terms = {q}
    try:
        dict_docs = await db.product_translations.find({}).to_list(500)
    except Exception:
        dict_docs = DEFAULT_PRODUCT_DICTIONARY

    for d in dict_docs:
        all_names = [
            (d.get("canonical_name") or "").lower(),
            (d.get("name_en") or "").lower(),
            (d.get("name_hi") or "").lower(),
            (d.get("name_hinglish") or "").lower(),
        ] + [str(s).lower() for s in (d.get("synonyms") or [])]
        all_names = [n for n in all_names if n]
        if any(q == n or q in n or n in q for n in all_names):
            terms.update(all_names)
    return list(terms)


def build_voice_inventory_router(db, get_current_user, require_vendor, require_consumer, require_admin, get_optional_user, refresh_vendor_stats=None):
    router = APIRouter(tags=["AI Voice Inventory"])

    async def get_settings() -> Dict[str, Any]:
        doc = await db.voice_feature_settings.find_one({"_id": "global_voice_config"})
        if not doc:
            doc = copy.deepcopy(DEFAULT_VOICE_SETTINGS)
            await db.voice_feature_settings.insert_one(doc)
        return doc

    async def write_audit_log(
        actor_id: str,
        actor_role: str,
        action: str,
        product_id: Optional[str] = None,
        seller_id: Optional[str] = None,
        previous_value: Any = None,
        new_value: Any = None,
        source: str = "voice",
        reason: Optional[str] = None,
    ):
        try:
            await db.voice_audit_logs.insert_one({
                "log_id": f"VLOG-{uuid.uuid4().hex[:10].upper()}",
                "actor_id": actor_id,
                "actor_role": actor_role,
                "action": action,
                "product_id": product_id,
                "seller_id": seller_id,
                "previous_value": previous_value,
                "new_value": new_value,
                "source": source,
                "reason": reason,
                "timestamp": now_iso(),
            })
        except Exception as e:
            logger.warning(f"Audit log write error: {e}")

    async def check_seller_voice_permission(user: dict) -> Dict[str, Any]:
        cfg = await get_settings()
        if not cfg.get("voice_enabled_globally", True):
            raise HTTPException(status_code=403, detail="Voice inventory management is currently disabled by administrator.")
        seller_id = user["id"]
        override = (cfg.get("seller_overrides") or {}).get(seller_id)
        if override and override.get("enabled") is False:
            raise HTTPException(
                status_code=403,
                detail=f"Voice inventory is disabled for your account ({override.get('reason') or 'Admin policy'}). You can still add products manually.",
            )
        if not override or override.get("enabled") is not True:
            v_type = user.get("vendor_type", "retailer")
            if v_type == "cart_vendor" and not cfg.get("enabled_for_mobile_vendors", True):
                raise HTTPException(status_code=403, detail="Voice inventory is currently disabled for mobile/cart vendors.")
            if v_type != "cart_vendor" and not cfg.get("enabled_for_retailers", True):
                raise HTTPException(status_code=403, detail="Voice inventory is currently disabled for retail shop vendors.")
        city = user.get("city", "Dehradun")
        if (cfg.get("city_controls") or {}).get(city) is False:
            raise HTTPException(status_code=403, detail=f"Voice inventory is not enabled in {city}.")
        return cfg

    async def get_dictionary() -> List[Dict[str, Any]]:
        docs = await db.product_translations.find({}).to_list(1000)
        if not docs:
            return DEFAULT_PRODUCT_DICTIONARY
        for d in docs:
            d["id"] = str(d.get("_id", ""))
            d.pop("_id", None)
        return docs

    def match_product_in_dictionary(raw_text: str, dictionary: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Find best canonical product match from dictionary based on longest synonym/name match."""
        cleaned = raw_text.lower().strip()
        best_match = None
        best_len = 0
        for entry in dictionary:
            candidates = [
                entry.get("canonical_name", ""),
                entry.get("name_en", ""),
                entry.get("name_hi", ""),
                entry.get("name_hinglish", ""),
            ] + (entry.get("synonyms") or [])
            for cand in candidates:
                c = str(cand).lower().strip()
                if not c:
                    continue
                # Match whole word or Devanagari substring
                pattern = rf"(?<![a-zA-Z]){re.escape(c)}(?![a-zA-Z])" if re.match(r"^[a-zA-Z0-9\s\-]+$", c) else re.escape(c)
                if re.search(pattern, cleaned):
                    if len(c) > best_len:
                        best_len = len(c)
                        best_match = entry
        return best_match

    def split_into_clauses(transcript: str, bulk_enabled: bool = True) -> List[str]:
        """Split a multi-product spoken sentence into individual product clauses."""
        if not bulk_enabled:
            return [transcript.strip()]
        # Split on comma, semicolon, " and ", " aur ", " और ", " तथा ", " फिर "
        parts = re.split(r"\s*(?:,|;|\band\b|\baur\b|और|तथा|फिर)\s*", transcript.strip(), flags=re.IGNORECASE)
        merged: List[str] = []
        for p in parts:
            p_clean = p.strip()
            if not p_clean:
                continue
            # If a clause is purely a price continuation like "at 30 rupees per kilo", attach to previous
            if merged and re.match(r"^(?:at|for|@|में|के भाव|के हिसाब से)?\s*\d+\s*(?:rupees|rupaye|rs|₹|रुपये)", p_clean, flags=re.IGNORECASE):
                merged[-1] = f"{merged[-1]} {p_clean}"
            else:
                merged.append(p_clean)
        return merged if merged else [transcript.strip()]

    def parse_single_product_clause(clause: str, dictionary: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Extract product, quantity, unit, price, price_unit, brand/variant, and confidence from a single clause."""
        original_clause = clause.strip()
        norm_clause = normalize_spoken_numbers_in_text(original_clause)

        # Build regex of all unit aliases sorted by length descending
        all_unit_aliases = sorted(ALIAS_TO_UNIT_CODE.keys(), key=lambda x: -len(x))
        unit_regex_str = "|".join(re.escape(u) for u in all_unit_aliases)

        # 1. Detect Price & Price Unit
        selling_price: Optional[float] = None
        price_unit: Optional[str] = None
        price_ambiguity = False
        ambiguity_note: Optional[str] = None
        price_confidence = 0.0

        # Pattern A: Explicit per-unit price e.g. "at 30 rupees per kg", "30 rupaye kilo", "₹60 प्रति लीटर", "10 rupees each"
        per_price_pattern = re.compile(
            rf"(?:at|@|rate|दर|भाव)?\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:₹|rupees|rupee|rupaye|rupya|rs\.?|रुपये|रुपए|रुपया)?\s*(?:per|/|prati|प्रति|के भाव|के हिसाब से|में|मे|each|प्रत्येक)?\s*({unit_regex_str})",
            flags=re.IGNORECASE,
        )
        # Find all matches of number + unit vs price + unit
        # Let's specifically look for currency markers first!
        currency_pattern = re.compile(
            rf"(?:(?:at|for|@)\s*)?(?:₹|rs\.?\s*)?(\d+(?:\.\d+)?)\s*(?:₹|rupees|rupee|rupaye|rupya|rs\.?|रुपये|रुपए|रुपया)(?:\s*(?:per|/|prati|प्रति|each|में|मे|के भाव)?\s*({unit_regex_str})|\s*(each))?",
            flags=re.IGNORECASE,
        )
        curr_match = currency_pattern.search(norm_clause)

        # Remove the currency match span when looking for stock quantity so we don't confuse price with stock!
        clause_without_price = norm_clause
        has_per_keyword = bool(re.search(r"\b(?:per|prati|each|every)\b|/|प्रति|हिसाब", norm_clause, flags=re.IGNORECASE))

        if curr_match:
            selling_price = float(curr_match.group(1))
            raw_p_unit = curr_match.group(2) or curr_match.group(3)
            if raw_p_unit:
                price_unit = "PIECE" if raw_p_unit.lower() == "each" else normalize_unit_token(raw_p_unit)
                price_confidence = 0.96
            else:
                # Check if a unit immediately follows the currency match
                after_curr = norm_clause[curr_match.end():].strip()
                u_after = re.match(rf"^(?:per|/|prati|प्रति)?\s*({unit_regex_str})\b", after_curr, flags=re.IGNORECASE)
                if u_after:
                    price_unit = normalize_unit_token(u_after.group(1))
                    price_confidence = 0.94
                else:
                    price_confidence = 0.68
            clause_without_price = (norm_clause[:curr_match.start()] + " " + norm_clause[curr_match.end():]).strip()

        # 2. Detect Stock Quantity & Stock Unit from the remaining clause
        stock_quantity: Optional[float] = None
        stock_unit: Optional[str] = None
        qty_confidence = 0.0
        unit_confidence = 0.0

        qty_unit_pattern = re.compile(
            rf"(\d+(?:\.\d+)?)\s*({unit_regex_str})(?![a-zA-Z\u0900-\u097F])",
            flags=re.IGNORECASE,
        )
        qu_match = qty_unit_pattern.search(clause_without_price)
        if qu_match:
            stock_quantity = float(qu_match.group(1))
            stock_unit = normalize_unit_token(qu_match.group(2))
            qty_confidence = 0.97
            unit_confidence = 0.98
        else:
            # Check if there is a standalone number before product name (e.g., "Add 10 apples")
            num_only = re.search(r"(?:add|डालो|जोड़ो|रखो)?\s*(\d+(?:\.\d+)?)\b", clause_without_price, flags=re.IGNORECASE)
            if num_only:
                stock_quantity = float(num_only.group(1))
                qty_confidence = 0.85

        # 3. Check for Total-vs-Per-Unit Price Ambiguity (Section 8 & 36: "Add 5 kilo rice for 300 rupees" or "Add rice for 300 rupees")
        has_for_keyword = bool(re.search(r"\bfor\s+\d+|\d+\s*(?:रुपये|rupees|rupaye)\s+का\b", norm_clause, flags=re.IGNORECASE))
        if selling_price is not None and price_unit is None:
            if has_for_keyword and not has_per_keyword:
                price_ambiguity = True
                price_confidence = 0.55
                if stock_quantity and stock_quantity > 1:
                    per_unit_calc = round(selling_price / stock_quantity, 2)
                    u_lbl = stock_unit or "KG"
                    ambiguity_note = (
                        f"Ambiguous price: Did you mean ₹{selling_price} per {u_lbl}, or ₹{selling_price} total for {stock_quantity:g} {u_lbl} (₹{per_unit_calc}/{u_lbl})?"
                    )
                else:
                    ambiguity_note = (
                        f"Please clarify the quantity and whether ₹{selling_price} is per unit or total."
                    )

        # 4. Identify Product from Dictionary or Extract Raw Product Name
        dict_match = match_product_in_dictionary(norm_clause, dictionary)

        # Extract any brand/variant words (e.g. "Parle-G", "Amul", "Tata", "Fresh", "Organic", "Desi")
        brand_or_variant: Optional[str] = None
        known_brands = ["Parle-G", "Amul", "Tata", "Mother Dairy", "Britannia", "Aashirvaad", "Fortune", "Patanjali", "Maggi", "Haldiram", "MDH", "Everest", "Surf Excel", "Dettol", "Lifebuoy"]
        for b in known_brands:
            if re.search(re.escape(b), norm_clause, flags=re.IGNORECASE):
                brand_or_variant = b
                break

        if dict_match:
            canonical_id = dict_match["canonical_id"]
            canonical_name = dict_match["canonical_name"]
            name_en = dict_match["name_en"]
            name_hi = dict_match["name_hi"]
            name_hinglish = dict_match["name_hinglish"]
            if brand_or_variant and brand_or_variant.lower() not in name_en.lower():
                name_en = f"{brand_or_variant} {name_en}"
                name_hinglish = f"{brand_or_variant} {name_hinglish}"
            category = dict_match.get("category", "other")
            default_unit = dict_match.get("default_unit", "KG")
            prod_confidence = 0.98
            synonyms = list(set(dict_match.get("synonyms", []) + [canonical_name.lower(), name_en.lower(), name_hi, name_hinglish.lower()]))
        else:
            # Strip filler words, numbers, currency, and units to isolate the spoken product name
            cleaned_name = clause_without_price
            if qu_match:
                cleaned_name = (cleaned_name[:qu_match.start()] + " " + cleaned_name[qu_match.end():]).strip()
            cleaned_name = re.sub(
                rf"\b(?:add|please|put|list|in|inventory|at|for|per|rupees|rupee|rupaye|rs|inr|each|of|mein|me|daal|do|dalo|jodo|rakho|ke|bhav|hisab|se|{unit_regex_str})\b",
                " ",
                cleaned_name,
                flags=re.IGNORECASE,
            )
            cleaned_name = re.sub(r"(?:डाल\s*दो|डालो|जोड़ो|में|रुपये|रुपए|प्रति|के\s*भाव|का|की|के)", " ", cleaned_name)
            cleaned_name = re.sub(r"[\d₹.,/]+", " ", cleaned_name)
            cleaned_name = re.sub(r"\s+", " ", cleaned_name).strip()
            if not cleaned_name:
                cleaned_name = "Unidentified Product"
                prod_confidence = 0.35
            else:
                cleaned_name = cleaned_name.title() if re.match(r"^[a-zA-Z\s\-]+$", cleaned_name) else cleaned_name
                prod_confidence = 0.78

            canonical_id = f"PROD-CUSTOM-{uuid.uuid4().hex[:6].upper()}"
            canonical_name = cleaned_name
            name_en = cleaned_name
            name_hi = cleaned_name
            name_hinglish = cleaned_name
            category = "other"
            default_unit = "KG"
            synonyms = [cleaned_name.lower()]

        # Finalize units & missing field checks
        final_stock_unit = stock_unit or price_unit or default_unit
        final_price_unit = price_unit or stock_unit or default_unit
        if unit_confidence == 0.0 and (stock_unit or price_unit):
            unit_confidence = 0.85
        elif unit_confidence == 0.0:
            unit_confidence = 0.60

        missing_fields: List[str] = []
        warnings: List[str] = []

        if stock_quantity is None:
            missing_fields.append("stock_quantity")
            warnings.append("Stock quantity was not mentioned. Please enter available stock quantity.")
        if selling_price is None:
            missing_fields.append("selling_price")
            warnings.append("Selling price was not mentioned. Please enter the selling price in ₹.")
        if price_ambiguity and ambiguity_note:
            warnings.append(ambiguity_note)
        if category == "other" and not dict_match:
            warnings.append("Please verify or select the appropriate product category.")

        overall_confidence = round(
            (prod_confidence + (qty_confidence or 0.4) + (unit_confidence or 0.5) + (price_confidence or 0.3)) / 4.0,
            2,
        )

        return {
            "clause_original": original_clause,
            "canonical_product_id": canonical_id,
            "canonical_product_name": canonical_name,
            "product_name_en": name_en,
            "product_name_hi": name_hi,
            "product_name_hinglish": name_hinglish,
            "brand_or_variant": brand_or_variant,
            "category": category,
            "stock_quantity": stock_quantity,
            "stock_unit": final_stock_unit,
            "stock_unit_display": unit_to_db_display(final_stock_unit),
            "selling_price": selling_price,
            "price_unit": final_price_unit,
            "price_unit_display": unit_to_db_display(final_price_unit),
            "currency": "INR",
            "in_stock": True,
            "availability": "IN_STOCK",
            "description": f"Fresh {name_en} ({name_hi})" if name_hi and name_hi != name_en else f"Fresh {name_en}",
            "synonyms": synonyms,
            "confidence": {
                "product": prod_confidence,
                "quantity": qty_confidence,
                "unit": unit_confidence,
                "price": price_confidence,
                "overall": overall_confidence,
            },
            "missing_fields": missing_fields,
            "price_ambiguity": price_ambiguity,
            "warnings": warnings,
            "needs_attention": bool(missing_fields or price_ambiguity or overall_confidence < 0.75),
        }

    def detect_voice_intent(transcript: str, mode_hint: str = "auto") -> str:
        """Classify whether the vendor wants to search inventory, edit existing inventory, or add product(s)."""
        if mode_hint in ("add", "bulk"):
            return "add_products"
        if mode_hint == "edit":
            return "edit_inventory"
        if mode_hint == "search":
            return "search_inventory"

        t = transcript.strip().lower()
        # Check search intent patterns (Section 20)
        search_patterns = [
            r"^(?:show|find|search|list|which|what|dikhao|dhundho|khojo)\b",
            r"\b(?:which products|show all|show products|out of stock products|priced below|priced under|need stock)\b",
            r"(?:दिखाओ|ढूंढो|कौन से|खत्म हो गए)",
        ]
        if any(re.search(p, t, flags=re.IGNORECASE) for p in search_patterns):
            return "search_inventory"

        # Check edit intent patterns (Section 19)
        edit_patterns = [
            r"^(?:increase|decrease|reduce|change|update|set|mark|remove|delete)\b",
            r"\b(?:out of stock|unavailable|increase .* stock|change .* price|remove expired)\b",
            r"(?:बढ़ा दो|घटा दो|बदल दो|खत्म हो गया|आउट ऑफ स्टॉक|हटा दो)",
        ]
        if any(re.search(p, t, flags=re.IGNORECASE) for p in edit_patterns):
            return "edit_inventory"

        return "add_products"

    # ---------- VENDOR ENDPOINTS ----------

    @router.get("/voice-inventory/config")
    async def get_vendor_voice_config(user: dict = Depends(require_vendor)):
        cfg = await get_settings()
        seller_id = user["id"]
        override = (cfg.get("seller_overrides") or {}).get(seller_id)
        v_type = user.get("vendor_type", "retailer")
        role_enabled = cfg.get("enabled_for_mobile_vendors", True) if v_type == "cart_vendor" else cfg.get("enabled_for_retailers", True)
        if override and "enabled" in override:
            effective_enabled = bool(cfg.get("voice_enabled_globally", True) and override["enabled"])
        else:
            effective_enabled = bool(cfg.get("voice_enabled_globally", True) and role_enabled)

        return {
            "enabled": effective_enabled,
            "languages_enabled": cfg.get("languages_enabled", {"en": True, "hi": True, "hinglish": True}),
            "bulk_entry_enabled": cfg.get("bulk_entry_enabled", True),
            "voice_editing_enabled": cfg.get("voice_editing_enabled", True),
            "voice_search_enabled": cfg.get("voice_search_enabled", True),
            "image_recognition_enabled": cfg.get("image_recognition_enabled", True),
            "max_recording_seconds": cfg.get("max_recording_seconds", 60),
            "max_batch_size": cfg.get("max_batch_size", 15),
            "supported_units": [
                {
                    "code": code,
                    "db_unit": info["db_unit"],
                    "category": info["category"],
                    "label_en": info["label_en"],
                    "label_hi": info["label_hi"],
                    "label_hinglish": info["label_hinglish"],
                }
                for code, info in UNIT_DEFINITIONS.items()
                if code in (cfg.get("supported_units") or list(UNIT_DEFINITIONS.keys()))
            ],
            "confidence_threshold": cfg.get("confidence_threshold", 0.75),
        }

    @router.post("/voice-inventory/process")
    async def process_voice_input(payload: VoiceProcessRequest, user: dict = Depends(require_vendor)):
        start_time = time.time()
        cfg = await check_seller_voice_permission(user)

        raw_transcript = (payload.transcript or "").strip()
        if not raw_transcript:
            raise HTTPException(status_code=400, detail="No speech detected. Please speak clearly or type your product details.")

        detected_lang = detect_language_type(raw_transcript)
        langs_allowed = cfg.get("languages_enabled") or {"en": True, "hi": True, "hinglish": True}
        if not langs_allowed.get(detected_lang, True):
            raise HTTPException(status_code=400, detail=f"Language '{detected_lang}' is currently disabled by administrator.")

        dictionary = await get_dictionary()
        existing_seller_products = await db.products.find({"vendor_id": user["id"]}).to_list(1000)
        for ep in existing_seller_products:
            ep["id"] = str(ep["_id"])
            ep.pop("_id", None)

        intent = detect_voice_intent(raw_transcript, payload.mode_hint or "auto")
        session_id = f"VSESS-{uuid.uuid4().hex[:10].upper()}"

        # --- CASE A: VOICE-BASED INVENTORY SEARCH (Section 20) ---
        if intent == "search_inventory":
            if not cfg.get("voice_search_enabled", True):
                raise HTTPException(status_code=403, detail="Voice-based inventory search is currently disabled.")
            norm_q = normalize_spoken_numbers_in_text(raw_transcript).lower()
            matched_products = list(existing_seller_products)
            filter_summary = "All inventory products"

            # Filter by out of stock / low stock
            if any(k in norm_q for k in ["out of stock", "unavailable", "खत्म", "need stock", "stock update"]):
                matched_products = [
                    p for p in matched_products
                    if not p.get("in_stock", True) or (p.get("stock_quantity") is not None and float(p.get("stock_quantity", 0)) <= 2)
                ]
                filter_summary = "Out of stock / needs stock update"
            # Filter by price below X
            price_under = re.search(r"(?:below|under|less than|से कम)\s*(?:₹|rs\.?)?\s*(\d+(?:\.\d+)?)", norm_q)
            if price_under:
                max_p = float(price_under.group(1))
                matched_products = [p for p in matched_products if float(p.get("price", 0)) < max_p]
                filter_summary = f"Products priced below ₹{max_p:g}"
            # Filter by category
            for cat_key in ["vegetables", "fruits", "groceries", "dairy", "bakery", "stationery", "clothing", "household", "hardware", "pharmacy", "flowers"]:
                if cat_key in norm_q or cat_key.rstrip("s") in norm_q:
                    matched_products = [p for p in matched_products if (p.get("category") or "").lower() == cat_key]
                    filter_summary = f"Category: {cat_key.title()}"
                    break
            # Filter by specific product match
            dict_m = match_product_in_dictionary(norm_q, dictionary)
            if dict_m:
                cand_names = {
                    dict_m["canonical_name"].lower(),
                    dict_m["name_en"].lower(),
                    dict_m["name_hi"].lower(),
                    dict_m["name_hinglish"].lower(),
                } | {s.lower() for s in dict_m.get("synonyms", [])}
                matched_products = [
                    p for p in matched_products
                    if any(
                        c in (p.get("name_lower") or "")
                        or c in (p.get("name_en") or "").lower()
                        or c in (p.get("name_hi") or "").lower()
                        or c in (p.get("name_hinglish") or "").lower()
                        for c in cand_names
                    )
                ]
                filter_summary = f"Product search: {dict_m['name_en']} ({dict_m['name_hi']})"

            processing_ms = int((time.time() - start_time) * 1000)
            await db.voice_inventory_sessions.insert_one({
                "session_id": session_id,
                "seller_id": user["id"],
                "seller_type": user.get("vendor_type", "retailer"),
                "transcript_raw": raw_transcript if cfg.get("retain_transcriptions", True) else "[REDACTED]",
                "detected_language": detected_lang,
                "intent_type": "search_inventory",
                "extracted_count": len(matched_products),
                "processing_ms": processing_ms,
                "status": "completed",
                "created_at": now_iso(),
            })
            await write_audit_log(user["id"], "vendor", "voice_inventory_search", seller_id=user["id"], new_value={"query": raw_transcript, "matches": len(matched_products)})
            return {
                "session_id": session_id,
                "intent_type": "search_inventory",
                "detected_language": detected_lang,
                "transcript": raw_transcript,
                "filter_summary": filter_summary,
                "search_results": matched_products,
                "processing_ms": processing_ms,
            }

        # --- CASE B: VOICE-BASED INVENTORY EDITING (Section 19) ---
        if intent == "edit_inventory":
            if not cfg.get("voice_editing_enabled", True):
                raise HTTPException(status_code=403, detail="Voice-based inventory editing is currently disabled.")
            norm_t = normalize_spoken_numbers_in_text(raw_transcript)
            dict_m = match_product_in_dictionary(norm_t, dictionary)

            # Find target product in seller's inventory
            target_prod = None
            if dict_m:
                cand_names = {
                    dict_m["canonical_name"].lower(),
                    dict_m["name_en"].lower(),
                    dict_m["name_hi"].lower(),
                    dict_m["name_hinglish"].lower(),
                } | {s.lower() for s in dict_m.get("synonyms", [])}
                for ep in existing_seller_products:
                    if ep.get("canonical_product_id") == dict_m["canonical_id"] or any(
                        c in (ep.get("name_lower") or "")
                        or c in (ep.get("name_en") or "").lower()
                        or c in (ep.get("name_hi") or "")
                        for c in cand_names
                    ):
                        target_prod = ep
                        break
            if not target_prod:
                # Try substring match against seller's existing products
                for ep in existing_seller_products:
                    if (ep.get("name_lower") or "") and ep["name_lower"] in norm_t.lower():
                        target_prod = ep
                        break

            # Determine edit operation
            op = "price_update"
            num_match = re.search(r"(\d+(?:\.\d+)?)", norm_t)
            num_val = float(num_match.group(1)) if num_match else None
            edit_proposal: Dict[str, Any] = {
                "matched_product": target_prod,
                "requires_strong_confirmation": False,
            }

            if re.search(r"\b(?:remove|delete|हटा)\b", norm_t, flags=re.IGNORECASE):
                op = "delete_product"
                edit_proposal["requires_strong_confirmation"] = True
                edit_proposal["summary"] = f"Delete product '{target_prod['name'] if target_prod else 'Unknown'}' from inventory"
            elif re.search(r"\b(?:out of stock|unavailable|खत्म|अनुपलब्ध)\b", norm_t, flags=re.IGNORECASE):
                op = "availability_update"
                edit_proposal["new_in_stock"] = False
                edit_proposal["summary"] = f"Set '{target_prod['name'] if target_prod else 'Product'}' to Out of Stock"
            elif re.search(r"\b(?:in stock|available|उपलब्ध)\b", norm_t, flags=re.IGNORECASE):
                op = "availability_update"
                edit_proposal["new_in_stock"] = True
                edit_proposal["summary"] = f"Set '{target_prod['name'] if target_prod else 'Product'}' to In Stock"
            elif re.search(r"\b(?:increase|add|बढ़ा)\b", norm_t, flags=re.IGNORECASE) and "price" not in norm_t.lower():
                op = "stock_addition"
                edit_proposal["stock_delta"] = num_val or 0
                cur_stock = float((target_prod or {}).get("stock_quantity") or 0)
                edit_proposal["new_stock_quantity"] = cur_stock + (num_val or 0)
                edit_proposal["summary"] = f"Increase stock of '{target_prod['name'] if target_prod else 'Product'}' by {num_val or 0} (New stock: {cur_stock + (num_val or 0)})"
            elif re.search(r"\b(?:price|rate|rupees|rupaye|रुपये|दाम|भाव)\b", norm_t, flags=re.IGNORECASE):
                op = "price_update"
                edit_proposal["new_price"] = num_val
                edit_proposal["summary"] = f"Change price of '{target_prod['name'] if target_prod else 'Product'}' to ₹{num_val}"
            else:
                op = "stock_replacement"
                edit_proposal["new_stock_quantity"] = num_val
                edit_proposal["summary"] = f"Update stock of '{target_prod['name'] if target_prod else 'Product'}' to {num_val}"

            edit_proposal["operation"] = op
            processing_ms = int((time.time() - start_time) * 1000)
            await db.voice_inventory_sessions.insert_one({
                "session_id": session_id,
                "seller_id": user["id"],
                "seller_type": user.get("vendor_type", "retailer"),
                "transcript_raw": raw_transcript if cfg.get("retain_transcriptions", True) else "[REDACTED]",
                "detected_language": detected_lang,
                "intent_type": "edit_inventory",
                "edit_proposal": edit_proposal,
                "processing_ms": processing_ms,
                "status": "draft",
                "created_at": now_iso(),
            })
            await write_audit_log(user["id"], "vendor", "voice_edit_proposed", product_id=(target_prod or {}).get("id"), seller_id=user["id"], new_value=edit_proposal)
            return {
                "session_id": session_id,
                "intent_type": "edit_inventory",
                "detected_language": detected_lang,
                "transcript": raw_transcript,
                "edit_proposal": edit_proposal,
                "processing_ms": processing_ms,
            }

        # --- CASE C: ADD / BULK ADD PRODUCTS (Sections 5–18) ---
        clauses = split_into_clauses(raw_transcript, bulk_enabled=cfg.get("bulk_entry_enabled", True))
        max_batch = cfg.get("max_batch_size", 15)
        clauses = clauses[:max_batch]

        extracted_items: List[Dict[str, Any]] = []
        duplicate_count = 0

        for idx, cl in enumerate(clauses):
            item = parse_single_product_clause(cl, dictionary)
            item["item_index"] = idx

            # Duplicate Detection against seller's existing products (Section 14)
            dup_prod = None
            for ep in existing_seller_products:
                ep_name_low = (ep.get("name_lower") or ep.get("name", "")).lower().strip()
                if (
                    (ep.get("canonical_product_id") and ep.get("canonical_product_id") == item["canonical_product_id"])
                    or ep_name_low == item["product_name_en"].lower()
                    or ep_name_low == (item.get("product_name_hi") or "").lower()
                    or ep_name_low == (item.get("product_name_hinglish") or "").lower()
                    or ep_name_low == item["canonical_product_name"].lower()
                ):
                    dup_prod = ep
                    break

            if dup_prod:
                duplicate_count += 1
                item["duplicate_detected"] = True
                item["existing_product"] = {
                    "id": dup_prod["id"],
                    "name": dup_prod.get("name"),
                    "price": dup_prod.get("price"),
                    "unit": dup_prod.get("unit"),
                    "stock_quantity": dup_prod.get("stock_quantity"),
                    "in_stock": dup_prod.get("in_stock", True),
                }
                item["duplicate_action"] = "update_existing"
                item["warnings"].append(
                    f"'{dup_prod.get('name')}' already exists in your inventory (₹{dup_prod.get('price')}/{dup_prod.get('unit') or 'unit'}). Choose whether to update existing, add stock, or create a variant."
                )
            else:
                item["duplicate_detected"] = False
                item["existing_product"] = None
                item["duplicate_action"] = "create_new"

            extracted_items.append(item)

        processing_ms = int((time.time() - start_time) * 1000)
        session_doc = {
            "session_id": session_id,
            "seller_id": user["id"],
            "seller_name": user.get("shop_name") or user.get("name"),
            "seller_type": user.get("vendor_type", "retailer"),
            "transcript_raw": raw_transcript if cfg.get("retain_transcriptions", True) else "[REDACTED]",
            "detected_language": detected_lang,
            "intent_type": "add_products",
            "is_bulk": len(extracted_items) > 1,
            "extracted_count": len(extracted_items),
            "duplicate_count": duplicate_count,
            "extracted_items": extracted_items,
            "processing_ms": processing_ms,
            "status": "awaiting_verification",
            "created_at": now_iso(),
        }
        await db.voice_inventory_sessions.insert_one(session_doc)
        await write_audit_log(
            user["id"],
            "vendor",
            "voice_extraction_completed",
            seller_id=user["id"],
            new_value={"session_id": session_id, "transcript": raw_transcript, "items_count": len(extracted_items)},
        )

        return {
            "session_id": session_id,
            "intent_type": "add_products",
            "is_bulk": len(extracted_items) > 1,
            "detected_language": detected_lang,
            "transcript": raw_transcript,
            "items": extracted_items,
            "duplicate_count": duplicate_count,
            "processing_ms": processing_ms,
        }

    @router.post("/voice-inventory/verify-and-publish")
    async def verify_and_publish_voice_products(payload: VoicePublishRequest, user: dict = Depends(require_vendor)):
        """Mandatory Vendor Verification & Publication Step (Sections 12, 14, 16)."""
        cfg = await check_seller_voice_permission(user)
        if not payload.items:
            raise HTTPException(status_code=400, detail="No verified product items provided.")

        moderation_status = "pending_review" if cfg.get("require_manual_moderation", False) else "approved"
        dictionary = await get_dictionary()
        now = now_iso()

        published_products: List[Dict[str, Any]] = []
        operations_summary: List[Dict[str, Any]] = []

        for item in payload.items:
            if item.duplicate_action == "skip":
                continue
            if item.selling_price is None or float(item.selling_price) <= 0:
                raise HTTPException(status_code=400, detail=f"Please provide a valid selling price (> ₹0) for '{item.product_name_en}'.")
            if item.stock_quantity is None or float(item.stock_quantity) < 0:
                raise HTTPException(status_code=400, detail=f"Please provide a valid stock quantity for '{item.product_name_en}'.")

            norm_stock_unit = normalize_unit_token(item.stock_unit, "KG")
            norm_price_unit = normalize_unit_token(item.price_unit, norm_stock_unit)
            display_unit = unit_to_db_display(norm_price_unit)

            # Build search tokens across English, Hindi, Hinglish, and dictionary synonyms
            dict_entry = next((d for d in dictionary if d.get("canonical_id") == item.canonical_product_id or d.get("canonical_name", "").lower() == item.canonical_product_name.lower()), None)
            synonym_tokens = set()
            if dict_entry:
                synonym_tokens.update(s.lower() for s in (dict_entry.get("synonyms") or []))
            for nm in [item.canonical_product_name, item.product_name_en, item.product_name_hi, item.product_name_hinglish, item.brand_or_variant]:
                if nm:
                    synonym_tokens.add(nm.strip().lower())

            # Handle Duplicate Update or Stock Addition
            if item.duplicate_action in ("update_existing", "add_stock") and item.existing_product_id:
                existing_doc = await db.products.find_one({"_id": ObjectId(item.existing_product_id), "vendor_id": user["id"]})
                if existing_doc:
                    prev_snapshot = {
                        "price": existing_doc.get("price"),
                        "stock_quantity": existing_doc.get("stock_quantity"),
                        "in_stock": existing_doc.get("in_stock"),
                        "unit": existing_doc.get("unit"),
                    }
                    if item.duplicate_action == "add_stock":
                        new_stock = float(existing_doc.get("stock_quantity") or 0) + float(item.stock_quantity)
                        op_type = "stock_addition"
                    else:
                        new_stock = float(item.stock_quantity)
                        op_type = "stock_replacement"

                    update_fields = {
                        "name": item.product_name_en,
                        "name_lower": item.product_name_en.lower(),
                        "canonical_product_id": item.canonical_product_id or existing_doc.get("canonical_product_id"),
                        "canonical_product_name": item.canonical_product_name,
                        "name_en": item.product_name_en,
                        "name_hi": item.product_name_hi or item.product_name_en,
                        "name_hinglish": item.product_name_hinglish or item.product_name_en,
                        "brand_or_variant": item.brand_or_variant,
                        "package_size": item.package_size,
                        "category": item.category or existing_doc.get("category", "other"),
                        "price": float(item.selling_price),
                        "unit": display_unit,
                        "price_unit": norm_price_unit,
                        "stock_quantity": new_stock,
                        "stock_unit": norm_stock_unit,
                        "in_stock": bool(item.in_stock) and new_stock > 0,
                        "description": item.description or existing_doc.get("description"),
                        "search_tokens": list(synonym_tokens),
                        "updated_at": now,
                        "last_voice_session_id": payload.session_id,
                    }
                    if item.image_url:
                        update_fields["image_url"] = item.image_url

                    await db.products.update_one({"_id": existing_doc["_id"]}, {"$set": update_fields})
                    fresh = await db.products.find_one({"_id": existing_doc["_id"]})
                    fresh["id"] = str(fresh["_id"])
                    fresh.pop("_id", None)
                    published_products.append(fresh)
                    operations_summary.append({"product_id": fresh["id"], "operation": op_type, "name": fresh["name"]})

                    await db.inventory_change_history.insert_one({
                        "history_id": f"HIST-{uuid.uuid4().hex[:10].upper()}",
                        "product_id": fresh["id"],
                        "seller_id": user["id"],
                        "operation_type": op_type,
                        "previous_value": prev_snapshot,
                        "new_value": {"price": fresh["price"], "stock_quantity": new_stock, "in_stock": fresh["in_stock"]},
                        "source": "voice",
                        "voice_session_id": payload.session_id,
                        "created_at": now,
                    })
                    await write_audit_log(
                        user["id"], "vendor", f"voice_{op_type}", product_id=fresh["id"], seller_id=user["id"],
                        previous_value=prev_snapshot, new_value={"price": fresh["price"], "stock_quantity": new_stock},
                    )
                    continue

            # Create New Product (or Create Variant)
            listing_status = "draft" if item.save_as_draft else "published"
            new_doc = {
                "vendor_id": user["id"],
                "vendor_name": user.get("shop_name") or user.get("name"),
                "vendor_shop": user.get("shop_name"),
                "vendor_address": user.get("shop_address"),
                "vendor_city": user.get("city", "Dehradun"),
                "vendor_type": user.get("vendor_type", "retailer"),
                "vendor_is_pro": bool(user.get("is_pro")),
                "vendor_lat": user.get("lat"),
                "vendor_lng": user.get("lng"),
                "canonical_product_id": item.canonical_product_id or f"PROD-{uuid.uuid4().hex[:6].upper()}",
                "canonical_product_name": item.canonical_product_name,
                "name": item.product_name_en,
                "name_lower": item.product_name_en.lower(),
                "name_en": item.product_name_en,
                "name_hi": item.product_name_hi or item.product_name_en,
                "name_hinglish": item.product_name_hinglish or item.product_name_en,
                "brand_or_variant": item.brand_or_variant,
                "package_size": item.package_size,
                "category": item.category or "other",
                "price": float(item.selling_price),
                "unit": display_unit,
                "price_unit": norm_price_unit,
                "stock_quantity": float(item.stock_quantity),
                "stock_unit": norm_stock_unit,
                "description": item.description,
                "image_url": item.image_url,
                "in_stock": bool(item.in_stock) and not item.save_as_draft,
                "is_featured": bool(item.is_featured) if user.get("is_pro") else False,
                "listing_status": listing_status,
                "moderation_status": moderation_status,
                "created_via": "voice",
                "voice_session_id": payload.session_id,
                "search_tokens": list(synonym_tokens),
                "views": 0,
                "clicks": 0,
                "created_at": now,
                "updated_at": now,
            }
            res = await db.products.insert_one(new_doc)
            new_doc["id"] = str(res.inserted_id)
            new_doc.pop("_id", None)
            published_products.append(new_doc)
            operations_summary.append({"product_id": new_doc["id"], "operation": "new_product", "name": new_doc["name"]})

            await db.inventory_change_history.insert_one({
                "history_id": f"HIST-{uuid.uuid4().hex[:10].upper()}",
                "product_id": new_doc["id"],
                "seller_id": user["id"],
                "operation_type": "new_product",
                "previous_value": None,
                "new_value": {
                    "name": new_doc["name"],
                    "name_hi": new_doc["name_hi"],
                    "price": new_doc["price"],
                    "stock_quantity": new_doc["stock_quantity"],
                    "stock_unit": new_doc["stock_unit"],
                },
                "source": "voice",
                "voice_session_id": payload.session_id,
                "created_at": now,
            })
            await write_audit_log(
                user["id"], "vendor", "voice_product_published", product_id=new_doc["id"], seller_id=user["id"],
                new_value={"name_en": new_doc["name_en"], "name_hi": new_doc["name_hi"], "price": new_doc["price"], "stock": new_doc["stock_quantity"]},
            )

        if payload.session_id:
            await db.voice_inventory_sessions.update_one(
                {"session_id": payload.session_id},
                {"$set": {"status": "verified_published", "published_at": now, "published_count": len(published_products)}},
            )

        if refresh_vendor_stats:
            try:
                await refresh_vendor_stats(user["id"])
            except Exception:
                pass

        return {
            "ok": True,
            "published_count": len(published_products),
            "moderation_status": moderation_status,
            "products": published_products,
            "operations": operations_summary,
        }

    @router.post("/voice-inventory/confirm-edit")
    async def confirm_voice_inventory_edit(payload: VoiceEditConfirmRequest, user: dict = Depends(require_vendor)):
        """Apply a vendor-confirmed voice edit to an existing inventory item (Section 19)."""
        await check_seller_voice_permission(user)
        prod = await db.products.find_one({"_id": ObjectId(payload.product_id), "vendor_id": user["id"]})
        if not prod:
            raise HTTPException(status_code=404, detail="Product not found in your inventory.")

        now = now_iso()
        prev_snapshot = {
            "name": prod.get("name"),
            "price": prod.get("price"),
            "stock_quantity": prod.get("stock_quantity"),
            "in_stock": prod.get("in_stock"),
        }

        if payload.operation == "delete_product":
            await db.products.delete_one({"_id": prod["_id"]})
            await db.inventory_change_history.insert_one({
                "history_id": f"HIST-{uuid.uuid4().hex[:10].upper()}",
                "product_id": payload.product_id,
                "seller_id": user["id"],
                "operation_type": "voice_delete",
                "previous_value": prev_snapshot,
                "new_value": {"deleted": True},
                "source": "voice",
                "voice_session_id": payload.session_id,
                "created_at": now,
            })
            await write_audit_log(user["id"], "vendor", "voice_product_deleted", product_id=payload.product_id, seller_id=user["id"], previous_value=prev_snapshot, reason=payload.reason)
            return {"ok": True, "deleted": True, "product_id": payload.product_id}

        update_doc: Dict[str, Any] = {"updated_at": now}
        if payload.operation == "stock_addition":
            cur = float(prod.get("stock_quantity") or 0)
            new_q = max(0.0, cur + float(payload.stock_delta or 0))
            update_doc["stock_quantity"] = new_q
            update_doc["in_stock"] = new_q > 0
        elif payload.operation == "stock_replacement":
            new_q = max(0.0, float(payload.new_stock_quantity or 0))
            update_doc["stock_quantity"] = new_q
            update_doc["in_stock"] = new_q > 0
        elif payload.operation == "price_update":
            if not payload.new_price or payload.new_price <= 0:
                raise HTTPException(status_code=400, detail="Please enter a valid positive price.")
            update_doc["price"] = float(payload.new_price)
        elif payload.operation == "availability_update":
            update_doc["in_stock"] = bool(payload.new_in_stock)

        await db.products.update_one({"_id": prod["_id"]}, {"$set": update_doc})
        fresh = await db.products.find_one({"_id": prod["_id"]})
        fresh["id"] = str(fresh["_id"])
        fresh.pop("_id", None)

        await db.inventory_change_history.insert_one({
            "history_id": f"HIST-{uuid.uuid4().hex[:10].upper()}",
            "product_id": fresh["id"],
            "seller_id": user["id"],
            "operation_type": payload.operation,
            "previous_value": prev_snapshot,
            "new_value": update_doc,
            "source": "voice",
            "voice_session_id": payload.session_id,
            "created_at": now,
        })
        await write_audit_log(
            user["id"], "vendor", f"voice_edit_{payload.operation}", product_id=fresh["id"], seller_id=user["id"],
            previous_value=prev_snapshot, new_value=update_doc, reason=payload.reason,
        )
        return {"ok": True, "product": fresh}

    @router.get("/voice-inventory/history")
    async def get_vendor_voice_history(limit: int = 30, user: dict = Depends(require_vendor)):
        docs = await db.inventory_change_history.find({"seller_id": user["id"]}).sort("created_at", -1).limit(limit).to_list(limit)
        for d in docs:
            d["id"] = str(d.get("_id", ""))
            d.pop("_id", None)
        return {"history": docs}

    # ---------- PUBLIC / CONSUMER TRANSLATION DICTIONARY ENDPOINT ----------
    @router.get("/voice-inventory/dictionary")
    async def get_public_dictionary():
        return await get_dictionary()

    # ---------- SUPER ADMIN ENDPOINTS (Sections 24–30) ----------

    @router.get("/admin/voice-inventory/dashboard")
    async def admin_voice_dashboard(admin: dict = Depends(require_admin)):
        cfg = await get_settings()
        sessions = await db.voice_inventory_sessions.find({}).sort("created_at", -1).limit(500).to_list(500)
        voice_products = await db.products.find({"created_via": "voice"}).sort("created_at", -1).limit(500).to_list(500)
        duplicate_detections = sum(int(s.get("duplicate_count", 0)) for s in sessions)

        total_attempts = len(sessions)
        successful_transcriptions = sum(1 for s in sessions if s.get("transcript_raw"))
        failed_transcriptions = total_attempts - successful_transcriptions
        products_extracted = sum(int(s.get("extracted_count", 0)) for s in sessions)
        products_published = len(voice_products)
        awaiting_verification = sum(1 for s in sessions if s.get("status") == "awaiting_verification")
        products_rejected = sum(1 for p in voice_products if p.get("moderation_status") == "rejected")
        pending_moderation = sum(1 for p in voice_products if p.get("moderation_status") in ("pending_review", "flagged"))

        avg_ms = round(sum(int(s.get("processing_ms", 0)) for s in sessions) / max(1, total_attempts), 1)

        lang_usage = {"en": 0, "hi": 0, "hinglish": 0}
        seller_type_usage = {"retailer": 0, "cart_vendor": 0}
        seller_counts: Dict[str, Dict[str, Any]] = {}

        for s in sessions:
            lg = s.get("detected_language", "en")
            lang_usage[lg] = lang_usage.get(lg, 0) + 1
            st = s.get("seller_type", "retailer")
            seller_type_usage[st] = seller_type_usage.get(st, 0) + 1
            sid = s.get("seller_id") or "unknown"
            if sid not in seller_counts:
                seller_counts[sid] = {"seller_id": sid, "seller_name": s.get("seller_name") or sid, "seller_type": st, "attempts": 0, "published": 0}
            seller_counts[sid]["attempts"] += 1
            seller_counts[sid]["published"] += int(s.get("published_count", 0))

        for s in sessions:
            s["id"] = str(s.get("_id", ""))
            s.pop("_id", None)

        return {
            "settings": cfg,
            "kpis": {
                "total_voice_attempts": total_attempts,
                "successful_transcriptions": successful_transcriptions,
                "failed_transcriptions": failed_transcriptions,
                "products_extracted": products_extracted,
                "products_published": products_published,
                "products_awaiting_verification": awaiting_verification,
                "products_rejected": products_rejected,
                "pending_moderation": pending_moderation,
                "duplicate_detections": duplicate_detections,
                "avg_processing_ms": avg_ms,
            },
            "language_usage": lang_usage,
            "seller_type_usage": seller_type_usage,
            "top_sellers": sorted(seller_counts.values(), key=lambda x: -x["attempts"])[:20],
            "recent_sessions": sessions[:50],
        }

    @router.get("/admin/voice-inventory/settings")
    async def admin_get_voice_settings(admin: dict = Depends(require_admin)):
        return await get_settings()

    @router.patch("/admin/voice-inventory/settings")
    async def admin_update_voice_settings(payload: AdminVoiceSettingsPatch, admin: dict = Depends(require_admin)):
        prev = await get_settings()
        updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
        updates["updated_at"] = now_iso()
        updates["updated_by"] = admin["id"]
        await db.voice_feature_settings.update_one({"_id": "global_voice_config"}, {"$set": updates}, upsert=True)
        await write_audit_log(admin["id"], "admin", "admin_voice_settings_updated", previous_value=prev, new_value=updates, source="admin")
        return await get_settings()

    @router.post("/admin/voice-inventory/seller-override")
    async def admin_set_seller_voice_override(payload: AdminSellerVoiceOverride, admin: dict = Depends(require_admin)):
        cfg = await get_settings()
        overrides = cfg.get("seller_overrides") or {}
        overrides[payload.seller_id] = {
            "enabled": payload.enabled,
            "reason": payload.reason or "Updated by Super Admin",
            "updated_at": now_iso(),
            "updated_by": admin["id"],
        }
        await db.voice_feature_settings.update_one(
            {"_id": "global_voice_config"},
            {"$set": {"seller_overrides": overrides, "updated_at": now_iso()}},
            upsert=True,
        )
        await write_audit_log(
            admin["id"], "admin", "admin_seller_voice_override", seller_id=payload.seller_id,
            new_value=overrides[payload.seller_id], source="admin", reason=payload.reason,
        )
        return {"ok": True, "seller_overrides": overrides}

    @router.get("/admin/voice-inventory/products")
    async def admin_list_voice_products(
        moderation_status: Optional[str] = Query(None),
        seller_type: Optional[str] = Query(None),
        category: Optional[str] = Query(None),
        q: Optional[str] = Query(None),
        admin: dict = Depends(require_admin),
    ):
        query: Dict[str, Any] = {"created_via": "voice"}
        if moderation_status and moderation_status != "all":
            query["moderation_status"] = moderation_status
        if seller_type and seller_type != "all":
            query["vendor_type"] = seller_type
        if category and category != "all":
            query["category"] = category
        docs = await db.products.find(query).sort("created_at", -1).limit(300).to_list(300)
        results = []
        for d in docs:
            d["id"] = str(d["_id"])
            d.pop("_id", None)
            if q and q.strip():
                ql = q.strip().lower()
                if not any(ql in str(d.get(f, "")).lower() for f in ["name", "name_en", "name_hi", "name_hinglish", "vendor_shop", "vendor_name"]):
                    continue
            results.append(d)
        return results

    @router.post("/admin/voice-inventory/products/{product_id}/moderate")
    async def admin_moderate_voice_product(product_id: str, payload: AdminModerationAction, admin: dict = Depends(require_admin)):
        prod = await db.products.find_one({"_id": ObjectId(product_id)})
        if not prod:
            raise HTTPException(status_code=404, detail="Product not found")
        prev_val = {
            "moderation_status": prod.get("moderation_status"),
            "in_stock": prod.get("in_stock"),
            "name_en": prod.get("name_en"),
            "name_hi": prod.get("name_hi"),
            "price": prod.get("price"),
        }
        update: Dict[str, Any] = {"updated_at": now_iso(), "moderated_by": admin["id"], "moderation_reason": payload.reason}
        if payload.action == "approve":
            update["moderation_status"] = "approved"
        elif payload.action == "reject":
            update["moderation_status"] = "rejected"
            update["in_stock"] = False
        elif payload.action == "request_correction":
            update["moderation_status"] = "correction_requested"
        elif payload.action == "flag":
            update["moderation_status"] = "flagged"
        elif payload.action == "suspend":
            update["moderation_status"] = "suspended"
            update["in_stock"] = False
        elif payload.action == "restore":
            update["moderation_status"] = "approved"
            update["in_stock"] = True
        elif payload.action == "edit":
            if payload.name_en:
                update["name"] = payload.name_en
                update["name_lower"] = payload.name_en.lower()
                update["name_en"] = payload.name_en
            if payload.name_hi:
                update["name_hi"] = payload.name_hi
            if payload.name_hinglish:
                update["name_hinglish"] = payload.name_hinglish
            if payload.category:
                update["category"] = payload.category
            if payload.price is not None:
                update["price"] = float(payload.price)
            if payload.unit:
                update["unit"] = payload.unit

        await db.products.update_one({"_id": prod["_id"]}, {"$set": update})
        fresh = await db.products.find_one({"_id": prod["_id"]})
        fresh["id"] = str(fresh["_id"])
        fresh.pop("_id", None)
        await write_audit_log(
            admin["id"], "admin", f"admin_product_moderation_{payload.action}",
            product_id=product_id, seller_id=prod.get("vendor_id"),
            previous_value=prev_val, new_value=update, source="admin", reason=payload.reason,
        )
        return fresh

    @router.get("/admin/voice-inventory/translations")
    async def admin_list_translations(admin: dict = Depends(require_admin)):
        return await get_dictionary()

    @router.post("/admin/voice-inventory/translations")
    async def admin_upsert_translation(payload: AdminTranslationUpsert, admin: dict = Depends(require_admin)):
        cid = (payload.canonical_id or "").strip() or f"PROD-{uuid.uuid4().hex[:6].upper()}"
        existing = await db.product_translations.find_one({"canonical_id": cid})
        syns = list(set([s.strip().lower() for s in payload.synonyms if s.strip()] + [
            payload.canonical_name.lower(),
            payload.name_en.lower(),
            payload.name_hi.strip(),
            payload.name_hinglish.lower(),
        ]))
        doc = {
            "canonical_id": cid,
            "canonical_name": payload.canonical_name.strip(),
            "name_en": payload.name_en.strip(),
            "name_hi": payload.name_hi.strip(),
            "name_hinglish": payload.name_hinglish.strip(),
            "category": payload.category,
            "default_unit": payload.default_unit.upper(),
            "synonyms": syns,
            "approved": payload.approved,
            "updated_at": now_iso(),
            "updated_by": admin["id"],
        }
        if existing:
            await db.product_translations.update_one({"_id": existing["_id"]}, {"$set": doc})
        else:
            doc["created_at"] = now_iso()
            doc["source"] = "admin"
            await db.product_translations.insert_one(doc)
        await write_audit_log(admin["id"], "admin", "admin_translation_upserted", new_value=doc, source="admin")
        return await get_dictionary()

    @router.delete("/admin/voice-inventory/translations/{canonical_id}")
    async def admin_delete_translation(canonical_id: str, admin: dict = Depends(require_admin)):
        await db.product_translations.delete_one({"canonical_id": canonical_id})
        await write_audit_log(admin["id"], "admin", "admin_translation_deleted", new_value={"canonical_id": canonical_id}, source="admin")
        return {"ok": True}

    @router.get("/admin/voice-inventory/audit-logs")
    async def admin_get_voice_audit_logs(limit: int = 100, admin: dict = Depends(require_admin)):
        docs = await db.voice_audit_logs.find({}).sort("timestamp", -1).limit(limit).to_list(limit)
        for d in docs:
            d["id"] = str(d.get("_id", ""))
            d.pop("_id", None)
        return docs

    return router
