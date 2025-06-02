// ============================================
// SERVICE WORKER FOR PURCHASE TRACKER PWA
// ============================================
// This service worker enables offline functionality by caching
// essential files and providing offline fallbacks.
//
// UPDATED: Now uses "Network First" strategy for development-friendly updates
// - Always tries to get fresh content from the server first
// - Only falls back to cache when offline
// - Automatically updates cache with fresh content
//
// A service worker is a script that runs in the background, separate
// from your main web page. It acts like a proxy between your app and
// the network, allowing you to:
// - Cache files for offline use
// - Intercept network requests
// - Sync data in the background
// - Send push notifications

// Cache version - increment this when you update cached files
// This is like a "version number" for your cache. When you change
// this value, it forces the service worker to create a new cache
// and delete the old one, ensuring users get your latest files.
const CACHE_VERSION = 'purchase-tracker-smart-v1';

// Files to cache for offline use
// These are the essential files your app needs to work offline.
// The service worker will download and store these files locally
// so your app can still function without an internet connection.
const STATIC_CACHE_FILES = [
    '/',              // The root page (usually index.html)
    '/index.html',    // Your main HTML file
    '/manifest.json', // PWA manifest (tells browser how to install your app)
    '/icon-192.png',  // App icon for home screen
    '/icon-512.png'   // Larger app icon for splash screens
];

// ============================================
// INSTALL EVENT - Cache essential files
// ============================================
// The 'install' event fires when the service worker is first installed.
// This is where we download and cache all the files our app needs
// to work offline. Think of it like "downloading the app" for offline use.

self.addEventListener('install', (event) => {
    console.log('Service Worker: Installing...');
    
    // UPDATED: skipWaiting() forces this new service worker to become active immediately
    // instead of waiting for all tabs to close. This ensures users get
    // updates faster and is more development-friendly.
    self.skipWaiting();
    
    // waitUntil() tells the browser "don't finish installing until this promise resolves"
    // This ensures our caching process completes before the service worker is considered "installed"
    event.waitUntil(
        // Open (or create) a cache with our version name
        caches.open(CACHE_VERSION)
            .then(cache => {
                console.log('Service Worker: Caching files');
                // Download and store all our essential files
                // addAll() downloads each file and stores it in the cache
                return cache.addAll(STATIC_CACHE_FILES);
            })
            .then(() => console.log('Service Worker: Files cached successfully'))
            .catch(err => console.error('Service Worker: Cache failed', err))
    );
});

// ============================================
// ACTIVATE EVENT - Clean up old caches
// ============================================
// The 'activate' event fires after installation, when the service worker
// becomes the active one controlling your site. This is like "spring cleaning" -
// we delete old caches that are no longer needed.

self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activating...');
    
    event.waitUntil(
        // Get all existing cache names (there might be old versions)
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    // If this cache doesn't match our current version, delete it
                    // This prevents old cached files from taking up storage space
                    if (cacheName !== CACHE_VERSION) {
                        console.log('Service Worker: Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            // UPDATED: claim() makes this service worker take control of all existing pages immediately
            // Without this, the service worker would only control new page loads
            // This ensures updates take effect right away
            return self.clients.claim();
        })
    );
});

// ============================================
// FETCH EVENT - NETWORK FIRST STRATEGY (UPDATED)
// ============================================
// MAJOR CHANGE: This now uses "Network First" instead of "Cache First"
// 
// NETWORK FIRST STRATEGY:
// 1. Always try to get fresh content from the server first
// 2. If successful, cache the new version AND return it to the user
// 3. If network fails (offline), fall back to cached version
//
// This is much more development-friendly because:
// - Users always get the latest version when online
// - Developers don't fight with aggressive caching
// - Offline functionality is preserved when needed

