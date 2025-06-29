// Recovery mode for restricted accounts
class RecoveryMode {
    constructor() {
        this.isRecoveryMode = false;
        this.recoverySettings = {
            maxDailySearches: 15,
            minDelay: 600000, // 10 minutes
            maxDelay: 900000, // 15 minutes
            enableValidation: true,
            enableRetries: false,
            mobileEnabled: false
        };
    }

    // Enable recovery mode
    async enableRecoveryMode(config) {
        this.isRecoveryMode = true;
        
        // Apply ultra-conservative settings
        config.search.desk = 10;
        config.search.mob = 0; // Disable mobile completely
        config.search.min = 600; // 10 minutes
        config.search.max = 900; // 15 minutes
        
        // Disable risky features
        config.control.clear = 0;
        config.control.act = 0;
        config.schedule.mode = "m1"; // Manual only
        
        console.log("Recovery mode enabled - ultra-conservative settings applied");
        return config;
    }

    // Check if account shows signs of restriction
    async checkAccountHealth(tabId) {
        try {
            const result = await chrome.tabs.sendMessage(tabId, {
                action: "checkAccountRestriction"
            });
            
            return {
                isRestricted: result.restricted || false,
                warningLevel: result.warningLevel || 0,
                canProceed: !result.restricted
            };
        } catch (error) {
            console.error("Account health check failed:", error);
            return { isRestricted: true, warningLevel: 3, canProceed: false };
        }
    }

    // Gradual recovery protocol
    getRecoveryPhase(daysInRecovery) {
        if (daysInRecovery <= 7) {
            return {
                phase: 1,
                description: "Manual searches only",
                maxSearches: 5,
                automationAllowed: false
            };
        } else if (daysInRecovery <= 14) {
            return {
                phase: 2,
                description: "Very limited automation",
                maxSearches: 10,
                automationAllowed: true,
                minDelay: 600
            };
        } else if (daysInRecovery <= 21) {
            return {
                phase: 3,
                description: "Conservative automation",
                maxSearches: 20,
                automationAllowed: true,
                minDelay: 300
            };
        } else {
            return {
                phase: 4,
                description: "Normal operation with caution",
                maxSearches: 30,
                automationAllowed: true,
                minDelay: 180
            };
        }
    }
}

export { RecoveryMode };