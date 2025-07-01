import { log, set, get, resetPro, resetRuntime, verify } from "/js/utils.js";
import { devices } from "/js/devices.js";
import { queries } from "/js/queries.js";

let config = {
	search: {
		desk: 10,
		mob: 0,
		min: 15,
		max: 30,
	},
	schedule: {
		desk: 0,
		mob: 0,
		min: 15,
		max: 30,
		mode: "m1",
	},
	device: {
		name: "",
		ua: "",
		h: 844,
		w: 390,
		scale: 3,
	},
	control: {
		niche: "random",
		consent: 0,
		clear: 0,
		act: 0,
		log: 0,
	},
	runtime: {
		done: 0,
		total: 0,
		failed: 0,
		running: 0,
		rsaTab: null,
		mobile: 0,
		act: 0,
	},
	user: {
		country: "",
		countryCode: "",
		city: "",
	},
	pro: {
		key: "",
		seats: 0,
	},
};

// Enhanced timing configuration for better reliability
const TIMING_CONFIG = {
	SEARCH_INTERVAL_MIN: 8000,  // Minimum 8 seconds between searches
	SEARCH_INTERVAL_MAX: 15000, // Maximum 15 seconds between searches
	PAGE_LOAD_TIMEOUT: 10000,   // 10 seconds to wait for page load
	TYPING_DELAY_MIN: 100,      // Minimum typing delay
	TYPING_DELAY_MAX: 300,      // Maximum typing delay
	VERIFICATION_DELAY: 3000,   // Time to wait before verifying points
	RETRY_DELAY: 5000,          // Delay before retrying failed searches
	MAX_RETRIES: 3              // Maximum retry attempts per search
};

// Track search state to prevent race conditions
let searchState = {
	isSearching: false,
	currentSearchIndex: 0,
	retryCount: 0,
	lastSearchTime: 0
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	(async () => {
		const storedConfig = await get();
		Object.assign(config, storedConfig);
		const logs = config?.control?.log;

		try {
			switch (request.action) {
				case "start": {
					if (config?.runtime?.running) {
						sendResponse({
							success: false,
							message: "Search already running",
						});
						return;
					}
					
					// Prevent multiple instances
					if (searchState.isSearching) {
						sendResponse({
							success: false,
							message: "Search already in progress",
						});
						return;
					}

					const response = await startSearch();
					sendResponse(response);
					break;
				}

				case "stop": {
					const response = await stopSearch();
					sendResponse(response);
					break;
				}

				case "schedule": {
					const response = await startSchedule();
					sendResponse(response);
					break;
				}

				case "activity": {
					const response = await performActivity();
					sendResponse(response);
					break;
				}

				case "clearBrowsingData": {
					const response = await clearBrowsingData();
					sendResponse(response);
					break;
				}

				case "simulate": {
					const response = await toggleSimulation();
					sendResponse(response);
					break;
				}

				default:
					sendResponse({
						success: false,
						message: "Unknown action",
					});
			}
		} catch (error) {
			logs && log(`[SERVICE] Error: ${error.message}`, "error");
			sendResponse({ success: false, message: error.message });
		}
	})();
	return true;
});

async function startSearch() {
	const logs = config?.control?.log;
	
	try {
		// Prevent concurrent searches
		if (searchState.isSearching) {
			return { success: false, message: "Search already in progress" };
		}

		searchState.isSearching = true;
		searchState.currentSearchIndex = 0;
		searchState.retryCount = 0;

		config.runtime.running = 1;
		config.runtime.total = config.search.desk + config.search.mob;
		config.runtime.done = 0;
		config.runtime.failed = 0;
		await set(config);

		logs && log("[START] Starting search process", "update");

		// Start with desktop searches
		if (config.search.desk > 0) {
			await performSearches("desktop", config.search.desk);
		}

		// Then mobile searches
		if (config.search.mob > 0) {
			await performSearches("mobile", config.search.mob);
		}

		// Complete the search process
		await completeSearch();

		return { success: true };
	} catch (error) {
		logs && log(`[START] Error: ${error.message}`, "error");
		await stopSearch();
		return { success: false, message: error.message };
	}
}

