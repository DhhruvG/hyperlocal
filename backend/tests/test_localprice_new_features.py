"""Tests for iteration-2 features: categories, stats, discover, vendors, reviews,
saved, messages, i-need requests, vendor profile update, seed data."""
import os
import uuid
import pytest
import requests

BASE_URL = (os.environ.get('REACT_APP_BACKEND_URL') or 'https://hyperlocal-deals-6.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

UNIQUE = uuid.uuid4().hex[:8]
CONS_EMAIL = f"test_cons2_{UNIQUE}@qa.example.com"
VEND_EMAIL = f"test_vend2_{UNIQUE}@qa.example.com"
VEND2_EMAIL = f"test_vend2b_{UNIQUE}@qa.example.com"
PASSWORD = "Test@1234"


@pytest.fixture(scope="module")
def consumer():
    s = requests.Session()
    r = s.post(f"{API}/auth/consumer/register", json={
        "name": "QA Cons2", "email": CONS_EMAIL, "password": PASSWORD, "phone": "9990001111"
    })
    assert r.status_code == 200, r.text
    d = r.json()
    s.headers.update({"Authorization": f"Bearer {d['token']}"})
    s.user = d['user']
    return s


@pytest.fixture(scope="module")
def vendor():
    s = requests.Session()
    r = s.post(f"{API}/auth/vendor/register", json={
        "name": "QA V2", "email": VEND_EMAIL, "password": PASSWORD, "phone": "9990002222",
        "shop_name": "QA Shop2", "shop_address": "Rajpur Rd", "vendor_type": "cart_vendor",
        "lat": 30.32, "lng": 78.03
    })
    assert r.status_code == 200, r.text
    d = r.json()
    s.headers.update({"Authorization": f"Bearer {d['token']}"})
    s.user = d['user']
    # add one veg product
    r2 = s.post(f"{API}/vendor/products", json={
        "name": f"Onion_{UNIQUE}", "category": "vegetables", "price": 30.0, "unit": "kg"
    })
    assert r2.status_code == 200
    s.product_id = r2.json()['id']
    return s


@pytest.fixture(scope="module")
def vendor2():
    s = requests.Session()
    r = s.post(f"{API}/auth/vendor/register", json={
        "name": "QA V2b", "email": VEND2_EMAIL, "password": PASSWORD, "phone": "9990002233",
        "shop_name": "QA Shop2b", "shop_address": "Karanpur", "vendor_type": "retailer",
        "lat": 30.33, "lng": 78.04
    })
    assert r.status_code == 200
    d = r.json()
    s.headers.update({"Authorization": f"Bearer {d['token']}"})
    s.user = d['user']
    return s


# ---- Categories & Stats ----
class TestMeta:
    def test_categories(self):
        r = requests.get(f"{API}/categories")
        assert r.status_code == 200
        cats = r.json()
        assert len(cats) == 12
        for c in cats:
            assert "key" in c and "label" in c and "emoji" in c
        keys = {c['key'] for c in cats}
        assert {"vegetables", "fruits", "dairy", "other"}.issubset(keys)

    def test_stats_overview(self):
        r = requests.get(f"{API}/stats/overview")
        assert r.status_code == 200
        d = r.json()
        assert "vendor_count" in d and "online_count" in d and "product_count" in d
        assert d["product_count"] > 0  # from seed


# ---- Discover ----
class TestDiscover:
    def test_today_prices(self):
        r = requests.get(f"{API}/discover/today-prices", params={"limit": 20})
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        # unique product names
        names = [x['name'] for x in rows]
        assert len(names) == len(set(n.lower() for n in names))
        # each row has price
        for row in rows:
            assert "price" in row and row['price'] > 0

    def test_popular(self):
        r = requests.get(f"{API}/discover/popular", params={"limit": 8})
        assert r.status_code == 200
        items = r.json()
        assert len(items) <= 8
        for it in items:
            assert it.get("in_stock") is True
            assert "distance_label" in it


# ---- Vendors list / detail ----
class TestVendorsPublic:
    def test_list_vendors(self, vendor):
        r = requests.get(f"{API}/vendors", params={"limit": 50})
        assert r.status_code == 200
        vs = r.json()
        assert len(vs) > 0
        v0 = vs[0]
        for k in ("distance_km", "distance_label", "avg_rating", "product_count", "shop_name"):
            assert k in v0

    def test_filter_by_category_veg(self, vendor):
        r = requests.get(f"{API}/vendors", params={"category": "vegetables", "limit": 50})
        assert r.status_code == 200
        vs = r.json()
        ids = {v['id'] for v in vs}
        assert vendor.user['id'] in ids  # our vendor sells vegetables

    def test_sort_rating_and_products(self):
        r1 = requests.get(f"{API}/vendors", params={"sort": "rating", "limit": 20}).json()
        r2 = requests.get(f"{API}/vendors", params={"sort": "products", "limit": 20}).json()
        # rating: descending
        ratings = [v['avg_rating'] for v in r1]
        assert ratings == sorted(ratings, reverse=True)
        counts = [v['product_count'] for v in r2]
        assert counts == sorted(counts, reverse=True)

    def test_vendor_detail(self, vendor):
        r = requests.get(f"{API}/vendors/{vendor.user['id']}")
        assert r.status_code == 200
        d = r.json()
        assert "vendor" in d and "products" in d and "reviews" in d
        assert d['vendor']['id'] == vendor.user['id']
        assert any(p['name'].startswith("Onion_") for p in d['products'])


# ---- Reviews ----
class TestReviews:
    def test_create_and_upsert_review(self, consumer, vendor):
        r = consumer.post(f"{API}/vendors/{vendor.user['id']}/reviews", json={
            "rating": 5, "comment": "Great!"
        })
        assert r.status_code == 200
        # second submission upserts (still one review)
        r2 = consumer.post(f"{API}/vendors/{vendor.user['id']}/reviews", json={
            "rating": 4, "comment": "Updated"
        })
        assert r2.status_code == 200
        # verify vendor stats reflect
        r3 = requests.get(f"{API}/vendors/{vendor.user['id']}")
        vd = r3.json()['vendor']
        assert vd['review_count'] >= 1
        assert 3.5 <= vd['avg_rating'] <= 5.0
        # only one review by consumer
        reviews = r3.json()['reviews']
        mine = [rv for rv in reviews if rv.get('consumer_id') == consumer.user['id']]
        assert len(mine) == 1
        assert mine[0]['rating'] == 4


# ---- Saved ----
class TestSaved:
    def test_saved_toggle_and_list(self, consumer, vendor):
        pid = vendor.product_id
        # add
        r = consumer.post(f"{API}/saved/toggle", params={"product_id": pid})
        assert r.status_code == 200
        assert r.json()['saved'] is True
        # list
        r2 = consumer.get(f"{API}/saved")
        assert r2.status_code == 200
        assert any(p['id'] == pid for p in r2.json())
        # toggle off
        r3 = consumer.post(f"{API}/saved/toggle", params={"product_id": pid})
        assert r3.json()['saved'] is False
        r4 = consumer.get(f"{API}/saved").json()
        assert not any(p['id'] == pid for p in r4)


# ---- Messages ----
class TestMessages:
    def test_send_and_thread(self, consumer, vendor):
        # consumer -> vendor
        r = consumer.post(f"{API}/messages/send", json={
            "to_user_id": vendor.user['id'], "body": "Hi, price for onion?"
        })
        assert r.status_code == 200, r.text
        # vendor replies
        r2 = vendor.post(f"{API}/messages/send", json={
            "to_user_id": consumer.user['id'], "body": "30/kg"
        })
        assert r2.status_code == 200
        # threads (consumer side)
        rt = consumer.get(f"{API}/messages/threads")
        assert rt.status_code == 200
        threads = rt.json()
        assert any(t['other_id'] == vendor.user['id'] for t in threads)
        # full thread
        rf = consumer.get(f"{API}/messages/thread/{vendor.user['id']}")
        assert rf.status_code == 200
        data = rf.json()
        assert len(data['messages']) >= 2
        assert data['other']['id'] == vendor.user['id']
        # after GET, incoming messages should be marked read → re-fetch threads and see unread false
        rt2 = consumer.get(f"{API}/messages/threads").json()
        for t in rt2:
            if t['other_id'] == vendor.user['id']:
                assert t['unread'] is False


# ---- I need (requests) ----
class TestRequests:
    def test_request_flow(self, consumer, vendor, vendor2):
        # consumer creates
        r = consumer.post(f"{API}/requests", json={
            "item": f"Cabbage_{UNIQUE}", "quantity": "2 kg",
            "category": "vegetables", "note": "fresh please"
        })
        assert r.status_code == 200
        req_id = r.json()['id']
        # vendor sees open list
        ro = vendor.get(f"{API}/requests/open")
        assert ro.status_code == 200
        open_list = ro.json()
        assert any(x['id'] == req_id for x in open_list)
        # vendor replies
        r2 = vendor.post(f"{API}/requests/{req_id}/reply", json={"price": 40.0, "note": "have it"})
        assert r2.status_code == 200
        # replied_by_me flag now true
        ro2 = vendor.get(f"{API}/requests/open").json()
        me_row = [x for x in ro2 if x['id'] == req_id][0]
        assert me_row['replied_by_me'] is True
        # upsert: second reply doesn't duplicate
        r3 = vendor.post(f"{API}/requests/{req_id}/reply", json={"price": 35.0})
        assert r3.status_code == 200
        # vendor2 reply too
        rv2 = vendor2.post(f"{API}/requests/{req_id}/reply", json={"price": 50.0})
        assert rv2.status_code == 200
        # replies sorted by price asc
        rr = consumer.get(f"{API}/requests/{req_id}/replies")
        assert rr.status_code == 200
        replies = rr.json()
        prices = [x['price'] for x in replies]
        assert prices == sorted(prices)
        assert len(replies) == 2  # one per vendor
        # consumer /requests/my shows reply_count
        rm = consumer.get(f"{API}/requests/my").json()
        mine = [x for x in rm if x['id'] == req_id][0]
        assert mine['reply_count'] == 2


# ---- Vendor profile patch propagates ----
class TestVendorProfilePatch:
    def test_patch_shop_name_propagates(self, vendor):
        new_name = f"Renamed_{UNIQUE}"
        new_addr = "New Address 123"
        r = vendor.patch(f"{API}/vendor/profile", json={
            "shop_name": new_name, "shop_address": new_addr,
            "opening_hours": "9:00 AM - 8:00 PM", "is_online": True
        })
        assert r.status_code == 200, r.text
        u = r.json()
        assert u['shop_name'] == new_name
        assert u['is_online'] is True
        # products should reflect
        rp = vendor.get(f"{API}/vendor/products").json()
        assert all(p['vendor_shop'] == new_name for p in rp)
        assert all(p['vendor_address'] == new_addr for p in rp)
        # public profile too
        pub = requests.get(f"{API}/vendors/{vendor.user['id']}").json()['vendor']
        assert pub['shop_name'] == new_name
        assert pub['is_online'] is True


# ---- Seed data ----
class TestSeed:
    def test_seed_vendors_exist(self):
        r = requests.get(f"{API}/vendors", params={"limit": 50}).json()
        # seed shop_names
        names = {v['shop_name'] for v in r}
        assert any("Munna Vegetable Cart" == n or "Doon Fruit Mandi" == n for n in names)
        # some cart_vendors online
        carts_online = [v for v in r if v['vendor_type'] == 'cart_vendor' and v['is_online']]
        assert len(carts_online) >= 1
        # some retailers
        retailers = [v for v in r if v['vendor_type'] == 'retailer']
        assert len(retailers) >= 3