self.addEventListener('fetch', (event) => {
    // Parse the URL to understand what's being requested
    const url = new URL(event.request.url);
    
    // Skip non-GET requests (like POST, PUT, DELETE)
    // We only cache GET requests because they're for retrieving data/files
    // Other request types are usually for sending data and shouldn't be cached
    if (event.request.method !== 'GET') {
        return;
    }
    
    // Skip cross-origin requests (requests to other websites)
    // We only want to cache files from our own domain for security
    // and to avoid caching external resources we don't control
    if (url.origin !== self.location.origin) {
        return;
    }
    
    // respondWith() lets us provide a custom response to this request
    // instead of letting it go to the network normally
    event.respondWith(
        // UPDATED: "Network First" strategy - Try network first, fall back to cache
        fetch(event.request)
            .then(response => {
                // Network request succeeded! 
                console.log('Service Worker: Got fresh content from network:', event.request.url);
                
                // Only cache successful responses from our own domain
                // - response exists
                // - status is 200 (OK)
                // - type is 'basic' (same-origin request)
                if (response && response.status === 200 && response.type === 'basic') {
                    // Clone the response because we need to use it twice:
                    // once to return to the app, once to store in cache
                    // Responses can only be read once, so we need a copy
                    const responseToCache = response.clone();
                    
                    // Store this fresh content in cache for offline use
                    caches.open(CACHE_VERSION)
                        .then(cache => {
                            cache.put(event.request, responseToCache);
                            console.log('Service Worker: Updated cache with fresh content:', event.request.url);
                        });
                }
                
                // Return the fresh response to the app
                return response;
            })
            .catch(() => {
                // Network request failed (user is offline or server is down)
                console.log('Service Worker: Network failed, trying cache for:', event.request.url);
                
                // Fall back to cached version
                return caches.match(event.request)
                    .then(cachedResponse => {
                        if (cachedResponse) {
                            console.log('Service Worker: Serving from cache:', event.request.url);
                            return cachedResponse;
                        }
                        
                        // For navigation requests (loading pages), serve the main page
                        // This ensures users can still access the app when offline
                        if (event.request.mode === 'navigate') {
                            return caches.match('/index.html');
                        }
                        
                        // For other requests, there's no good fallback
                        // The request will fail, but that's expected when offline
                    });
            })
    );
});

// ============================================
// BACKGROUND SYNC - Sync data when back online
// ============================================
// Background Sync allows your app to defer actions until the user has
// a stable internet connection. For example, if a user adds a purchase
// while offline, we can queue it and sync it when they're back online.
// Note: This feature is not supported in all browsers yet.

self.addEventListener('sync', (event) => {
    console.log('Service Worker: Sync event triggered with tag:', event.tag);
    
    // Check if this is a purchase sync request
    if (event.tag === 'sync-purchases') {
        event.waitUntil(
            // Send a message to all open tabs of your app
            // telling them to attempt syncing their pending purchases
            self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                    client.postMessage({
                        type: 'SYNC_PURCHASES'
                    });
                });
                console.log('Service Worker: Sent sync message to all clients');
            })
        );
    }
});

// ============================================
// PUSH NOTIFICATIONS - Future enhancement
// ============================================
// Push notifications let your app send messages to users even when
// the app isn't open. You could use this for spending reminders,
// budget alerts, or other helpful notifications.

self.addEventListener('push', (event) => {
    console.log('Service Worker: Push notification received');
    
    // Example of how you might handle push notifications:
    // const data = event.data ? event.data.json() : {};
    // const title = data.title || 'Purchase Tracker';
    // const options = {
    //     body: data.body || 'You have a new notification',
    //     icon: '/icon-192.png',
    //     badge: '/icon-192.png'
    // };
    // 
    // event.waitUntil(
    //     self.registration.showNotification(title, options)
    // );
});

// ============================================
// MESSAGE EVENT - Handle messages from the app (UPDATED)
// ============================================
// This allows your main app to communicate with the service worker.
// Your app can send messages to trigger specific actions like
// clearing caches or forcing updates.

self.addEventListener('message', (event) => {
    console.log('Service Worker: Message received from app:', event.data);
    
    // Handle different message types from your app
    switch(event.data.type) {
        case 'SKIP_WAITING':
            // Force this service worker to become active immediately
            // Useful when you want to apply updates right away
            console.log('Service Worker: Skipping waiting phase');
            self.skipWaiting();
            break;
            
        case 'FORCE_UPDATE':
            // NEW: Force immediate activation and reload
            // This is used by the development-friendly update system
            console.log('Service Worker: Force update requested');
            self.skipWaiting();
            break;
            
        case 'CLEAR_CACHE':
            // Clear all caches - useful for debugging or forcing fresh content
            console.log('Service Worker: Clearing all caches');
            caches.delete(CACHE_VERSION).then(() => {
                console.log('Service Worker: Cache cleared');
            });
            break;
            
        case 'GET_CACHE_STATUS':
            // Report cache status back to the app
            caches.keys().then(cacheNames => {
                event.ports[0].postMessage({
                    type: 'CACHE_STATUS',
                    caches: cacheNames,
                    currentVersion: CACHE_VERSION
                });
            });
            break;
            
        default:
            console.log('Service Worker: Unknown message type:', event.data.type);
    }
});

// ============================================
// ERROR HANDLING
// ============================================
// Handle any uncaught errors in the service worker
// This helps with debugging and prevents silent failures

self.addEventListener('error', (event) => {
    console.error('Service Worker: Error occurred:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
    console.error('Service Worker: Unhandled promise rejection:', event.reason);
});

// ============================================
// LOGGING AND DEBUGGING
// ============================================
// Log when the service worker is ready
console.log('📦 Service Worker: Script loaded and ready');
console.log('📦 Cache version:', CACHE_VERSION);
console.log('📦 Files to cache:', STATIC_CACHE_FILES);
console.log('📦 Strategy: Network First (development-friendly)');