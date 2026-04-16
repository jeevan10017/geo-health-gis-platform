
const DB_NAME    = 'geohealth-offline';
const DB_VERSION = 1;

const STORES = {
    HOSPITALS:  'hospitals',
    ROUTES:     'routes',
    DOCTORS:    'doctors',
    META:       'meta',
};

// ─── Open DB ──────────────────────────────────────────────────────────────────

let _db = null;

export const openDB = () => new Promise((resolve, reject) => {
    if (_db) return resolve(_db);

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
        const db = e.target.result;

        // Hospitals store — keyed by hospital_id
        if (!db.objectStoreNames.contains(STORES.HOSPITALS)) {
            db.createObjectStore(STORES.HOSPITALS, { keyPath: 'hospital_id' });
        }

        // Routes store — keyed by hospital_id (one best route per hospital)
        if (!db.objectStoreNames.contains(STORES.ROUTES)) {
            const routeStore = db.createObjectStore(STORES.ROUTES, { keyPath: 'hospital_id' });
            routeStore.createIndex('cached_at', 'cached_at');
        }

        // Doctor availability — keyed by hospital_id
        if (!db.objectStoreNames.contains(STORES.DOCTORS)) {
            db.createObjectStore(STORES.DOCTORS, { keyPath: 'hospital_id' });
        }

        // Meta — last sync time, user location when cached, etc.
        if (!db.objectStoreNames.contains(STORES.META)) {
            db.createObjectStore(STORES.META, { keyPath: 'key' });
        }
    };

    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror   = ()  => reject(new Error('Failed to open IndexedDB'));
});

// ─── Generic helpers ──────────────────────────────────────────────────────────

const tx = async (storeName, mode, fn) => {
    const db    = await openDB();
    const trans = db.transaction(storeName, mode);
    const store = trans.objectStore(storeName);
    return new Promise((resolve, reject) => {
        const req      = fn(store);
        req.onsuccess  = () => resolve(req.result);
        req.onerror    = () => reject(req.error);
    });
};

const getAll = async (storeName) => {
    const db    = await openDB();
    const trans = db.transaction(storeName, 'readonly');
    const store = trans.objectStore(storeName);
    return new Promise((resolve, reject) => {
        const req     = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
    });
};

// ─── Hospitals ────────────────────────────────────────────────────────────────

export const saveHospitals = async (hospitals) => {
    const db    = await openDB();
    const trans = db.transaction(STORES.HOSPITALS, 'readwrite');
    const store = trans.objectStore(STORES.HOSPITALS);
    hospitals.forEach(h => store.put(h));
    await saveMeta('hospitals_cached_at', Date.now());
    await saveMeta('hospitals_count', hospitals.length);
    return new Promise((res, rej) => {
        trans.oncomplete = res;
        trans.onerror    = rej;
    });
};

export const getOfflineHospitals = () => getAll(STORES.HOSPITALS);

// ─── Routes ───────────────────────────────────────────────────────────────────

export const saveRoute = async (hospitalId, routeData) => {
    const db    = await openDB();
    const trans = db.transaction(STORES.ROUTES, 'readwrite');
    const store = trans.objectStore(STORES.ROUTES);
    store.put({
        hospital_id: hospitalId,
        ...routeData,
        cached_at: Date.now(),
    });
    return new Promise((res, rej) => {
        trans.oncomplete = res;
        trans.onerror    = rej;
    });
};

export const getOfflineRoute = (hospitalId) =>
    tx(STORES.ROUTES, 'readonly', store => store.get(hospitalId));

export const getAllOfflineRoutes = () => getAll(STORES.ROUTES);

// ─── Doctors ──────────────────────────────────────────────────────────────────

export const saveDoctors = async (hospitalId, doctors) => {
    const db    = await openDB();
    const trans = db.transaction(STORES.DOCTORS, 'readwrite');
    const store = trans.objectStore(STORES.DOCTORS);
    store.put({ hospital_id: hospitalId, doctors, cached_at: Date.now() });
    return new Promise((res, rej) => {
        trans.oncomplete = res;
        trans.onerror    = rej;
    });
};

export const getOfflineDoctors = (hospitalId) =>
    tx(STORES.DOCTORS, 'readonly', store => store.get(hospitalId));

// ─── Meta ─────────────────────────────────────────────────────────────────────

export const saveMeta = (key, value) =>
    tx(STORES.META, 'readwrite', store => store.put({ key, value, updated_at: Date.now() }));

export const getMeta = (key) =>
    tx(STORES.META, 'readonly', store => store.get(key))
        .then(entry => entry?.value ?? null);

// ─── Cache status ─────────────────────────────────────────────────────────────

export const getCacheStatus = async () => {
    const [cachedAt, count] = await Promise.all([
        getMeta('hospitals_cached_at'),
        getMeta('hospitals_count'),
    ]);

    if (!cachedAt) return { hasCachedData: false };

    const ageMinutes = Math.round((Date.now() - cachedAt) / 60000);
    return {
        hasCachedData:  true,
        count:          count ?? 0,
        ageMinutes,
        ageLabel:       ageMinutes < 60
            ? `${ageMinutes} min ago`
            : `${Math.round(ageMinutes / 60)} hr ago`,
        isStale:        ageMinutes > 60,  // warn after 1 hour
    };
};

// ─── Clear all ───────────────────────────────────────────────────────────────

export const clearOfflineData = async () => {
    const db = await openDB();
    await Promise.all(Object.values(STORES).map(storeName => {
        const trans = db.transaction(storeName, 'readwrite');
        trans.objectStore(storeName).clear();
        return new Promise((res, rej) => {
            trans.oncomplete = res;
            trans.onerror    = rej;
        });
    }));
};