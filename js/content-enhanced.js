// Enhanced content script with search validation
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => {
        try {
            switch (request.action) {
                case "validateSearch": {
                    const isValid = await validateSearchCounted(request.type);
                    sendResponse({ success: true, counted: isValid });
                    break;
                }

                case "getRewardsProgress": {
                    const progress = await getRewardsProgress();
                    sendResponse(progress);
                    break;
                }

                case "checkLoginStatus": {
                    const status = await checkLoginStatus();
                    sendResponse(status);
                    break;
                }

                case "login": {
                    const mobile = request.mobile;
                    await performLogin(mobile);
                    sendResponse({ success: true });
                    break;
                }

                case "perform": {
                    await performEnhancedSearch(request.query);
                    sendResponse({ success: true });
                    break;
                }

                case "closePopups": {
                    await closeAllPopups();
                    sendResponse({ success: true });
                    break;
                }

                default:
                    sendResponse({ success: false, message: "Unknown action" });
            }
        } catch (error) {
            console.error("Enhanced content script error:", error);
            sendResponse({ success: false, message: error.message });
        }
    })();
    return true;
});

// Validate if search was actually counted by Bing
async function validateSearchCounted(searchType) {
    try {
        // Method 1: Check for search counter indicators on Bing
        const searchCounters = document.querySelectorAll([
            '.b_searchboxForm .b_searchbox',
            '#sb_form_q',
            '.searchbox input',
            '[data-suggestion-type]'
        ].join(','));

        // Method 2: Check URL for search parameters
        const hasSearchParams = window.location.search.includes('q=') || 
                               window.location.href.includes('/search?');

        // Method 3: Check for search results presence
        const hasResults = document.querySelector('#b_results, .b_algo, .b_searchResults') !== null;

        // Method 4: Check for rewards progress indicators (if visible)
        const rewardsIndicator = document.querySelector([
            '.rewards-signin',
            '.id_button',
            '[data-bi-name="rewards"]',
            '.b_rewardsIcon'
        ].join(','));

        // Search is considered valid if:
        // 1. Has search parameters in URL AND
        // 2. Has search results displayed AND
        // 3. No error indicators present
        const isValid = hasSearchParams && hasResults && !hasErrorIndicators();

        console.log(`Search validation for ${searchType}:`, {
            hasSearchParams,
            hasResults,
            isValid,
            url: window.location.href
        });

        return isValid;
    } catch (error) {
        console.error("Search validation error:", error);
        return false;
    }
}

// Check for error indicators that suggest search wasn't counted
function hasErrorIndicators() {
    const errorSelectors = [
        '.b_no_results',
        '.error-page',
        '.b_errorPage',
        '[data-error]',
        '.captcha-container'
    ];

    return errorSelectors.some(selector => document.querySelector(selector) !== null);
}

// Get current rewards progress from page indicators
async function getRewardsProgress() {
    try {
        // Look for rewards progress indicators on Bing pages
        const progressElements = document.querySelectorAll([
            '[data-bi-name="rewards"]',
            '.b_rewardsIcon',
            '.rewards-progress',
            '.points-counter'
        ].join(','));

        // Parse progress from elements or return estimated based on search count
        let desktop = 0;
        let mobile = 0;

        // Try to extract actual progress if available
        progressElements.forEach(element => {
            const text = element.textContent || element.getAttribute('title') || '';
            const desktopMatch = text.match(/desktop.*?(\d+)/i);
            const mobileMatch = text.match(/mobile.*?(\d+)/i);
            
            if (desktopMatch) desktop = parseInt(desktopMatch[1]);
            if (mobileMatch) mobile = parseInt(mobileMatch[1]);
        });

        return { desktop, mobile };
    } catch (error) {
        console.error("Progress check error:", error);
        return { desktop: 0, mobile: 0 };
    }
}

// Check if user is logged in
async function checkLoginStatus() {
    try {
        const loginIndicators = document.querySelectorAll([
            '#id_n',
            '.id_button',
            '[data-bi-name="mecontrol"]',
            '.msame_Header_name',
            '.user-info',
            '#id_rh'
        ].join(','));

        const loggedIn = loginIndicators.length > 0;
        
        return { loggedIn, indicators: loginIndicators.length };
    } catch (error) {
        console.error("Login status check error:", error);
        return { loggedIn: false, indicators: 0 };
    }
}

// Enhanced login with better mobile support
async function performLogin(mobile) {
    try {
        if (mobile) {
            // Enhanced mobile login
            const mobileMenuTrigger = document.querySelector([
                '#mHamburger',
                '.hamburger',
                '[data-bi-name="hamburger"]',
                '.mobile-menu-trigger'
            ].join(','));

            if (mobileMenuTrigger && !document.querySelector('.mobile-menu-open')) {
                mobileMenuTrigger.click();
                await delay(1500);
            }

            const mobileSignIn = document.querySelector([
                '#HBSignIn a[role="menuitem"]:not([style*="display: none"])',
                '.signin-link:not([style*="display: none"])',
                '[data-bi-name="signin"]:not([style*="display: none"])',
                '.mobile-signin'
            ].join(','));

            if (mobileSignIn) {
                await delay(1000);
                mobileSignIn.click();
                console.log("Mobile sign-in triggered");
            }
        } else {
            // Enhanced desktop login
            const desktopSignIn = document.querySelector([
                '#id_s',
                '.id_signin',
                '[data-bi-name="signin"]',
                '.signin-button',
                '.sign-in-link'
            ].join(','));

            if (desktopSignIn) {
                await delay(500);
                desktopSignIn.click();
                console.log("Desktop sign-in triggered");
            }
        }
    } catch (error) {
        console.error("Login error:", error);
    }
}

// Enhanced search performance with validation
async function performEnhancedSearch(query) {
    try {
        const input = document.querySelector('#sb_form_q');
        if (!input) throw new Error("Search input not found");

        // Clear and focus
        input.value = "";
        input.focus();
        
        // Type query with realistic timing
        for (const char of query) {
            input.value += char;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            await delay(30 + Math.floor(Math.random() * 50));
        }
        
        // Trigger change events
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
        
        // Submit search
        const form = input.closest("form");
        const submitButton = document.querySelector([
            '#sb_form_go',
            '.b_searchbox_submit',
            '[type="submit"]'
        ].join(','));
        
        await delay(500 + Math.random() * 500);
        
        if (submitButton && submitButton.offsetParent !== null) {
            submitButton.click();
        } else if (form) {
            form.submit();
        } else {
            // Fallback: Enter key
            input.dispatchEvent(new KeyboardEvent("keydown", {
                key: "Enter",
                code: "Enter",
                keyCode: 13,
                bubbles: true
            }));
        }
        
        console.log(`Enhanced search performed: "${query}"`);
    } catch (error) {
        console.error("Enhanced search error:", error);
        throw error;
    }
}

// Close all popups that might interfere
async function closeAllPopups() {
    try {
        const popupSelectors = [
            '.dashboardPopUpPopUpCloseButton',
            '.popup-close',
            '.modal-close',
            '[data-bi-name="close"]',
            '.close-button',
            '.dismiss-button',
            '.notification-close',
            '.banner-close'
        ];
        
        let closed = 0;
        for (const selector of popupSelectors) {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                if (element.offsetParent !== null) {
                    element.click();
                    closed++;
                }
            });
        }
        
        console.log(`Closed ${closed} popups`);
    } catch (error) {
        console.error("Popup closing error:", error);
    }
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}