import { SearchValidator } from './search-validator.js';
import { devices } from './devices.js';
import { log, get, set } from './utils.js';

class EnhancedSearchService {
    constructor() {
        this.validator = new SearchValidator();
        this.isRunning = false;
        this.currentConfig = null;
        this.sessionData = {
            desktop: { completed: 0, failed: 0, retries: 0 },
            mobile: { completed: 0, failed: 0, retries: 0 }
        };
    }

    async startEnhancedSearch() {
        if (this.isRunning) return { success: false, message: "Already running" };
        
        this.isRunning = true;
        this.currentConfig = await get();
        
        if (!this.currentConfig) {
            this.isRunning = false;
            return { success: false, message: "No configuration found" };
        }

        try {
            // Update runtime status
            this.currentConfig.runtime.running = 1;
            this.currentConfig.runtime.total = this.currentConfig.search.desk + this.currentConfig.search.mob;
            await set(this.currentConfig);

            // Start desktop searches first
            if (this.currentConfig.search.desk > 0) {
                await this.performDesktopSearches();
            }

            // Then mobile searches with enhanced session management
            if (this.currentConfig.search.mob > 0) {
                await this.performMobileSearches();
            }

            // Final validation and cleanup
            await this.finalizeSession();
            
            return { success: true, message: "Enhanced search completed" };
        } catch (error) {
            log(`Enhanced search failed: ${error.message}`, "error");
            return { success: false, message: error.message };
        } finally {
            this.isRunning = false;
            this.currentConfig.runtime.running = 0;
            await set(this.currentConfig);
        }
    }

    async performDesktopSearches() {
        const targetSearches = this.currentConfig.search.desk;
        let completedSearches = 0;
        let attempts = 0;
        const maxAttempts = targetSearches * 2; // Safety limit

        log(`Starting ${targetSearches} desktop searches with validation`, "update");

        while (completedSearches < targetSearches && attempts < maxAttempts) {
            attempts++;
            
            try {
                // Create search tab
                const tab = await this.createSearchTab(false); // false = desktop
                
                // Perform search
                const searchSuccess = await this.performSingleSearch(tab.id, "desktop");
                
                if (searchSuccess) {
                    completedSearches++;
                    this.sessionData.desktop.completed++;
                    this.currentConfig.runtime.done++;
                    
                    log(`Desktop search ${completedSearches}/${targetSearches} validated`, "success");
                } else {
                    this.sessionData.desktop.failed++;
                    this.currentConfig.runtime.failed++;
                    
                    log(`Desktop search attempt ${attempts} failed validation`, "warning");
                }

                // Update progress
                await set(this.currentConfig);
                
                // Close tab and wait
                await chrome.tabs.remove(tab.id);
                await this.randomDelay();
                
            } catch (error) {
                log(`Desktop search error: ${error.message}`, "error");
                this.sessionData.desktop.failed++;
                this.currentConfig.runtime.failed++;
            }
        }

        log(`Desktop searches completed: ${completedSearches}/${targetSearches}`, "update");
    }

    async performMobileSearches() {
        const targetSearches = this.currentConfig.search.mob;
        let completedSearches = 0;
        let attempts = 0;
        const maxAttempts = targetSearches * 2;

        log(`Starting ${targetSearches} mobile searches with enhanced session management`, "update");

        // Enable mobile simulation
        await this.enableMobileSimulation();

        while (completedSearches < targetSearches && attempts < maxAttempts) {
            attempts++;
            
            try {
                // Create mobile search tab
                const tab = await this.createSearchTab(true); // true = mobile
                
                // Enhanced mobile session management
                await this.ensureMobileSession(tab.id);
                
                // Perform search with mobile-specific handling
                const searchSuccess = await this.performSingleSearch(tab.id, "mobile");
                
                if (searchSuccess) {
                    completedSearches++;
                    this.sessionData.mobile.completed++;
                    this.currentConfig.runtime.done++;
                    
                    log(`Mobile search ${completedSearches}/${targetSearches} validated`, "success");
                } else {
                    this.sessionData.mobile.failed++;
                    this.currentConfig.runtime.failed++;
                    
                    log(`Mobile search attempt ${attempts} failed validation`, "warning");
                }

                // Update progress
                await set(this.currentConfig);
                
                // Enhanced mobile delay to prevent auto-signout
                await chrome.tabs.remove(tab.id);
                await this.mobileDelay();
                
            } catch (error) {
                log(`Mobile search error: ${error.message}`, "error");
                this.sessionData.mobile.failed++;
                this.currentConfig.runtime.failed++;
            }
        }

        // Disable mobile simulation
        await this.disableMobileSimulation();
        
        log(`Mobile searches completed: ${completedSearches}/${targetSearches}`, "update");
    }