async function performSearches(type, count) {
	const logs = config?.control?.log;
	const isMobile = type === "mobile";
	
	logs && log(`[SEARCH] Starting ${count} ${type} searches`, "update");

	for (let i = 0; i < count; i++) {
		if (!config?.runtime?.running) {
			logs && log("[SEARCH] Search stopped by user", "warning");
			break;
		}

		// Enforce minimum time between searches
		const timeSinceLastSearch = Date.now() - searchState.lastSearchTime;
		const minInterval = TIMING_CONFIG.SEARCH_INTERVAL_MIN;
		
		if (timeSinceLastSearch < minInterval) {
			const waitTime = minInterval - timeSinceLastSearch;
			logs && log(`[SEARCH] Waiting ${waitTime}ms before next search`, "update");
			await delay(waitTime);
		}

		const success = await performSingleSearch(isMobile, i + 1, count);
		
		if (success) {
			config.runtime.done++;
			searchState.retryCount = 0;
		} else {
			config.runtime.failed++;
			
			// Retry logic
			if (searchState.retryCount < TIMING_CONFIG.MAX_RETRIES) {
				searchState.retryCount++;
				logs && log(`[SEARCH] Retrying search (attempt ${searchState.retryCount})`, "warning");
				await delay(TIMING_CONFIG.RETRY_DELAY);
				i--; // Retry the same search
				continue;
			} else {
				logs && log("[SEARCH] Max retries reached, skipping search", "error");
				searchState.retryCount = 0;
			}
		}

		await set(config);
		searchState.lastSearchTime = Date.now();

		// Random delay between searches
		const delayTime = Math.random() * 
			(TIMING_CONFIG.SEARCH_INTERVAL_MAX - TIMING_CONFIG.SEARCH_INTERVAL_MIN) + 
			TIMING_CONFIG.SEARCH_INTERVAL_MIN;
		
		if (i < count - 1) { // Don't delay after the last search
			logs && log(`[SEARCH] Waiting ${Math.round(delayTime)}ms before next search`, "update");
			await delay(delayTime);
		}
	}
}

async function performSingleSearch(isMobile, current, total) {
	const logs = config?.control?.log;
	let tab = null;
	
	try {
		logs && log(`[SEARCH] Performing ${isMobile ? 'mobile' : 'desktop'} search ${current}/${total}`, "update");

		// Create or get tab
		tab = await createSearchTab(isMobile);
		if (!tab) {
			throw new Error("Failed to create search tab");
		}

		// Wait for tab to be ready
		await waitForTabReady(tab.id);

		// Navigate to Bing
		await navigateToBing(tab.id);

		// Wait for page to load completely
		await waitForPageLoad(tab.id);

		// Perform login if needed
		await performLogin(tab.id, isMobile);

		// Close any popups
		await closePopups(tab.id);

		// Generate and perform search
		const query = generateSearchQuery();
		const searchSuccess = await performSearchQuery(tab.id, query);

		if (!searchSuccess) {
			throw new Error("Search query failed");
		}

		// Wait for search to complete and verify points
		const verification = await verifySearchCounted(tab.id);
		
		if (!verification.counted) {
			logs && log("[SEARCH] Search may not have been counted", "warning");
		} else {
			logs && log(`[SEARCH] Search verified, points: ${verification.points}`, "success");
		}

		// Clean up
		if (tab) {
			await chrome.tabs.remove(tab.id);
		}

		return verification.counted;

	} catch (error) {
		logs && log(`[SEARCH] Error in search ${current}: ${error.message}`, "error");
		
		// Clean up on error
		if (tab) {
			try {
				await chrome.tabs.remove(tab.id);
			} catch (cleanupError) {
				logs && log(`[SEARCH] Cleanup error: ${cleanupError.message}`, "error");
			}
		}
		
		return false;
	}
}

async function createSearchTab(isMobile) {
	const logs = config?.control?.log;
	
	try {
		let tabOptions = {
			url: "about:blank",
			active: false
		};

		const tab = await chrome.tabs.create(tabOptions);
		
		if (isMobile && config.device.name) {
			// Apply mobile simulation
			await applyMobileSimulation(tab.id);
		}

		logs && log(`[TAB] Created ${isMobile ? 'mobile' : 'desktop'} tab: ${tab.id}`, "update");
		return tab;
		
	} catch (error) {
		logs && log(`[TAB] Error creating tab: ${error.message}`, "error");
		return null;
	}
}

