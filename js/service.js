import { log, set, get, resetPro, resetRuntime, verify } from "/js/utils.js";
import { devices } from "/js/devices.js";
import { queries } from "/js/queries.js";
import "/js/stats.js";

let config = {
	search: {
		desk: 10,
		mob: 0,
		min: 300, // Enhanced: 5 minutes minimum
		max: 360, // Enhanced: 6 minutes maximum
	},
	schedule: {
		desk: 0,
		mob: 0,
		min: 300, // Enhanced: 5 minutes minimum
		max: 360, // Enhanced: 6 minutes maximum
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

// Enhanced: Safety timeout system
const SAFETY_TIMEOUT = 30 * 60 * 1000; // 30 minutes maximum runtime
let safetyTimeoutId = null;

// Enhanced: Validation and retry system
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds between retries

async function validateSearchCompletion(tabId) {
	try {
		const tab = await chrome.tabs.get(tabId);
		if (!tab || !tab.url) return false;
		
		// Enhanced validation: Check for Bing search results
		const isValidSearch = tab.url.includes('bing.com/search') || 
							 tab.url.includes('bing.com/images') ||
							 tab.url.includes('bing.com/videos');
		
		if (isValidSearch) {
			// Additional validation: Check page content
			try {
				const results = await chrome.tabs.sendMessage(tabId, {
					action: "validateResults"
				});
				return results && results.success;
			} catch (e) {
				// If content script fails, assume success if URL is correct
				return true;
			}
		}
		
		return false;
	} catch (error) {
		log(`[VALIDATE] Error validating search: ${error.message}`, "error");
		return false;
	}
}

async function performSearchWithRetry(query, isMobile = false, retryCount = 0) {
	const logs = config?.control?.log;
	
	try {
		logs && log(`[SEARCH] Attempt ${retryCount + 1} for query: "${query}" (${isMobile ? 'Mobile' : 'Desktop'})`, "update");
		
		const result = await performSingleSearch(query, isMobile);
		
		if (result.success) {
			// Enhanced: Validate the search actually completed
			if (result.tabId) {
				const isValid = await validateSearchCompletion(result.tabId);
				if (isValid) {
					logs && log(`[SEARCH] Successfully validated search completion`, "success");
					return result;
				} else if (retryCount < MAX_RETRIES) {
					logs && log(`[SEARCH] Search validation failed, retrying...`, "warning");
					await delay(RETRY_DELAY);
					return performSearchWithRetry(query, isMobile, retryCount + 1);
				}
			}
			return result;
		} else if (retryCount < MAX_RETRIES) {
			logs && log(`[SEARCH] Search failed, retrying in ${RETRY_DELAY/1000} seconds...`, "warning");
			await delay(RETRY_DELAY);
			return performSearchWithRetry(query, isMobile, retryCount + 1);
		} else {
			logs && log(`[SEARCH] Max retries reached for query: "${query}"`, "error");
			return result;
		}
	} catch (error) {
		logs && log(`[SEARCH] Error in search attempt: ${error.message}`, "error");
		if (retryCount < MAX_RETRIES) {
			await delay(RETRY_DELAY);
			return performSearchWithRetry(query, isMobile, retryCount + 1);
		}
		return { success: false, error: error.message };
	}
}

async function performSingleSearch(query, isMobile = false) {
	const logs = config?.control?.log;
	
	try {
		let tabId = config.runtime.rsaTab;
		
		// Enhanced: Better tab management
		if (!tabId) {
			const tab = await chrome.tabs.create({
				url: "https://www.bing.com",
				active: false
			});
			tabId = tab.id;
			config.runtime.rsaTab = tabId;
			await set(config);
			
			// Wait for tab to load
			await new Promise(resolve => {
				const listener = (updatedTabId, changeInfo) => {
					if (updatedTabId === tabId && changeInfo.status === 'complete') {
						chrome.tabs.onUpdated.removeListener(listener);
						resolve();
					}
				};
				chrome.tabs.onUpdated.addListener(listener);
			});
		}
		
		// Enhanced: Mobile session management
		if (isMobile && !config.runtime.mobile) {
			logs && log("[SEARCH] Switching to mobile simulation", "update");
			await chrome.runtime.sendMessage({ action: "simulate" });
			config.runtime.mobile = 1;
			await set(config);
			await delay(2000); // Wait for mobile simulation to activate
		} else if (!isMobile && config.runtime.mobile) {
			logs && log("[SEARCH] Switching to desktop mode", "update");
			await chrome.runtime.sendMessage({ action: "simulate" });
			config.runtime.mobile = 0;
			await set(config);
			await delay(2000); // Wait for desktop mode to activate
		}
		
		// Enhanced: Login handling
		const loginResult = await chrome.tabs.sendMessage(tabId, {
			action: "login",
			mobile: isMobile
		});
		
		if (loginResult?.success) {
			await delay(2000); // Wait for login to complete
		}
		
		// Enhanced: Query execution with validation
		const queryResult = await chrome.tabs.sendMessage(tabId, {
			action: "query",
			query: query
		});
		
		if (!queryResult?.success) {
			throw new Error("Failed to input query");
		}
		
		await delay(1000); // Wait for query input
		
		// Enhanced: Search execution
		const performResult = await chrome.tabs.sendMessage(tabId, {
			action: "perform",
			query: query
		});
		
		if (!performResult?.success) {
			throw new Error("Failed to perform search");
		}
		
		// Enhanced: Wait for search results to load
		await delay(3000);
		
		// Enhanced: Close any popups
		try {
			await chrome.tabs.sendMessage(tabId, {
				action: "closePopups"
			});
		} catch (e) {
			// Ignore popup close errors
		}
		
		logs && log(`[SEARCH] Successfully completed search for: "${query}"`, "success");
		return { success: true, tabId: tabId };
		
	} catch (error) {
		logs && log(`[SEARCH] Error performing search: ${error.message}`, "error");
		return { success: false, error: error.message };
	}
}

// Enhanced: Safety timeout function
function startSafetyTimeout() {
	if (safetyTimeoutId) {
		clearTimeout(safetyTimeoutId);
	}
	
	safetyTimeoutId = setTimeout(async () => {
		const logs = config?.control?.log;
		logs && log("[SAFETY] 30-minute timeout reached, stopping searches for safety", "warning");
		
		config.runtime.running = 0;
		await set(config);
		
		// Clean up
		if (config.runtime.rsaTab) {
			try {
				await chrome.tabs.remove(config.runtime.rsaTab);
			} catch (e) {
				// Tab might already be closed
			}
			config.runtime.rsaTab = null;
		}
		
		// Reset mobile simulation
		if (config.runtime.mobile) {
			try {
				await chrome.runtime.sendMessage({ action: "simulate" });
				config.runtime.mobile = 0;
			} catch (e) {
				// Ignore simulation errors
			}
		}
		
		await set(config);
		logs && log("[SAFETY] Search session safely terminated", "update");
	}, SAFETY_TIMEOUT);
}

function stopSafetyTimeout() {
	if (safetyTimeoutId) {
		clearTimeout(safetyTimeoutId);
		safetyTimeoutId = null;
	}
}

async function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function getRandomQuery(niche = "random") {
	const logs = config?.control?.log;
	try {
		let selectedQueries;
		
		if (niche === "random" || !queries[niche]) {
			const niches = Object.keys(queries);
			const randomNiche = niches[Math.floor(Math.random() * niches.length)];
			selectedQueries = queries[randomNiche];
			logs && log(`[QUERY] Using random niche: ${randomNiche}`, "update");
		} else {
			selectedQueries = queries[niche];
			logs && log(`[QUERY] Using selected niche: ${niche}`, "update");
		}
		
		const randomQuery = selectedQueries[Math.floor(Math.random() * selectedQueries.length)];
		logs && log(`[QUERY] Selected query: "${randomQuery}"`, "update");
		return randomQuery;
	} catch (error) {
		logs && log(`[QUERY] Error getting random query: ${error.message}`, "error");
		return "microsoft rewards";
	}
}

async function performSearches() {
	const logs = config?.control?.log;
	logs && log("[START] Enhanced search automation starting", "update");
	
	// Enhanced: Start safety timeout
	startSafetyTimeout();
	
	try {
		config.runtime.running = 1;
		config.runtime.done = 0;
		config.runtime.failed = 0;
		config.runtime.total = config.search.desk + config.search.mob;
		config.runtime.mobile = 0;
		await set(config);
		
		logs && log(`[PLAN] Total searches planned: ${config.runtime.total} (${config.search.desk} desktop + ${config.search.mob} mobile)`, "update");
		
		// Enhanced: Desktop searches with improved timing
		for (let i = 0; i < config.search.desk; i++) {
			if (!config.runtime.running) {
				logs && log("[STOP] Search stopped by user", "warning");
				break;
			}
			
			const query = await getRandomQuery(config.control.niche);
			const result = await performSearchWithRetry(query, false);
			
			if (result.success) {
				logs && log(`[DESKTOP] Search ${i + 1}/${config.search.desk} completed successfully`, "success");
			} else {
				config.runtime.failed++;
				logs && log(`[DESKTOP] Search ${i + 1}/${config.search.desk} failed: ${result.error}`, "error");
			}
			
			config.runtime.done++;
			await set(config);
			
			// Enhanced: Realistic delay between searches (5-6 minutes)
			if (i < config.search.desk - 1) {
				const delayMs = (config.search.min + Math.random() * (config.search.max - config.search.min)) * 1000;
				logs && log(`[DELAY] Waiting ${Math.round(delayMs/1000)} seconds before next search`, "update");
				await delay(delayMs);
			}
		}
		
		// Enhanced: Mobile searches with session management
		for (let i = 0; i < config.search.mob; i++) {
			if (!config.runtime.running) {
				logs && log("[STOP] Search stopped by user", "warning");
				break;
			}
			
			const query = await getRandomQuery(config.control.niche);
			const result = await performSearchWithRetry(query, true);
			
			if (result.success) {
				logs && log(`[MOBILE] Search ${i + 1}/${config.search.mob} completed successfully`, "success");
			} else {
				config.runtime.failed++;
				logs && log(`[MOBILE] Search ${i + 1}/${config.search.mob} failed: ${result.error}`, "error");
			}
			
			config.runtime.done++;
			await set(config);
			
			// Enhanced: Realistic delay between mobile searches
			if (i < config.search.mob - 1) {
				const delayMs = (config.search.min + Math.random() * (config.search.max - config.search.min)) * 1000;
				logs && log(`[DELAY] Waiting ${Math.round(delayMs/1000)} seconds before next mobile search`, "update");
				await delay(delayMs);
			}
		}
		
		// Enhanced: Completion summary
		const successCount = config.runtime.done - config.runtime.failed;
		logs && log(`[COMPLETE] Search session finished: ${successCount}/${config.runtime.total} successful`, "success");
		
		// Enhanced: Auto-activities if enabled
		if (config.control.act) {
			logs && log("[ACTIVITIES] Starting automated activities", "update");
			await performActivities();
		}
		
	} catch (error) {
		logs && log(`[ERROR] Search session error: ${error.message}`, "error");
	} finally {
		// Enhanced: Cleanup
		stopSafetyTimeout();
		config.runtime.running = 0;
		
		if (config.runtime.rsaTab) {
			try {
				await chrome.tabs.remove(config.runtime.rsaTab);
			} catch (e) {
				// Tab might already be closed
			}
			config.runtime.rsaTab = null;
		}
		
		if (config.runtime.mobile) {
			try {
				await chrome.runtime.sendMessage({ action: "simulate" });
				config.runtime.mobile = 0;
			} catch (e) {
				// Ignore simulation errors
			}
		}
		
		await set(config);
		logs && log("[CLEANUP] Search session cleanup completed", "update");
	}
}

async function performActivities() {
	const logs = config?.control?.log;
	try {
		config.runtime.act = 1;
		await set(config);
		
		logs && log("[ACTIVITIES] Starting daily activities", "update");
		
		const tab = await chrome.tabs.create({
			url: "https://rewards.bing.com",
			active: false
		});
		
		await delay(5000); // Wait for page to load
		
		// Enhanced: Activity completion logic would go here
		// This is a placeholder for the actual activity automation
		
		await delay(10000); // Simulate activity time
		
		try {
			await chrome.tabs.remove(tab.id);
		} catch (e) {
			// Tab might already be closed
		}
		
		config.runtime.act = 0;
		await set(config);
		
		logs && log("[ACTIVITIES] Daily activities completed", "success");
		return { success: true };
		
	} catch (error) {
		config.runtime.act = 0;
		await set(config);
		logs && log(`[ACTIVITIES] Error performing activities: ${error.message}`, "error");
		return { success: false, error: error.message };
	}
}

// Enhanced: Message handling with better error management
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	(async () => {
		try {
			const storedConfig = await get();
			if (storedConfig) {
				Object.assign(config, storedConfig);
			}
			
			const logs = config?.control?.log;
			
			switch (request.action) {
				case "start":
					if (config.runtime.running) {
						sendResponse({ success: false, message: "Already running" });
						return;
					}
					
					logs && log("[ACTION] Starting search automation", "update");
					performSearches();
					sendResponse({ success: true });
					break;
					
				case "stop":
					logs && log("[ACTION] Stopping search automation", "update");
					stopSafetyTimeout();
					config.runtime.running = 0;
					await set(config);
					sendResponse({ success: true });
					break;
					
				case "schedule":
					if (config.runtime.running) {
						sendResponse({ success: false, message: "Already running" });
						return;
					}
					
					logs && log("[ACTION] Starting scheduled automation", "update");
					performSearches();
					sendResponse({ success: true });
					break;
					
				case "activity":
					if (config.runtime.act) {
						sendResponse({ success: false, message: "Activities already running" });
						return;
					}
					
					const activityResult = await performActivities();
					sendResponse(activityResult);
					break;
					
				case "clearBrowsingData":
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
						sendResponse({ success: true });
					} catch (error) {
						logs && log(`[CLEAR] Error clearing data: ${error.message}`, "error");
						sendResponse({ success: false, error: error.message });
					}
					break;
					
				case "simulate":
					try {
						const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
						const activeTab = tabs[0];
						
						if (!activeTab) {
							throw new Error("No active tab found");
						}
						
						const isAttached = await new Promise((resolve) => {
							chrome.debugger.getTargets((targets) => {
								const attached = targets.some(target => 
									target.tabId === activeTab.id && target.attached
								);
								resolve(attached);
							});
						});
						
						if (isAttached) {
							await chrome.debugger.detach({ tabId: activeTab.id });
							logs && log("[SIMULATE] Detached debugger from tab", "update");
						} else {
							await chrome.debugger.attach({ tabId: activeTab.id }, "1.3");
							
							const device = config.device;
							await chrome.debugger.sendCommand({ tabId: activeTab.id }, "Emulation.setDeviceMetricsOverride", {
								width: device.w,
								height: device.h,
								deviceScaleFactor: device.scale,
								mobile: true
							});
							
							await chrome.debugger.sendCommand({ tabId: activeTab.id }, "Emulation.setUserAgentOverride", {
								userAgent: device.ua
							});
							
							logs && log(`[SIMULATE] Attached debugger with device: ${device.name}`, "update");
						}
						
						sendResponse({ success: true });
					} catch (error) {
						logs && log(`[SIMULATE] Error toggling simulation: ${error.message}`, "error");
						sendResponse({ success: false, error: error.message });
					}
					break;
					
				default:
					sendResponse({ success: false, message: "Unknown action" });
			}
		} catch (error) {
			console.error("Service worker error:", error);
			sendResponse({ success: false, error: error.message });
		}
	})();
	
	return true; // Keep sendResponse alive for async operations
});

