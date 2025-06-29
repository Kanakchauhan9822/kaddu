// Search validation and retry logic
class SearchValidator {
    constructor() {
        this.searchCounters = {
            desktop: 0,
            mobile: 0
        };
        this.targetPoints = {
            desktop: 150, // 30 searches * 5 points
            mobile: 100   // 20 searches * 5 points
        };
        this.maxRetries = 2;
        this.retryDelay = 3000; // 3 seconds between retries
    }

    // Check if search was counted by Bing
    async validateSearch(tabId, searchType) {
        try {
            const result = await chrome.tabs.sendMessage(tabId, {
                action: "validateSearch",
                type: searchType
            });
            
            if (result && result.counted) {
                this.searchCounters[searchType]++;
                return true;
            }
            return false;
        } catch (error) {
            console.error("Search validation failed:", error);
            return false;
        }
    }

    // Get current points from Bing rewards indicators
    async getCurrentPoints(tabId) {
        try {
            const result = await chrome.tabs.sendMessage(tabId, {
                action: "getRewardsProgress"
            });
            return result || { desktop: 0, mobile: 0 };
        } catch (error) {
            console.error("Points check failed:", error);
            return { desktop: 0, mobile: 0 };
        }
    }

    // Check if target points reached
    hasReachedTarget(currentPoints, searchType, targetSearches) {
        const expectedPoints = targetSearches * 5; // 5 points per search
        return currentPoints[searchType] >= expectedPoints;
    }

    // Calculate remaining searches needed
    getRemainingSearches(currentPoints, targetSearches, searchType) {
        const currentSearches = Math.floor(currentPoints[searchType] / 5);
        return Math.max(0, targetSearches - currentSearches);
    }
}

export { SearchValidator };