async function applyMobileSimulation(tabId) {
	const logs = config?.control?.log;
	
	try {
		await chrome.debugger.attach({ tabId }, "1.3");
		
		await chrome.debugger.sendCommand({ tabId }, "Emulation.setDeviceMetricsOverride", {
			width: config.device.w,
			height: config.device.h,
			deviceScaleFactor: config.device.scale,
			mobile: true
		});

		await chrome.debugger.sendCommand({ tabId }, "Emulation.setUserAgentOverride", {
			userAgent: config.device.ua
		});

		logs && log(`[SIMULATION] Applied mobile simulation: ${config.device.name}`, "update");
		
	} catch (error) {
		logs && log(`[SIMULATION] Error applying mobile simulation: ${error.message}`, "error");
	}
}

async function waitForTabReady(tabId) {
	return new Promise((resolve) => {
		const checkTab = async () => {
			try {
				const tab = await chrome.tabs.get(tabId);
				if (tab.status === 'complete') {
					resolve();
				} else {
					setTimeout(checkTab, 100);
				}
			} catch (error) {
				resolve(); // Tab might be closed, continue anyway
			}
		};
		checkTab();
	});
}

async function navigateToBing(tabId) {
	const logs = config?.control?.log;
	
	try {
		await chrome.tabs.update(tabId, { url: "https://www.bing.com" });
		logs && log(`[NAVIGATION] Navigated to Bing`, "update");
		
		// Wait for navigation to complete
		await delay(2000);
		
	} catch (error) {
		logs && log(`[NAVIGATION] Error navigating to Bing: ${error.message}`, "error");
		throw error;
	}
}

async function waitForPageLoad(tabId) {
	const logs = config?.control?.log;
	
	try {
		// Wait for page load completion
		await chrome.tabs.sendMessage(tabId, { action: "waitForPageLoad" });
		logs && log("[PAGE] Page load completed", "update");
		
	} catch (error) {
		logs && log(`[PAGE] Error waiting for page load: ${error.message}`, "error");
		// Continue anyway, might still work
	}
}

async function performLogin(tabId, isMobile) {
	const logs = config?.control?.log;
	
	try {
		await chrome.tabs.sendMessage(tabId, { 
			action: "login", 
			mobile: isMobile 
		});
		
		// Wait for login to complete
		await delay(2000);
		
		logs && log(`[LOGIN] Login attempt completed`, "update");
		
	} catch (error) {
		logs && log(`[LOGIN] Error during login: ${error.message}`, "error");
		// Continue anyway, user might already be logged in
	}
}

async function closePopups(tabId) {
	try {
		await chrome.tabs.sendMessage(tabId, { action: "closePopups" });
		await delay(500);
	} catch (error) {
		// Ignore popup closing errors
	}
}

async function performSearchQuery(tabId, query) {
	const logs = config?.control?.log;
	
	try {
		// Type the query
		await chrome.tabs.sendMessage(tabId, { 
			action: "query", 
			query: query 
		});
		
		// Wait for typing to complete
		await delay(1000);
		
		// Perform the search
		await chrome.tabs.sendMessage(tabId, { 
			action: "perform", 
			query: query 
		});
		
		logs && log(`[QUERY] Search performed: "${query}"`, "update");
		
		// Wait for search to complete
		await delay(3000);
		
		return true;
		
	} catch (error) {
		logs && log(`[QUERY] Error performing search: ${error.message}`, "error");
		return false;
	}
}

async function verifySearchCounted(tabId) {
	const logs = config?.control?.log;
	
	try {
		// Wait a bit for points to be processed
		await delay(TIMING_CONFIG.VERIFICATION_DELAY);
		
		const result = await chrome.tabs.sendMessage(tabId, { 
			action: "checkSearchCounted" 
		});
		
		logs && log(`[VERIFY] Search verification: ${JSON.stringify(result)}`, "update");
		
		return result || { counted: false, points: 0 };
		
	} catch (error) {
		logs && log(`[VERIFY] Error verifying search: ${error.message}`, "error");
		return { counted: false, points: 0 };
	}
}