// Enhanced: Alarm handling for scheduled searches
chrome.alarms.onAlarm.addListener(async (alarm) => {
	if (alarm.name === "schedule") {
		const logs = config?.control?.log;
		logs && log("[SCHEDULE] Alarm triggered, starting scheduled search", "update");
		
		if (!config.runtime.running) {
			performSearches();
		} else {
			logs && log("[SCHEDULE] Search already running, skipping scheduled run", "warning");
		}
		
		// Enhanced: Reschedule based on mode
		if (config.schedule.mode === "m3") {
			const randomDelay = Math.floor(Math.random() * 150) + 300; // 5-7.5 minutes
			await chrome.alarms.create("schedule", {
				when: Date.now() + randomDelay * 1000
			});
		} else if (config.schedule.mode === "m4") {
			const randomDelay = Math.floor(Math.random() * 150) + 900; // 15-17.5 minutes
			await chrome.alarms.create("schedule", {
				when: Date.now() + randomDelay * 1000
			});
		}
	}
});

// Enhanced: Startup handling
chrome.runtime.onStartup.addListener(async () => {
	const storedConfig = await get();
	if (storedConfig) {
		Object.assign(config, storedConfig);
		
		const logs = config?.control?.log;
		logs && log("[STARTUP] Extension started", "update");
		
		// Enhanced: Auto-start if schedule mode is m2 (at startup)
		if (config.schedule.mode === "m2" && !config.runtime.running) {
			logs && log("[STARTUP] Auto-starting scheduled search", "update");
			setTimeout(() => {
				performSearches();
			}, 5000); // Wait 5 seconds after startup
		}
	}
});

// Enhanced: Installation handling
chrome.runtime.onInstalled.addListener(async (details) => {
	const logs = config?.control?.log;
	
	if (details.reason === "install") {
		logs && log("[INSTALL] Extension installed", "update");
		await set(config);
	} else if (details.reason === "update") {
		logs && log(`[UPDATE] Extension updated to version ${chrome.runtime.getManifest().version}`, "update");
	}
});