const cache = {
    versions: [],
    items: new Map(),
    lastFetch: null,
    itemDetails: new Map(), // New cache specifically for processed item details
    ttl: 1000 * 60 * 60 * 24 // 24 hour cache
};

// Initialize cache at start
export async function initializeCache() {
    if (cache.versions.length === 0 || isStale()) {
        await getVersions();
        await getItemsAndPrices();
    }
}

function isStale() {
    return !cache.lastFetch || (Date.now() - cache.lastFetch) > cache.ttl;
}

async function getVersions() {
    if (cache.versions.length > 0 && !isStale()) {
        return cache.versions;
    }

    try {
        const response = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
        const versions = await response.json();
        cache.versions = versions.slice(0, 3);
        cache.lastFetch = Date.now();
        return cache.versions;
    } catch (error) {
        console.error('Error fetching versions:', error);
        if (cache.versions.length > 0) {
            return cache.versions;
        }
        throw error;
    }
}

async function fetchItemData(version) {
    if (!cache.items.has(version)) {
        const currentVersions = await getVersions();

        if (!currentVersions.includes(version)) {
            // New unseen version; refresh versions and full item cache
            console.log(`New version detected: ${version}. Refreshing cache.`);
            cache.versions = []; // Clear to force refresh
            await initializeCache();
        } else {
            // It's one of the known versions, fetch it directly
            const response = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/item.json`);
            const itemData = await response.json();
            cache.items.set(version, itemData.data);
        }
    }
    return cache.items.get(version);
}


async function getItemsAndPrices() {
    if (cache.items.size > 0 && !isStale()) {
        return cache.items;
    }

    const versions = await getVersions();
    for (const version of versions) {
        await fetchItemData(version);
    }
    return cache.items;
}

export async function getItemDetails(itemId) {
    try {
        const itemsCache = await getItemsAndPrices();
        // console.log('Cache state when getting item details:', {
        //     itemId,
        //     cacheSize: itemsCache.size,
        //     versions: Array.from(itemsCache.keys())
        // });

        for (const [version, items] of itemsCache) {
            if (items[itemId]) {
                const item = items[itemId];
                // console.log(`Found item ${itemId} in version ${version}:`, {
                //     name: item.name,
                //     goldInfo: item.gold
                // });
                return {
                    id: itemId,
                    name: item.name,
                    gold: item.gold, // This contains {base, purchasable, total, sell}
                    description: item.description,
                    stats: item.stats,
                };
            }
        }

        console.warn(`Item ${itemId} not found in any version`);
        return null;
    } catch (error) {
        console.error('Error in getItemDetails:', error);
        throw error;
    }
}

export function clearCache() {
    cache.versions = [];
    cache.items.clear();
    cache.itemDetails.clear();
    cache.lastFetch = null;
}

export function getCacheStats() {
    return {
        currentVersions: cache.versions,
        lastFetched: cache.lastFetch,
        cachedItemsCount: cache.items.size,
        cachedItemDetailsCount: cache.itemDetails.size,
        cachedItems: Array.from(cache.items.keys()),
        isStale: isStale()
    };
}