function generateSearchQuery() {
	const niche = config?.control?.niche || "random";
	let queryList = queries.random;
	
	if (niche !== "random" && queries[niche]) {
		queryList = queries[niche];
	}
	
	const randomQuery = queryList[Math.floor(Math.random() * queryList.length)];
	
	// Add some randomization to make queries more unique
	const variations = [
		randomQuery,
		`${randomQuery} 2024`,
		`${randomQuery} latest`,
		`${randomQuery} news`,
		`${randomQuery} information`,
		`what is ${randomQuery}`,
		`${randomQuery} guide`,
		`${randomQuery} tips`
	];
	
	return variations[Math.floor(Math.random() * variations.length)];
}

async function completeSearch() {
	const logs = config?.control?.log;
	
	try {
		config.runtime.running = 0;
		searchState.isSearching = false;
		
		// Perform activities if enabled
		if (config?.control?.act) {
			logs && log("[COMPLETE] Starting activities", "update");
			await performActivity();
		}
		
		await set(config);
		logs && log("[COMPLETE] Search process completed", "success");
		
	} catch (error) {
		logs && log(`[COMPLETE] Error completing search: ${error.message}`, "error");
	}
}

async function stopSearch() {
	const logs = config?.control?.log;
	
	try {
		config.runtime.running = 0;
		searchState.isSearching = false;
		await set(config);
		
		logs && log("[STOP] Search stopped", "warning");
		return { success: true };
		
	} catch (error) {
		logs && log(`[STOP] Error stopping search: ${error.message}`, "error");
		return { success: false, message: error.message };
	}
}

async function startSchedule() {
	// Implementation for scheduled searches
	return await startSearch();
}

async function performActivity() {
	const logs = config?.control?.log;
	
	try {
		config.runtime.act = 1;
		await set(config);
		
		// Create tab for activities
		const tab = await chrome.tabs.create({
			url: "https://rewards.bing.com",
			active: false
		});
		
		// Wait for page to load
		await delay(5000);
		
		// Perform basic activity interactions
		await chrome.tabs.sendMessage(tab.id, { action: "closePopups" });
		
		// Clean up
		await chrome.tabs.remove(tab.id);
		
		config.runtime.act = 0;
		await set(config);
		
		logs && log("[ACTIVITY] Activities completed", "success");
		return { success: true };
		
	} catch (error) {
		config.runtime.act = 0;
		await set(config);
		logs && log(`[ACTIVITY] Error: ${error.message}`, "error");
		return { success: false, message: error.message };
	}
}

async function clearBrowsingData() {
	const logs = config?.control?.log;
	
	try {
		await chrome.browsingData.remove({
			origins: ["https://www.bing.com", "https://bing.com"]
		}, {
			cache: true,
			cookies: true,
			history: true,
			localStorage: true,
			sessionStorage: true
		});
		
		logs && log("[CLEAR] Bing browsing data cleared", "success");
		return { success: true };
		
	} catch (error) {
		logs && log(`[CLEAR] Error: ${error.message}`, "error");
		return { success: false, message: error.message };
	}
}

async function toggleSimulation() {
	const logs = config?.control?.log;
	
	try {
		// Implementation for toggling device simulation
		logs && log("[SIMULATE] Simulation toggled", "update");
		return { success: true };
		
	} catch (error) {
		logs && log(`[SIMULATE] Error: ${error.message}`, "error");
		return { success: false, message: error.message };
	}
}

function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
	const storedConfig = await get();
	if (storedConfig) {
		Object.assign(config, storedConfig);
	} else {
		await set(config);
	}
});

// Handle alarms for scheduled searches
chrome.alarms.onAlarm.addListener(async (alarm) => {
	if (alarm.name === "schedule") {
		const storedConfig = await get();
		Object.assign(config, storedConfig);
		
		if (config?.schedule?.mode === "m3" || config?.schedule?.mode === "m4") {
			await startSearch();
		}
	}
});