    async performSingleSearch(tabId, searchType) {
        const maxRetries = this.validator.maxRetries;
        let retryCount = 0;
        
        while (retryCount <= maxRetries) {
            try {
                // Generate and perform search
                const query = await this.generateSearchQuery();
                
                // Execute search
                await chrome.tabs.sendMessage(tabId, {
                    action: "perform",
                    query: query
                });
                
                // Wait for page load
                await this.delay(3000);
                
                // Validate if search was counted
                const isValid = await this.validator.validateSearch(tabId, searchType);
                
                if (isValid) {
                    log(`${searchType} search validated successfully: "${query}"`, "success");
                    return true;
                }
                
                if (retryCount < maxRetries) {
                    retryCount++;
                    log(`${searchType} search not counted, retry ${retryCount}/${maxRetries}`, "warning");
                    await this.delay(this.validator.retryDelay);
                } else {
                    log(`${searchType} search failed after ${maxRetries} retries`, "error");
                    return false;
                }
                
            } catch (error) {
                log(`Search execution error: ${error.message}`, "error");
                if (retryCount >= maxRetries) return false;
                retryCount++;
                await this.delay(this.validator.retryDelay);
            }
        }
        
        return false;
    }

    async ensureMobileSession(tabId) {
        try {
            // Check if logged in
            const loginStatus = await chrome.tabs.sendMessage(tabId, {
                action: "checkLoginStatus"
            });
            
            if (!loginStatus || !loginStatus.loggedIn) {
                // Attempt login
                await chrome.tabs.sendMessage(tabId, {
                    action: "login",
                    mobile: true
                });
                
                // Wait for login to complete
                await this.delay(5000);
            }
            
            // Close any popups that might cause auto-signout
            await chrome.tabs.sendMessage(tabId, {
                action: "closePopups"
            });
            
        } catch (error) {
            log(`Mobile session management error: ${error.message}`, "warning");
        }
    }

    async createSearchTab(isMobile) {
        const url = "https://www.bing.com";
        const tab = await chrome.tabs.create({ url, active: false });
        
        // Wait for tab to load
        await this.delay(2000);
        
        return tab;
    }

    async enableMobileSimulation() {
        try {
            const device = this.currentConfig.device;
            await chrome.debugger.attach({ tabId: this.currentConfig.runtime.rsaTab }, "1.3");
            
            await chrome.debugger.sendCommand({ tabId: this.currentConfig.runtime.rsaTab }, "Emulation.setDeviceMetricsOverride", {
                width: device.w,
                height: device.h,
                deviceScaleFactor: device.scale,
                mobile: true
            });
            
            await chrome.debugger.sendCommand({ tabId: this.currentConfig.runtime.rsaTab }, "Emulation.setUserAgentOverride", {
                userAgent: device.ua
            });
            
            this.currentConfig.runtime.mobile = 1;
            await set(this.currentConfig);
            
        } catch (error) {
            log(`Mobile simulation enable failed: ${error.message}`, "error");
        }
    }

    async disableMobileSimulation() {
        try {
            await chrome.debugger.detach({ tabId: this.currentConfig.runtime.rsaTab });
            this.currentConfig.runtime.mobile = 0;
            await set(this.currentConfig);
        } catch (error) {
            log(`Mobile simulation disable failed: ${error.message}`, "error");
        }
    }

    async generateSearchQuery() {
        // Use existing query generation logic
        const queries = await import('./queries.js');
        const niche = this.currentConfig.control.niche || 'random';
        
        if (niche === 'random') {
            const niches = ['anime', 'tech', 'travel', 'movie', 'education', 'music'];
            const randomNiche = niches[Math.floor(Math.random() * niches.length)];
            return queries.getRandomQuery(randomNiche);
        }
        
        return queries.getRandomQuery(niche);
    }

    async randomDelay() {
        const min = this.currentConfig.search.min * 1000;
        const max = this.currentConfig.search.max * 1000;
        const delay = Math.floor(Math.random() * (max - min + 1)) + min;
        await this.delay(delay);
    }

    async mobileDelay() {
        // Enhanced delay for mobile to prevent auto-signout
        const baseDelay = Math.max(45000, this.currentConfig.search.min * 1000); // Minimum 45 seconds
        const maxDelay = Math.max(90000, this.currentConfig.search.max * 1000); // Minimum 90 seconds
        const delay = Math.floor(Math.random() * (maxDelay - baseDelay + 1)) + baseDelay;
        await this.delay(delay);
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async finalizeSession() {
        // Log session summary
        const desktop = this.sessionData.desktop;
        const mobile = this.sessionData.mobile;
        
        log(`Session Summary:`, "update");
        log(`Desktop: ${desktop.completed} completed, ${desktop.failed} failed`, "update");
        log(`Mobile: ${mobile.completed} completed, ${mobile.failed} failed`, "update");
        
        // Reset session data
        this.sessionData = {
            desktop: { completed: 0, failed: 0, retries: 0 },
            mobile: { completed: 0, failed: 0, retries: 0 }
        };
    }
}

export { EnhancedSearchService };