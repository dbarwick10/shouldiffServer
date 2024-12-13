const cache = {
    versions: [],
    items: new Map(), // Use Map for better performance with frequent lookups
    lastFetch: null,
    ttl: 1000 * 60 * 60 // 1 hour cache
};

// Clear the cache when the server starts
export function clearCacheOnStart() {
    cache.versions = [];
    cache.items.clear();
    cache.lastFetch = null;
}

async function getVersions() {
    if (cache.versions.length > 0) {
        return cache.versions;
    }

    try {
        const response = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
        const versions = await response.json();
        cache.versions = versions.slice(0, 3); // Cache the last 3 versions
        cache.lastFetch = Date.now();
        return cache.versions;
    } catch (error) {
        console.error('Error fetching versions:', error);
        if (cache.versions.length > 0) {
            return cache.versions; // Use cached versions as fallback
        }
        throw error;
    }
}

async function fetchItemData(version) {
    if (!cache.items.has(version)) {
        const response = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/item.json`);
        const itemData = await response.json();
        cache.items.set(version, itemData.data);
    }
    return cache.items.get(version);
}

export async function getItemsAndPrices() {
    const versions = await getVersions();

    for (const version of versions) {
        await fetchItemData(version);
    }

    return cache.items;
}

export async function getItemDetails(itemId) {
    try {
        const itemsCache = await getItemsAndPrices();

        for (const [version, items] of itemsCache) {
            if (items[itemId]) {
                const item = items[itemId];
                return {
                    id: itemId,
                    name: item.name,
                    gold: item.gold,
                    description: item.description,
                    stats: item.stats,
                    // Add any other properties you need
                };
            }
        }

        throw new Error(`Item ${itemId} not found in the last 3 versions`);
    } catch (error) {
        console.error('Error in getItemDetails:', error);
        throw error;
    }
}

// Cache management functions
export function clearCache() {
    cache.versions = [];
    cache.items.clear();
    cache.lastFetch = null;
}

export function getCacheStats() {
    return {
        currentVersions: cache.versions,
        lastFetched: cache.lastFetch,
        cachedItemsCount: cache.items.size,
        cachedItems: Array.from(cache.items.keys())
    };
}

export function resetDestroyedItemsTracking() {
    destroyedItems.clear();
}
