// ============================================
// SERVICE WORKER FOR PURCHASE TRACKER PWA
// ============================================
// This service worker enables offline functionality by caching
// essential files and providing offline fallbacks

// Cache version - increment this when you update cached files
const CACHE_VERSION = 'purchase-tracker-v1';

// Files to cache for offline use
const STATIC_CACHE_FILES = [
    '/',
    '/index.html',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png'
];

// ============================================
// INSTALL EVENT - Cache essential files
// ============================================
self.addEventListener('install', (event) => {
    console.log('Service Worker: Installing...');
    
    // Force the waiting service worker to become active
    self.skipWaiting();
    
    // Cache essential files
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then(cache => {
                console.log('Service Worker: Caching files');
                // Add all static files to cache
                return cache.addAll(STATIC_CACHE_FILES);
            })
            .then(() => console.log('Service Worker: Files cached'))
            .catch(err => console.error('Service Worker: Cache failed', err))
    );
});

// ============================================
// ACTIVATE EVENT - Clean up old caches
// ============================================
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activating...');
    
    // Remove old caches
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    // Delete caches that don't match current version
                    if (cacheName !== CACHE_VERSION) {
                        console.log('Service Worker: Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            // Take control of all pages immediately
            return self.clients.claim();
        })
    );
});

// ============================================
// FETCH EVENT - Serve cached files when offline
// ============================================
self.addEventListener('fetch', (event) => {
    // Parse the URL
    const url = new URL(event.request.url);
    
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }
    
    // Skip cross-origin requests (like Google Analytics, external APIs)
    if (url.origin !== self.location.origin) {
        return;
    }
    
    // Handle the request
    event.respondWith(
        // Try cache first strategy for static assets
        caches.match(event.request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    // Return cached version
                    return cachedResponse;
                }
                
                // Not in cache, fetch from network
                return fetch(event.request)
                    .then(response => {
                        // Don't cache non-successful responses
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }
                        
                        // Clone the response since we need to use it twice
                        const responseToCache = response.clone();
                        
                        // Add to cache for future use
                        caches.open(CACHE_VERSION)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            });
                        
                        return response;
                    })
                    .catch(() => {
                        // Network failed, return offline page if it's a navigation request
                        if (event.request.mode === 'navigate') {
                            return caches.match('/index.html');
                        }
                    });
            })
    );
});

// ============================================
// BACKGROUND SYNC - Sync data when back online
// ============================================
// This feature allows the app to sync data when connectivity is restored
// Note: This is not supported on all browsers yet

self.addEventListener('sync', (event) => {
    console.log('Service Worker: Sync event triggered');
    
    if (event.tag === 'sync-purchases') {
        event.waitUntil(
            // Send a message to all clients to trigger sync
            self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                    client.postMessage({
                        type: 'SYNC_PURCHASES'
                    });
                });
            })
        );
    }
});

// ============================================
// PUSH NOTIFICATIONS - Future enhancement
// ============================================
// You can add push notification support here for reminders
// Example: Daily spending limit notifications

self.addEventListener('push', (event) => {
    // Handle push notifications when implemented
    console.log('Service Worker: Push notification received');
});

// ============================================
// MESSAGE EVENT - Handle messages from the app
// ============================================
self.addEventListener('message', (event) => {
    console.log('Service Worker: Message received', event.data);
    
    // Handle different message types
    switch(event.data.type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;
        case 'CLEAR_CACHE':
            caches.delete(CACHE_VERSION);
            break;
    }
});